import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { visionEvents, visionSettings, type VisionSettings } from "../db/schema.js";
import {
  DEFAULT_VISION_SETTINGS,
  normalizeVisionSource,
  visionSettingsOut,
} from "./vision-settings.js";

type VisionEventType =
  | "PERSON_ENTER"
  | "PERSON_EXIT"
  | "PERSON_CONFIRMED"
  | "PERSON_LOST"
  | "SESSION_TIMEOUT";

type KioskClient = {
  socket: WebSocket;
  kioskId: string;
};

type VisionSourceClient = {
  socket: WebSocket;
  kioskId: string;
};

type VisionEventSource = "python" | "browser";

function shouldIgnoreBrowserVisionEvent(
  hub: BusinessVisionHub,
  source: VisionEventSource,
  event: VisionEventType,
): boolean {
  const visionSource = normalizeVisionSource(hub.settings.visionSource);

  if (source === "browser" && visionSource === "python") {
    return true;
  }

  if (
    source === "browser" &&
    visionSource === "auto" &&
    hub.visionSources.size > 0 &&
    (event === "PERSON_CONFIRMED" ||
      event === "PERSON_ENTER" ||
      event === "PERSON_EXIT")
  ) {
    return true;
  }

  return false;
}

type BusinessVisionHub = {
  businessId: string;
  businessSlug: string;
  settings: VisionSettings;
  visionSources: Map<string, VisionSourceClient>;
  kioskClients: Map<string, KioskClient>;
  sessionActive: boolean;
  sessionActiveSince: number;
  cooldownUntil: number;
  triggerPendingUntil: number;
  pendingGreetingTrigger: { trackId: number | null; expiresAt: number } | null;
  lastConfirmedTrackId: number | null;
  greetingReleaseTimer: ReturnType<typeof setTimeout> | null;
  pendingTriggerRetryTimer: ReturnType<typeof setTimeout> | null;
  pendingTriggerRetryCount: number;
};

const hubs = new Map<string, BusinessVisionHub>();
const TRIGGER_PENDING_MS = 20_000;
const GREETING_TRIGGER_TTL_MS = 120_000;
const GREETING_RELEASE_MS = 12_000;
const PENDING_TRIGGER_RETRY_MS = 1_000;
const PENDING_TRIGGER_RETRY_MAX = 20;

function hubKey(businessSlug: string): string {
  return businessSlug;
}

export async function getOrCreateVisionSettings(
  businessId: string,
): Promise<VisionSettings> {
  let settings = await db.query.visionSettings.findFirst({
    where: eq(visionSettings.businessId, businessId),
  });
  if (!settings) {
    [settings] = await db
      .insert(visionSettings)
      .values({ businessId })
      .returning();
  }
  return settings!;
}

export async function refreshHubSettings(businessSlug: string): Promise<void> {
  const hub = hubs.get(hubKey(businessSlug));
  if (!hub) return;
  hub.settings = await getOrCreateVisionSettings(hub.businessId);
}

