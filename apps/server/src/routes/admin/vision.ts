import { eq } from "drizzle-orm";
import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { visionSettings } from "../../db/schema.js";
import { DEFAULT_VISION_SETTINGS, normalizeAutoGoodbyeTimeoutSeconds, normalizeCooldownSeconds, normalizeDetectionDistanceM, normalizeGreetingDelaySeconds, normalizeGreetingTriggerMode, normalizeStartHotkey, normalizeVisionSource, normalizeLostTimeoutSeconds, normalizeSilenceTimeoutSeconds, normalizeVisionScript, visionSettingsOut } from "../../services/vision-settings.js";
import { broadcastVisionConfig, getOrCreateVisionSettings, getVisionHub, getVisionMetrics, refreshHubSettings } from "../../services/vision-orchestrator.js";
import { optionalBoolean, optionalNumberLike, optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

export const visionSettingsUpdateBody = t.Object({
  camera_trigger_enabled: optionalBoolean,
  start_hotkey: optionalString,
  vision_source: optionalString,
  greeting_trigger_mode: optionalString,
  greeting_delay_seconds: optionalNumberLike,
  detection_distance_m: optionalNumberLike,
  cooldown_seconds: optionalNumberLike,
  lost_timeout_seconds: optionalNumberLike,
  silence_timeout_seconds: optionalNumberLike,
  auto_goodbye_timeout_seconds: optionalNumberLike,
  greeting_script: optionalString,
  goodbye_script: optionalString,
});

export async function registerAdminVisionRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/vision-settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const settings = await getOrCreateVisionSettings(businessId);
      return visionSettingsOut(settings);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/vision-settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      await getOrCreateVisionSettings(businessId);
      const body = request.body;
      const updates: Partial<typeof visionSettings.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (body.camera_trigger_enabled !== undefined) {
        updates.cameraTriggerEnabled = Boolean(body.camera_trigger_enabled);
      }
      if (body.start_hotkey !== undefined) {
        updates.startHotkey = normalizeStartHotkey(body.start_hotkey);
      }
      if (body.vision_source !== undefined) {
        updates.visionSource = normalizeVisionSource(body.vision_source);
      }
      if (body.greeting_trigger_mode !== undefined) {
        updates.greetingTriggerMode = normalizeGreetingTriggerMode(
          body.greeting_trigger_mode,
        );
      }
      if (body.greeting_delay_seconds !== undefined) {
        updates.greetingDelaySeconds = normalizeGreetingDelaySeconds(
          body.greeting_delay_seconds,
        );
      }
      if (body.detection_distance_m !== undefined) {
        updates.detectionDistanceM = normalizeDetectionDistanceM(body.detection_distance_m);
      }
      if (body.cooldown_seconds !== undefined) {
        updates.cooldownSeconds = normalizeCooldownSeconds(body.cooldown_seconds);
      }
      if (body.lost_timeout_seconds !== undefined) {
        updates.lostTimeoutSeconds = normalizeLostTimeoutSeconds(body.lost_timeout_seconds);
      }
      if (body.silence_timeout_seconds !== undefined) {
        updates.silenceTimeoutSeconds = normalizeSilenceTimeoutSeconds(
          body.silence_timeout_seconds,
        );
      }
      if (body.auto_goodbye_timeout_seconds !== undefined) {
        updates.autoGoodbyeTimeoutSeconds = normalizeAutoGoodbyeTimeoutSeconds(
          body.auto_goodbye_timeout_seconds,
        );
      }
      if (body.greeting_script !== undefined) {
        updates.greetingScript = normalizeVisionScript(
          body.greeting_script,
          DEFAULT_VISION_SETTINGS.greetingScript,
        );
      }
      if (body.goodbye_script !== undefined) {
        updates.goodbyeScript = normalizeVisionScript(
          body.goodbye_script,
          DEFAULT_VISION_SETTINGS.goodbyeScript,
        );
      }

      const [updated] = await db
        .update(visionSettings)
        .set(updates)
        .where(eq(visionSettings.businessId, businessId))
        .returning();

      await refreshHubSettings(business.slug);
      const hub = getVisionHub(business.slug);
      if (hub) {
        broadcastVisionConfig(hub);
      }
      return visionSettingsOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: visionSettingsUpdateBody,
  });

  app.get("/admin/businesses/:businessId/vision-metrics", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const { days } = request.query as { days?: string };
      const periodDays = days ? Math.max(1, Math.min(90, Number(days))) : 7;
      return getVisionMetrics(businessId, periodDays);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
