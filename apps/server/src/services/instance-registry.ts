import { countRedisCommand, redis } from "../redis.js";
import { instanceId } from "./kiosk-bus.js";

/**
 * Lightweight instance presence (TKT-006 / TKT-020).
 *
 * LIVE rooms, host loops and TTS caches are per-instance, so a room started
 * while several API instances run is half-broken (viewers on other pods see no
 * chat, no audio). Every instance refreshes a short-lived key; room start
 * refuses to go live when more than one is present. Redis hiccups fail open —
 * never block a product feature because the presence check could not run.
 *
 * The interval is 60s (was 15s) to keep the Upstash command budget free for
 * product traffic. A new pod still registers on boot, so multi-instance
 * detection is immediate; only stale detection after scaling down lags by up
 * to the TTL (~2.5 min), which is acceptable for a guard.
 */
const HEARTBEAT_PREFIX = "instances:heartbeat:";
const HEARTBEAT_TTL_SECONDS = 150;
const HEARTBEAT_INTERVAL_MS = 60_000;

export function startInstanceHeartbeat(): void {
  const beat = async () => {
    countRedisCommand("heartbeat");
    try {
      await redis.set(
        `${HEARTBEAT_PREFIX}${instanceId}`,
        String(Date.now()),
        "EX",
        String(HEARTBEAT_TTL_SECONDS),
      );
    } catch {
      // Best effort: the guard fails open when keys are missing.
    }
  };
  void beat();
  setInterval(() => {
    void beat();
  }, HEARTBEAT_INTERVAL_MS).unref();
}

export async function activeInstanceCount(): Promise<number> {
  countRedisCommand("instance_count");
  try {
    const keys = (await redis.send("KEYS", [`${HEARTBEAT_PREFIX}*`])) as unknown;
    if (!Array.isArray(keys)) return 1;
    return Math.max(1, keys.length);
  } catch {
    return 1;
  }
}

/** Throws a clear 409 when a LIVE room is started on a multi-instance deploy. */
export async function assertSingleInstanceForLive(): Promise<void> {
  const count = await activeInstanceCount();
  if (count <= 1) return;
  const err = new Error(
    `LIVE is single-instance but ${count} API instances are running. Scale the API to one instance (or give LIVE its own deployment) before starting a room.`,
  ) as Error & { statusCode: number };
  err.statusCode = 409;
  throw err;
}
