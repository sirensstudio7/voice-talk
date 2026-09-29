import { SQL } from "bun";
import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { env } from "../env.js";
import { logger } from "../http/logger.js";
import { inc } from "../http/metrics.js";
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
    // Deliberately NO idleTimeout / maxLifetime: Bun's client timers hard-fail
    // in-flight queries instead of draining them ("Max lifetime timeout reached
    // after 5m", ERR_POSTGRES_LIFETIME_TIMEOUT — oven-sh/bun#30646; fix PRs
    // #28587/#28591/#30648 are unmerged as of Bun 1.4.2). Connections are
    // bounded by `max`; a wedged pool is handled by statement_timeout below,
    // the pool watchdog, and resetDbPool.
    connection: {
      statement_timeout: 20_000,
      // Visible as the application_name in pg_stat_activity.
      application_name: "voice-talk-api",
    },
  });
}

let client = createSqlClient();
export let db: AppDb = drizzle(client, { schema });

/**
 * Direct access to the current pooled client (TKT-021). Used by the health
 * probe so it does not open a fresh Postgres connection per check; callers must
 * not trigger `resetDbPool` from here.
 */
export function getDbPoolClient(): SQL {
  return client;
}

let resetting: Promise<void> | null = null;

/** Drop and recreate the shared pool when queries start hanging. */
export async function resetDbPool(reason: string): Promise<void> {
  if (resetting) return resetting;

  resetting = (async () => {
    log.warn({ reason }, "db.pool.reset");
    inc("db.pool_reset_total");
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
      (/timed out|CONNECT_TIMEOUT|ECONNRESET|connection|ERR_POSTGRES_LIFETIME_TIMEOUT|ERR_POSTGRES_IDLE_TIMEOUT/i.test(
        error.message,
      ) ||
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
