import { SQL } from "bun";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { env } from "../env.js";
import { logger } from "../http/logger.js";
import * as schema from "./schema.js";

const log = logger.child({ component: "db" });

export type AppDb = BunSQLDatabase<typeof schema>;
/** Transaction handle derived from the client, so helpers can take either. */
export type AppTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
export type DbClient = AppDb | AppTx;

function createSqlClient(): SQL {
  return new SQL({
    url: env.DATABASE_URL,
    // Transaction poolers (PgBouncer) cannot keep prepared statements across
    // checkouts. Disabling them everywhere means one configuration works on a
    // direct connection and through the pooler alike.
    prepare: false,
    max: env.DB_POOL_MAX,
    connectionTimeout: 25,
    // Recycle idle / old sockets so a bad pooler connection cannot linger.
    idleTimeout: 20,
    maxLifetime: 60 * 5,
    // Fail stuck queries instead of holding pool slots forever (login/UI hang).
    connection: {
      statement_timeout: 20_000,
      // Visible as the application_name in pg_stat_activity.
      application_name: "voice-talk-api",
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
    log.warn({ reason }, "db.pool.reset");
    const old = client;
    client = createSqlClient();
    db = drizzle(client, { schema });
    await old.close({ timeout: 2 }).catch(() => {
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
        client.unsafe("select 1"),
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
  await client.close();
}
