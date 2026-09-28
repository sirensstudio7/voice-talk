import type { Elysia } from "elysia";

import { socketRoute, type SocketBridge } from "../http/websocket.js";
import { env } from "../env.js";
import { logger, shouldLogThrottled } from "../http/logger.js";
import { getBusinessBySlug } from "../services/tenant.js";
import {
  ensureVisionHub,
  getOrCreateVisionSettings,
  handleVisionEvent,
  registerKioskClient,
  releaseKioskSession,
  setKioskSessionActive,
  startKioskCooldown,
  unregisterKioskClient,
} from "../services/vision-orchestrator.js";

type VisionEventType =
  | "PERSON_ENTER"
  | "PERSON_EXIT"
  | "PERSON_CONFIRMED"
  | "PERSON_LOST"
  | "SESSION_TIMEOUT";

const log = logger.child({ component: "vision" });

export function registerVisionWebSocketRoutes(app: Elysia): void {
  // Vision detection runs in the kiosk browser itself (MediaPipe/Human), so the
  // control channel and the event stream share one socket — no cross-instance
  // routing is involved.
  app.ws("/ws/kiosk", socketRoute((socket, { query }) => handleKioskClient(socket, query)));
}

async function handleKioskClient(
  socket: SocketBridge,
  query: Record<string, string | undefined>,
): Promise<void> {
  const slug = query.business || env.DEFAULT_BUSINESS_SLUG;
  const kioskId = query.kiosk_id || "default";
  const tenant = await getBusinessBySlug(slug);
  if (!tenant) {
    socket.close();
    return;
  }

  try {
    const { assertKioskSocketAccess } = await import("../services/kiosk-displays.js");
    await assertKioskSocketAccess({
      businessId: tenant.id,
      businessSlug: slug,
      kioskSlug: kioskId,
      token: query.token,
      embed: query.embed,
    });
  } catch {
    socket.close();
    return;
  }

  const hub = await ensureVisionHub(tenant.id, slug);
  hub.settings = await getOrCreateVisionSettings(tenant.id);
  registerKioskClient(hub, kioskId, socket);
  log.info({ businessSlug: slug, kioskId }, "vision.kiosk_connected");

  socket.on("message", (raw) => {
    try {
      const payload = JSON.parse(String(raw)) as Record<string, unknown>;
      const msgType = payload.type as string;

      if (msgType === "kiosk.session.started") {
        setKioskSessionActive(hub, true);
      } else if (msgType === "kiosk.session.ended") {
        startKioskCooldown(hub);
      } else if (msgType === "kiosk.session.released") {
        releaseKioskSession(hub);
      } else if (msgType === "kiosk.vision.event") {
        const event = payload.event as VisionEventType;
        const trackId =
          typeof payload.track_id === "number" ? payload.track_id : undefined;
        void handleVisionEvent(hub, kioskId, event, trackId);
      }
    } catch (err) {
      if (shouldLogThrottled(`vision.kiosk_message_failed:${slug}:${kioskId}`)) {
        log.error({ err, businessSlug: slug, kioskId }, "vision.kiosk_message_failed");
      }
    }
  });

  socket.on("close", () => {
    unregisterKioskClient(hub, kioskId);
    log.info({ businessSlug: slug, kioskId }, "vision.kiosk_disconnected");
  });
}
