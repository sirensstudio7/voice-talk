import { RedisClient } from "bun";

import { env } from "../env.js";
import { logger } from "../http/logger.js";
import { inc, setGauge } from "../http/metrics.js";
import { countRedisCommand, redis } from "../redis.js";

const log = logger.child({ component: "kiosk-bus" });

/**
 * Cross-instance fanout for kiosk configuration pushes.
 *
 * Kiosk sockets are pinned to whichever instance accepted them, so a settings
 * change handled by instance A must still reach kiosks connected to instance B.
 * Payloads are small and rare (banner/lucky-spin/booking/vision settings), so a
 * plain Redis channel is the right tool — never route media or per-frame data
 * through here.
 */
const CHANNEL = "kiosk:broadcast";
export const KIOSK_BUS_CHANNEL = CHANNEL;

/** Unique id for this process so a publisher can skip its own message. */
export const instanceId = crypto.randomUUID();

type FanoutMessage = {
  origin: string;
  businessSlug: string;
  payload: Record<string, unknown>;
};

type RemoteHandler = (
  businessSlug: string,
  payload: Record<string, unknown>,
) => void | Promise<void>;

let subscriber: RedisClient | null = null;
let onRemote: RemoteHandler | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let reconnectDelayMs = 500;

/** Publish a kiosk payload to the other instances. Best-effort: never throws. */
export async function publishKioskPayload(
  businessSlug: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const message: FanoutMessage = { origin: instanceId, businessSlug, payload };
    countRedisCommand("bus_publish");
    await redis.send("PUBLISH", [CHANNEL, JSON.stringify(message)]);
    inc("kiosk_bus.published_total");
  } catch (err) {
    inc("kiosk_bus.publish_failed_total");
    log.warn({ err, businessSlug }, "kiosk_bus.publish_failed");
  }
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return;
  const delay = reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectSubscriber();
  }, delay);
}

async function connectSubscriber(): Promise<void> {
  if (stopped || !subscriber || !onRemote) return;
  try {
    // `subscribe` connects on demand; an explicit connect() races it on a cold
    // client ("Connection closed"), which the retry then papers over.
    await subscriber.subscribe(CHANNEL, (message) => {
      // Bun hands the raw frame; a malformed message must not kill the reader.
      let parsed: FanoutMessage;
      try {
        parsed = JSON.parse(String(message)) as FanoutMessage;
      } catch {
        return;
      }
      if (!parsed?.businessSlug || parsed.origin === instanceId) return;
      inc("kiosk_bus.received_total");
      void Promise.resolve(onRemote?.(parsed.businessSlug, parsed.payload ?? {})).catch(
        (err) => {
          inc("kiosk_bus.handler_failed_total");
          log.warn({ err, businessSlug: parsed.businessSlug }, "kiosk_bus.handler_failed");
        },
      );
    });
    reconnectDelayMs = 500;
    setGauge("kiosk_bus.subscribed", 1);
    log.info({ instanceId }, "kiosk_bus.subscribed");
  } catch (err) {
    setGauge("kiosk_bus.subscribed", 0);
    log.warn({ err }, "kiosk_bus.subscribe_failed");
    scheduleReconnect();
  }
}

/**
 * Start the subscriber. `handler` applies a payload to kiosks connected to
 * this instance; publication is skipped automatically for local origins.
 */
export function startKioskBus(handler: RemoteHandler): void {
  if (subscriber) return;
  onRemote = handler;
  stopped = false;
  // A dedicated connection: Bun's client can only run ping/subscribe/
  // unsubscribe while subscribed, so it cannot share the main client.
  subscriber = new RedisClient(env.REDIS_URL, { autoReconnect: false });
  // Bun does not reconnect on its own, even with autoReconnect — and an
  // unsubscribed reader would silently stop delivering config pushes.
  subscriber.onclose = () => {
    setGauge("kiosk_bus.subscribed", 0);
    scheduleReconnect();
  };
  void connectSubscriber();
}

export function stopKioskBus(): void {
  stopped = true;
  setGauge("kiosk_bus.subscribed", 0);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    subscriber?.close();
  } catch {
    // already gone
  }
  subscriber = null;
  onRemote = null;
}
