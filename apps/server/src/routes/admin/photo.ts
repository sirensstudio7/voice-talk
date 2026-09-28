import sharp from "sharp";
import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, PHOTO_BRANDING_BUCKET, uploadToStorage } from "../../storage/index.js";
import { getAddonStatusForBusiness, getOrCreatePhotoSettings, photoSettingsOut, SMART_PHOTO_MOMENT_CODE } from "../../services/addon-entitlement.js";
import { deletePhotoSession, getPhotoAnalytics, listPhotoGallery, updatePhotoSettings } from "../../services/photo-moment.js";
import { readUploadedFile } from "../../http/multipart.js";
import { optionalBoolean, optionalNullableString, optionalString, queryNumber } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

export const photoSettingsUpdateBody = t.Object({
  enabled: optionalBoolean,
  voice_prompt: optionalString,
  countdown_seconds: t.Optional(t.Number()),
  qr_expiry_hours: t.Optional(t.Number()),
  campaign_text: optionalNullableString,
  auto_delete_days: t.Optional(t.Number()),
});

export async function registerAdminPhotoRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/photo/settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const settings = await getOrCreatePhotoSettings(businessId);
      const status = await getAddonStatusForBusiness(businessId, SMART_PHOTO_MOMENT_CODE);
      return { ...photoSettingsOut(settings), subscription_status: status.subscription_status };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/photo/settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body;
      const updated = await updatePhotoSettings(businessId, {
        enabled: body.enabled,
        voicePrompt: body.voice_prompt,
        countdownSeconds: body.countdown_seconds,
        qrExpiryHours: body.qr_expiry_hours,
        campaignText: body.campaign_text,
        autoDeleteDays: body.auto_delete_days,
      });
      return updated;
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  }, {
    body: photoSettingsUpdateBody,
  });

  app.post("/admin/businesses/:businessId/photo/branding/:kind", async (request) => {
    try {
      const { businessId, kind } = request.params as { businessId: string; kind: string };
      if (kind !== "logo" && kind !== "frame") {
        return request.status(400, { detail: "kind must be logo or frame" });
      }
      await requireBusinessAccess(request, businessId);
      const data = readUploadedFile(request.body);
      if (!data) return request.status(400, { detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      if (kind === "frame" && contentType !== "image/png") {
        return request.status(400, {
          detail: "Frame must be a PNG with transparency (twibbon-style).",
        });
      }
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return request.status(400, {
          detail:
            kind === "frame"
              ? "Frame must be a PNG with transparency (twibbon-style)."
              : "Upload a PNG, JPG, WEBP, or GIF image.",
        });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return request.status(400, { detail: "Image must be 5 MB or smaller." });
      }

      if (kind === "frame") {
        const meta = await sharp(buffer).metadata();
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;
        if (height <= 0) {
          return request.status(400, { detail: "Could not read frame dimensions." });
        }
        const ratio = width / height;
        const storyRatio = 9 / 16;
        if (Math.abs(ratio - storyRatio) > 0.02) {
          return request.status(400, {
            detail: `Frame must be 9:16 (Instagram Story), e.g. 1080×1920. Got ${width}×${height}.`,
          });
        }
      }

      const objectPath = `${businessId}/${kind}${extension}`;
      const url = await uploadToStorage(PHOTO_BRANDING_BUCKET, objectPath, buffer, contentType);
      const updated = await updatePhotoSettings(businessId, {
        ...(kind === "logo" ? { logoUrl: url } : { frameUrl: url }),
      });
      return updated;
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.delete("/admin/businesses/:businessId/photo/branding/:kind", async (request) => {
    try {
      const { businessId, kind } = request.params as { businessId: string; kind: string };
      if (kind !== "logo" && kind !== "frame") {
        return request.status(400, { detail: "kind must be logo or frame" });
      }
      await requireBusinessAccess(request, businessId);
      const updated = await updatePhotoSettings(businessId, {
        ...(kind === "logo" ? { logoUrl: null } : { frameUrl: null }),
      });
      return updated;
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/photo/gallery", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query;
      const from = query.from ? new Date(query.from) : null;
      const to = query.to ? new Date(query.to) : null;
      const limit = Math.min(100, Math.max(1, query.limit ?? 50));
      const offset = Math.max(0, query.offset ?? 0);
      return listPhotoGallery({
        businessId,
        from: from && !Number.isNaN(from.getTime()) ? from : null,
        to: to && !Number.isNaN(to.getTime()) ? to : null,
        limit,
        offset,
      });
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    query: t.Object({
      from: optionalString,
      to: optionalString,
      limit: queryNumber,
      offset: queryNumber,
    }),
  });

  app.delete("/admin/businesses/:businessId/photo/gallery/:sessionId", async (request) => {
    try {
      const { businessId, sessionId } = request.params as {
        businessId: string;
        sessionId: string;
      };
      await requireBusinessAccess(request, businessId);
      await deletePhotoSession(businessId, sessionId);
      return { ok: true };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/photo/analytics", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return getPhotoAnalytics(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
