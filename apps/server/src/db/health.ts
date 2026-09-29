import { getDbPoolClient } from "./client.js";
import { logger } from "../http/logger.js";
import { inc } from "../http/metrics.js";

const log = logger.child({ component: "db" });

export type DbHealth = {
  online: boolean;
  latencyMs: number | null;
  error?: string;
};

const SUCCESS_CACHE_TTL_MS = 15_000;
const FAILURE_CACHE_TTL_MS = 2_000;

let cachedHealth: DbHealth | null = null;
let cachedAt = 0;
let inflightCheck: Promise<DbHealth> | null = null;

/**
 * Ping through the shared pool.
 *
 * TKT-021: this used to create a disposable 1-connection client per check,
 * which opened and closed a fresh Postgres connection on every probe (up to
 * 4/min per pod) — needless churn against a 20-connection plan and another
 * victim of Bun's connection-timer bug. `select 1` is tiny; if the pool is
 * genuinely wedged the watchdog and statement_timeout recycle it.
 */
async function pingDb(timeoutMs: number): Promise<DbHealth> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      getDbPoolClient().unsafe("select 1"),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Database ping timed out")),
          timeoutMs,
        );
      }),
    ]);

    inc("db.health_ping_total");
    return { online: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      online: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : "Database unreachable",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkDbHealth(timeoutMs = 5000, force = false): Promise<DbHealth> {
  const now = Date.now();
  if (!force && cachedHealth) {
    const ttl = cachedHealth.online ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS;
    if (now - cachedAt < ttl) {
      return cachedHealth;
    }
  }

  if (!force && inflightCheck) {
    return inflightCheck;
  }

  const check = pingDb(timeoutMs).then((result) => {
    cachedHealth = result;
    cachedAt = Date.now();
    return result;
  });

  if (!force) {
    inflightCheck = check;
  }

  try {
    return await check;
  } finally {
    if (inflightCheck === check) {
      inflightCheck = null;
    }
  }
}

export async function warmDbConnection(): Promise<void> {
  const health = await checkDbHealth(15_000, true);
  if (!health.online) {
    log.warn({ error: health.error ?? "unknown error" }, "db.warmup_failed");
    return;
  }
  log.info({ latencyMs: health.latencyMs }, "db.connected");
}
