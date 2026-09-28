import type { Elysia } from "elysia";

import { socketRoute, type SocketBridge } from "../http/websocket.js";
import { env } from "../env.js";
import { getBusinessBySlug } from "../services/tenant.js";
import {
  buildVisionConfigPayload,
  ensureVisionHub,
  getOrCreateVisionSettings,
  handleVisionEvent,
  publishVisionEvent,
  registerKioskClient,
  registerVisionSource,
  releaseKioskSession,
  setKioskSessionActive,
  startKioskCooldown,
  unregisterKioskClient,
  unregisterVisionSource,
} from "../services/vision-orchestrator.js";

type VisionEventType =
  | "PERSON_ENTER"
  | "PERSON_EXIT"
  | "PERSON_CONFIRMED"
  | "PERSON_LOST"
  | "SESSION_TIMEOUT";

function safeSend(socket: SocketBridge, payload: Record<string, unknown>): boolean {
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

export function registerVisionWebSocketRoutes(app: Elysia): void {
  app.ws("/ws/vision", socketRoute((socket, { query }) => handleVisionSource(socket, query)));
  app.ws("/ws/kiosk", socketRoute((socket, { query }) => handleKioskClient(socket, query)));
}

async function handleVisionSource(
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

  const hub = await ensureVisionHub(tenant.id, slug);
  hub.settings = await getOrCreateVisionSettings(tenant.id);
  registerVisionSource(hub, kioskId, socket);
  console.info(`Vision source connected business=${slug} kiosk=${kioskId}`);
  safeSend(socket, buildVisionConfigPayload(hub));

  socket.on("message", (raw) => {
    try {
      const payload = JSON.parse(String(raw)) as Record<string, unknown>;
      const msgType = payload.type as string;

      if (msgType === "vision.hello") {
        void (async () => {
          hub.settings = await getOrCreateVisionSettings(hub.businessId);
          safeSend(socket, buildVisionConfigPayload(hub));
        })();
        return;
      }

      if (msgType === "vision.event") {
        const event = payload.event as VisionEventType;
        const trackId =
          typeof payload.track_id === "number" ? payload.track_id : undefined;
        void handleVisionEvent(hub, kioskId, event, trackId, "python");
        void publishVisionEvent(slug, { ...payload, business: slug });
      }
    } catch (err) {
      console.error("Vision source message error:", err);
    }
  });

  socket.on("close", () => {
    unregisterVisionSource(hub, kioskId);
    console.info(`Vision source disconnected business=${slug} kiosk=${kioskId}`);
  });
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
  console.info(`Kiosk client connected business=${slug} kiosk=${kioskId}`);

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
        void handleVisionEvent(hub, kioskId, event, trackId, "browser");
      }
    } catch (err) {
      console.error("Kiosk client message error:", err);
    }
  });

  socket.on("close", () => {
    unregisterKioskClient(hub, kioskId);
    console.info(`Kiosk client disconnected business=${slug} kiosk=${kioskId}`);
  });
}
