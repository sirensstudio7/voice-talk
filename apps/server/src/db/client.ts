import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

export type AppDb = PostgresJsDatabase<typeof schema>;

const usesSupabasePooler =
  env.DATABASE_URL.includes(":6543/") || env.DATABASE_URL.includes("pooler.supabase.com");

const usesTransactionPooler = env.DATABASE_URL.includes(":6543/");

if (usesTransactionPooler) {
  console.warn(
    "[db] DATABASE_URL uses Supabase transaction pooler (:6543). " +
      "Prefer session pooler (:5432) for the Node API to avoid stuck connections.",
  );
}

function createSqlClient(): Sql {
  return postgres(env.DATABASE_URL, {
    // Transaction pooler cannot multiplex; session pooler can hold a few.
    prepare: false,
    max: usesTransactionPooler ? 1 : usesSupabasePooler ? 4 : 10,
    connect_timeout: 10,
    // Recycle idle / old sockets so a bad pooler connection cannot linger.
    idle_timeout: usesTransactionPooler ? 5 : 20,
    max_lifetime: usesTransactionPooler ? 60 : 60 * 5,
    // Fail stuck queries instead of holding pool slots forever (login/UI hang).
    connection: {
      statement_timeout: usesSupabasePooler ? 10_000 : 20_000,
    },
  });
}

let client = createSqlClient();
export let db: AppDb = drizzle(client, { schema });

let resetting: Promise<void> | null = null;

/** Drop and recreate the shared pool when queries start hanging. */
export async function resetDbPool(reason: string): Promise<void> {
  if (resetting) return resetting;

  resetting = (async () => {
    console.warn(`[db] resetting shared pool: ${reason}`);
    const old = client;
    client = createSqlClient();
    db = drizzle(client, { schema });
    await old.end({ timeout: 2 }).catch(() => {
      // Ignore — sockets may already be dead.
    });
  })().finally(() => {
    resetting = null;
  });

  return resetting;
}

/** Race a DB operation; reset the shared pool if it stalls. */
export async function withDbTimeout<T>(
  fn: (database: AppDb) => Promise<T>,
  timeoutMs = 12_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(db),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(
            "Database query timed out. Please retry in a moment.",
          ) as Error & { statusCode: number };
          err.statusCode = 503;
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      (/timed out|CONNECT_TIMEOUT|ECONNRESET|connection/i.test(error.message) ||
        (error as Error & { statusCode?: number }).statusCode === 503)
    ) {
      void resetDbPool(error.message);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Background probe so a wedged pool is recycled even without traffic. */
export function startDbPoolWatchdog(intervalMs = 30_000): void {
  const tick = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Must be longer than a busy Super Admin dashboard burst. A 5s probe
      // was resetting live queries and every page then reported a DB timeout.
      await Promise.race([
        client`select 1`,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Shared pool watchdog timed out")), 20_000);
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "watchdog failed";
      void resetDbPool(message);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  setInterval(() => {
    void tick();
  }, intervalMs);
}

export async function closeDb(): Promise<void> {
  await client.end();
}
