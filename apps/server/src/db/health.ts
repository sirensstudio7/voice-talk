import { SQL } from "bun";
import { env } from "../env.js";

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
 * Ping with a disposable 1-connection client.
 *
 * Important: never race `db.execute` on the shared pool — a timed-out query
 * keeps holding a pool slot and will exhaust max connections (common with
 * transaction poolers).
 */
async function pingDb(timeoutMs: number): Promise<DbHealth> {
  const started = Date.now();
  const connectTimeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));

  const ping = new SQL({
    url: env.DATABASE_URL,
    prepare: false,
    max: 1,
    connectionTimeout: connectTimeoutSec,
    idleTimeout: 1,
    maxLifetime: 5,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      ping.unsafe("select 1"),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Database ping timed out")),
          timeoutMs,
        );
      }),
    ]);

    return { online: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      online: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : "Database unreachable",
    };
  } finally {
    if (timer) clearTimeout(timer);
    await ping.close({ timeout: 1 }).catch(() => {
      // Ignore close errors — connection may already be dead.
    });
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
    console.warn(`Database warmup failed: ${health.error ?? "unknown error"}`);
    return;
  }
  console.info(`Database connected (${health.latencyMs}ms)`);
}
