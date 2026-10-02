import { RedisClient } from "bun";
import { env } from "./env.js";
import { logger } from "./http/logger.js";
import { inc } from "./http/metrics.js";

const log = logger.child({ component: "redis" });

/**
 * Shared Redis state for anything that must agree across API instances:
 * rate limits and background-job locks.
 *
 * The URL selects the transport: `rediss://` for managed services such as
 * Upstash, `redis://` for local development.
 *
 * Bun can give up reconnecting after the server closes the socket (managed
 * Redis closes idle connections) and then no command ever succeeds again: rate
 * limits fail open and every job tick logs `redis.job_lock_unavailable`. The
 * onclose handler below revives the client with capped backoff, the same
 * workaround the kiosk bus applies to its subscriber.
 */
export const redis = new RedisClient(env.REDIS_URL);

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 30_000;

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = RECONNECT_MIN_MS;
let closing = false;
let sawClose = false;

function scheduleReconnect(): void {
  if (closing || reconnectTimer) return;
  const delay = reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (closing) return;
    redis.connect().then(
      () => {
        reconnectDelayMs = RECONNECT_MIN_MS;
      },
      (err) => {
        log.warn({ err }, "redis.reconnect_failed");
        scheduleReconnect();
      },
    );
  }, delay);
}

redis.onclose = (error) => {
  if (closing) return;
  sawClose = true;
  log.warn({ err: error }, "redis.connection_closed");
  scheduleReconnect();
};

redis.onconnect = () => {
  reconnectDelayMs = RECONNECT_MIN_MS;
  if (sawClose) {
    sawClose = false;
    inc("redis.reconnects_total");
    log.info("redis.reconnected");
  }
};

const RATE_LIMIT_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n
`;

/**
 * Client-side command accounting so the Upstash budget is visible on
 * `/health?metrics=1` instead of discovered at the quota limit (TKT-020).
 * One command attempt = one count, successful or not.
 */
export function countRedisCommand(purpose: string): void {
  inc("redis.commands_total");
  inc(`redis.commands.${purpose}_total`);
}

/**
 * Fixed-window counter shared by every instance. Fails open with a warning:
 * a Redis outage must not lock users out of login or kiosk unlock.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  countRedisCommand("rate_limit");
  try {
    const count = Number(
      await redis.send("EVAL", [RATE_LIMIT_SCRIPT, "1", key, String(windowMs)]),
    );
    return count <= limit;
  } catch (error) {
    inc("redis.rate_limit_unavailable_total");
    log.warn({ err: error }, "redis.rate_limit_unavailable");
    return true;
  }
}

/**
 * Run a scheduled job at most once per interval across every instance.
 *
 * Unlike a lock that is released when the job returns, the key is a time
 * bucket (`...:<floor(now/interval)>`) that lives for the whole interval. That
 * matters with two pods: independently-phased timers would otherwise each take
 * the lock at different moments and run the sweep twice per window.
 *
 * Skipped (with a warning) when the bucket is already claimed.
 */
export async function withIntervalLock(
  name: string,
  intervalMs: number,
  job: () => Promise<void>,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / intervalMs);
  const key = `jobs:interval:${name}:${bucket}`;
  countRedisCommand("lock");
  try {
    const acquired = await redis.set(key, "1", "NX", "PX", String(intervalMs + 30_000));
    if (acquired !== "OK") return false;
  } catch (error) {
    inc("redis.job_lock_unavailable_total");
    log.warn({ err: error, job: name }, "redis.job_lock_unavailable");
    return false;
  }

  await job();
  return true;
}

type RedisHealth = { online: boolean; latencyMs: number | null };

let cachedHealth: RedisHealth | null = null;
let cachedAt = 0;

/**
 * Cached PING for /health. Sixty seconds keeps the Upstash bill small while
 * staying fresh enough for readiness checks; `/health?db=1` forces a probe.
 */
const HEALTH_CACHE_TTL_MS = 60_000;

export async function checkRedisHealth(force = false): Promise<RedisHealth> {
  const now = Date.now();
  if (!force && cachedHealth && now - cachedAt < HEALTH_CACHE_TTL_MS) {
    return cachedHealth;
  }

  const started = Date.now();
  countRedisCommand("health");
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
  closing = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  redis.close();
}