function safeSend(socket: WebSocket, payload: Record<string, unknown>): boolean {
  try {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function recordVisionEvent(
  businessId: string,
  kioskId: string,
  eventType: VisionEventType,
  trackId?: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(visionEvents).values({
      id: randomUUID(),
      businessId,
      kioskId,
      eventType,
      trackId: trackId ?? null,
      metadata: JSON.stringify(metadata),
    });
  } catch (err) {
    console.error("Failed to record vision event:", err);
  }
}

function broadcastToKiosks(hub: BusinessVisionHub, payload: Record<string, unknown>): number {
  let delivered = 0;
  for (const client of hub.kioskClients.values()) {
    if (safeSend(client.socket, payload)) {
      delivered += 1;
    }
  }
  return delivered;
}

function notifyVisionSources(hub: BusinessVisionHub, payload: Record<string, unknown>): void {
  for (const source of hub.visionSources.values()) {
    safeSend(source.socket, payload);
  }
}

export function buildVisionConfigPayload(hub: BusinessVisionHub): Record<string, unknown> {
  return {
    type: "vision.config",
    config: visionSettingsOut(hub.settings),
    session_active: hub.sessionActive,
    python_vision_connected: hub.visionSources.size > 0,
  };
}

export function broadcastVisionConfig(hub: BusinessVisionHub): void {
  const payload = buildVisionConfigPayload(hub);
  broadcastToKiosks(hub, payload);
  notifyVisionSources(hub, payload);
}

function deliverGreetingTrigger(
  hub: BusinessVisionHub,
  trackId: number | null,
): number {
  return broadcastToKiosks(hub, {
    type: "vision.trigger",
    action: "start_greeting",
    track_id: trackId,
  });
}

function clearPendingTriggerRetry(hub: BusinessVisionHub): void {
  if (hub.pendingTriggerRetryTimer) {
    clearTimeout(hub.pendingTriggerRetryTimer);
    hub.pendingTriggerRetryTimer = null;
  }
  hub.pendingTriggerRetryCount = 0;
}

function tryDeliverPendingGreetingTrigger(hub: BusinessVisionHub): number {
  const pending = hub.pendingGreetingTrigger;
  if (!pending || Date.now() >= pending.expiresAt || hub.sessionActive) {
    return 0;
  }
  if (Date.now() < hub.cooldownUntil) {
    return 0;
  }
  if (!hub.settings.cameraTriggerEnabled) {
    return 0;
  }

  const delivered = deliverGreetingTrigger(hub, pending.trackId);
  if (delivered > 0) {
    hub.triggerPendingUntil = Date.now() + TRIGGER_PENDING_MS;
    clearPendingTriggerRetry(hub);
    scheduleGreetingRelease(hub);
    console.info(
      `Vision greeting trigger business=${hub.businessSlug} delivered=${delivered} track=${pending.trackId ?? "none"}`,
    );
  }
  return delivered;
}

function schedulePendingTriggerRetry(hub: BusinessVisionHub): void {
  clearPendingTriggerRetry(hub);

  const attemptRetry = () => {
    hub.pendingTriggerRetryTimer = null;
    const pending = hub.pendingGreetingTrigger;
    if (!pending || Date.now() >= pending.expiresAt || hub.sessionActive) {
      clearPendingTriggerRetry(hub);
      return;
    }

    const delivered = tryDeliverPendingGreetingTrigger(hub);
    if (delivered > 0) {
      return;
    }

    hub.pendingTriggerRetryCount += 1;
    if (hub.pendingTriggerRetryCount >= PENDING_TRIGGER_RETRY_MAX) {
      console.warn(
        `Vision greeting trigger business=${hub.businessSlug} gave up after ${PENDING_TRIGGER_RETRY_MAX} retries`,
      );
      clearPendingTriggerRetry(hub);
      return;
    }

    hub.pendingTriggerRetryTimer = setTimeout(attemptRetry, PENDING_TRIGGER_RETRY_MS);
  };

  hub.pendingTriggerRetryTimer = setTimeout(attemptRetry, PENDING_TRIGGER_RETRY_MS);
}

function clearGreetingRelease(hub: BusinessVisionHub): void {
  if (hub.greetingReleaseTimer) {
    clearTimeout(hub.greetingReleaseTimer);
    hub.greetingReleaseTimer = null;
  }
}

function scheduleGreetingRelease(hub: BusinessVisionHub): void {
  clearGreetingRelease(hub);
  hub.greetingReleaseTimer = setTimeout(() => {
    hub.greetingReleaseTimer = null;
    if (hub.sessionActive) {
      return;
    }
    console.warn(
      `Releasing vision trigger business=${hub.businessSlug} (kiosk never acknowledged greeting)`,
    );
    releaseKioskSession(hub);
  }, GREETING_RELEASE_MS);
}

export function getVisionHub(businessSlug: string): BusinessVisionHub | undefined {
  return hubs.get(hubKey(businessSlug));
}

export async function ensureVisionHub(
  businessId: string,
  businessSlug: string,
): Promise<BusinessVisionHub> {
  const key = hubKey(businessSlug);
  let hub = hubs.get(key);
  const settings = await getOrCreateVisionSettings(businessId);
  if (!hub) {
    hub = {
      businessId,
      businessSlug,
      settings,
      visionSources: new Map(),
      kioskClients: new Map(),
      sessionActive: false,
      sessionActiveSince: 0,
      cooldownUntil: 0,
      triggerPendingUntil: 0,
      pendingGreetingTrigger: null,
      lastConfirmedTrackId: null,
      greetingReleaseTimer: null,
      pendingTriggerRetryTimer: null,
      pendingTriggerRetryCount: 0,
    };
    hubs.set(key, hub);
  } else {
    hub.settings = settings;
  }
  return hub;
}

export function registerVisionSource(
  hub: BusinessVisionHub,
  kioskId: string,
  socket: WebSocket,
): void {
  hub.visionSources.set(kioskId, { socket, kioskId });
  broadcastVisionConfig(hub);
}

export function unregisterVisionSource(hub: BusinessVisionHub, kioskId: string): void {
  hub.visionSources.delete(kioskId);
  broadcastVisionConfig(hub);
}

export function registerKioskClient(
  hub: BusinessVisionHub,
  kioskId: string,
  socket: WebSocket,
): void {
  if (hub.sessionActive) {
    const ageMs =
      hub.sessionActiveSince > 0 ? Date.now() - hub.sessionActiveSince : GREETING_RELEASE_MS;
    if (ageMs >= GREETING_RELEASE_MS) {
      console.info(
        `Vision stale session cleared business=${hub.businessSlug} on kiosk connect age_ms=${ageMs}`,
      );
      releaseKioskSession(hub);
    }
  }

  hub.kioskClients.set(kioskId, { socket, kioskId });
  safeSend(socket, buildVisionConfigPayload(hub));

  const pending = hub.pendingGreetingTrigger;
  if (
    pending &&
    Date.now() < pending.expiresAt &&
    !hub.sessionActive &&
    Date.now() >= hub.cooldownUntil
  ) {
    const delivered = tryDeliverPendingGreetingTrigger(hub);
    if (delivered > 0) {
      console.info(
        `Replayed pending greeting trigger business=${hub.businessSlug} kiosk=${kioskId}`,
      );
    } else {
      schedulePendingTriggerRetry(hub);
    }
  }
}

export function unregisterKioskClient(hub: BusinessVisionHub, kioskId: string): void {
  hub.kioskClients.delete(kioskId);
}

export function setKioskSessionActive(hub: BusinessVisionHub, active: boolean): void {
  hub.sessionActive = active;
  hub.sessionActiveSince = active ? Date.now() : 0;
  if (active) {
    clearGreetingRelease(hub);
    clearPendingTriggerRetry(hub);
    hub.triggerPendingUntil = 0;
    hub.pendingGreetingTrigger = null;
  }
  const payload = active
    ? { type: "vision.session.active" }
    : { type: "vision.session.ended" };
  notifyVisionSources(hub, payload);
  broadcastToKiosks(hub, payload);
}

export function startKioskCooldown(hub: BusinessVisionHub): void {
  clearGreetingRelease(hub);
  clearPendingTriggerRetry(hub);
  const seconds = hub.settings.cooldownSeconds ?? DEFAULT_VISION_SETTINGS.cooldownSeconds;
  hub.cooldownUntil = Date.now() + seconds * 1000;
  hub.sessionActive = false;
  hub.sessionActiveSince = 0;
  hub.triggerPendingUntil = 0;
  hub.pendingGreetingTrigger = null;
  hub.lastConfirmedTrackId = null;
  notifyVisionSources(hub, { type: "vision.session.ended" });
  broadcastToKiosks(hub, { type: "vision.session.ended" });
}

/** Clear session state without post-conversation cooldown (failed greeting, stale reconnect). */
export function releaseKioskSession(hub: BusinessVisionHub): void {
  clearGreetingRelease(hub);
  clearPendingTriggerRetry(hub);
  hub.sessionActive = false;
  hub.sessionActiveSince = 0;
  hub.triggerPendingUntil = 0;
  // Clear pending triggers so an accidental PERSON_CONFIRMED cannot fire minutes later.
  hub.pendingGreetingTrigger = null;
  hub.lastConfirmedTrackId = null;
  notifyVisionSources(hub, { type: "vision.session.released" });
  broadcastToKiosks(hub, { type: "vision.session.ended" });
  broadcastVisionConfig(hub);
}

export async function handleVisionEvent(
  hub: BusinessVisionHub,
  kioskId: string,
  event: VisionEventType,
  trackId?: number,
  source: VisionEventSource = "python",
): Promise<void> {
  if (shouldIgnoreBrowserVisionEvent(hub, source, event)) {
    return;
  }

  if (
    hub.triggerPendingUntil > 0 &&
    Date.now() > hub.triggerPendingUntil &&
    !hub.sessionActive
  ) {
    hub.triggerPendingUntil = 0;
  }

  if (
    hub.pendingGreetingTrigger &&
    Date.now() > hub.pendingGreetingTrigger.expiresAt
  ) {
    hub.pendingGreetingTrigger = null;
  }

  await recordVisionEvent(hub.businessId, kioskId, event, trackId);

  const forwardPayload = {
    type: "vision.event",
    event,
    track_id: trackId ?? null,
    kiosk_id: kioskId,
  };

  broadcastToKiosks(hub, forwardPayload);

  if (event === "PERSON_CONFIRMED") {
    if (hub.sessionActive) {
      const staleMs = Date.now() - hub.sessionActiveSince;
      if (staleMs < GREETING_RELEASE_MS) {
        console.info(
          `Vision greeting skipped business=${hub.businessSlug} reason=session_active age_ms=${staleMs}`,
        );
        return;
      }
      console.warn(
        `Vision greeting forcing reset business=${hub.businessSlug} stale_session_ms=${staleMs}`,
      );
      hub.sessionActive = false;
      hub.sessionActiveSince = 0;
    }
    if (Date.now() < hub.cooldownUntil) {
      console.info(
        `Vision greeting skipped business=${hub.businessSlug} reason=cooldown`,
      );
      return;
    }
    if (!hub.settings.cameraTriggerEnabled) {
      console.info(
        `Vision greeting skipped business=${hub.businessSlug} reason=trigger_disabled`,
      );
      return;
    }

    const pending = hub.pendingGreetingTrigger;
    if (
      pending &&
      Date.now() < pending.expiresAt &&
      Date.now() < hub.triggerPendingUntil
    ) {
      return;
    }

    hub.lastConfirmedTrackId = trackId ?? null;
    hub.pendingGreetingTrigger = {
      trackId: trackId ?? null,
      expiresAt: Date.now() + GREETING_TRIGGER_TTL_MS,
    };

    const delivered = tryDeliverPendingGreetingTrigger(hub);
    if (delivered === 0) {
      console.info(
        `Vision greeting trigger business=${hub.businessSlug} delivered=0 track=${trackId ?? "none"} — retrying`,
      );
      schedulePendingTriggerRetry(hub);
    }
    scheduleGreetingRelease(hub);
  }

  if (event === "PERSON_LOST" && hub.sessionActive) {
    broadcastToKiosks(hub, {
      type: "vision.person_lost",
      track_id: trackId ?? null,
      lost_timeout_seconds: hub.settings.lostTimeoutSeconds,
    });
  }

  if (event === "PERSON_ENTER" && hub.sessionActive) {
    broadcastToKiosks(hub, {
      type: "vision.person_returned",
      track_id: trackId ?? null,
    });
  }
}

export async function getVisionMetrics(businessId: string, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await db
    .select()
    .from(visionEvents)
    .where(eq(visionEvents.businessId, businessId));

  const recent = events.filter((e) => e.createdAt >= since);
  const confirmed = recent.filter((e) => e.eventType === "PERSON_CONFIRMED").length;
  const enters = recent.filter((e) => e.eventType === "PERSON_ENTER").length;
  const falseRate = enters > 0 ? Math.max(0, (enters - confirmed) / enters) : 0;

  return {
    period_days: days,
    person_enter_count: enters,
    person_confirmed_count: confirmed,
    greeting_accuracy: enters > 0 ? confirmed / enters : 1,
    false_greeting_rate: falseRate,
    conversation_start_rate: confirmed > 0 ? confirmed / enters : 0,
  };
}

// Optional Redis bridge: when REDIS_URL is set, publish vision events for multi-kiosk scaling.
let redisPublisher: { publish: (channel: string, message: string) => Promise<number> } | null =
  null;

export async function initVisionEventBus(): Promise<void> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return;

  try {
    const moduleName = "ioredis";
    const imported = (await import(moduleName)) as {
      default: new (url: string) => { publish: (channel: string, message: string) => Promise<number> };
    };
    redisPublisher = new imported.default(redisUrl);
    console.info("Vision event bus: Redis publisher connected");
  } catch (err) {
    console.warn("Vision event bus: Redis unavailable, using in-process hub only", err);
  }
}

export async function publishVisionEvent(
  businessSlug: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!redisPublisher) return;
  try {
    await redisPublisher.publish(`vision:${businessSlug}`, JSON.stringify(payload));
  } catch (err) {
    console.error("Vision Redis publish failed:", err);
  }
}
