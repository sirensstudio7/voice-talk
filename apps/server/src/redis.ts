import { RedisClient } from "bun";
import { env } from "./env.js";

/**
 * Shared Redis state for anything that must agree across API instances:
 * rate limits and background-job locks.
 *
 * The URL selects the transport: `rediss://` for managed services such as
 * Upstash, `redis://` for local development.
 */
export const redis = new RedisClient(env.REDIS_URL);

const RATE_LIMIT_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/**
 * Fixed-window counter shared by every instance. Fails open with a warning:
 * a Redis outage must not lock users out of login or kiosk unlock.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const count = Number(
      await redis.send("EVAL", [RATE_LIMIT_SCRIPT, "1", key, String(windowMs)]),
    );
    return count <= limit;
  } catch (error) {
    console.warn(
      `[redis] rate limit unavailable for ${key}: ${error instanceof Error ? error.message : error}`,
    );
    return true;
  }
}

/**
 * Run a scheduled job on exactly one instance. Skipped (with a warning) when
 * the lock cannot be taken, so horizontal scaling never double-runs a sweep.
 */
export async function withJobLock(
  name: string,
  ttlMs: number,
  job: () => Promise<void>,
): Promise<boolean> {
  const key = `jobs:lock:${name}`;
  const token = crypto.randomUUID();
  try {
    const acquired = await redis.set(key, token, "NX", "PX", String(ttlMs));
    if (acquired !== "OK") return false;
  } catch (error) {
    console.warn(
      `[redis] job lock unavailable for ${name}: ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }

  try {
    await job();
    return true;
  } finally {
    await redis.send("EVAL", [RELEASE_LOCK_SCRIPT, "1", key, token]).catch(() => undefined);
  }
}

type RedisHealth = { online: boolean; latencyMs: number | null };

let cachedHealth: RedisHealth | null = null;
let cachedAt = 0;

/** Cached PING for /health; avoids a round trip on every request. */
export async function checkRedisHealth(force = false): Promise<RedisHealth> {
  const now = Date.now();
  if (!force && cachedHealth && now - cachedAt < 15_000) {
    return cachedHealth;
  }

  const started = Date.now();
  try {
    const pong = await redis.send("PING", []);
    cachedHealth = {
      online: String(pong).toUpperCase() === "PONG",
      latencyMs: Date.now() - started,
    };
  } catch {
    cachedHealth = { online: false, latencyMs: null };
  }
  cachedAt = Date.now();
  return cachedHealth;
}

/** Closes the shared Redis connection during shutdown. */
export function closeRedis(): void {
  redis.close();
}
