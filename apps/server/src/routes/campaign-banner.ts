import { extname } from "node:path";
import sharp from "sharp";

import { getAuthUserId, requireBusinessAccess, sendAuthError } from "../auth/jwt.js";
import {
  bannerOut,
  CAMPAIGN_BANNER_BUCKET,
  campaignBannerSettingsOut,
  createBanner,
  deleteBanner,
  getCampaignBannerAnalytics,
  getOrCreateCampaignBannerSettings,
  listScheduledBanners,
  MAX_BANNER_IMAGE_BYTES,
  parseLayout,
  reorderBanners,
  setBannerImageUrl,
  trackCampaignBannerEvent,
  updateBanner,
  updateCampaignBannerSettings,
} from "../services/campaign-banner.js";
import { getBusinessBySlug } from "../services/tenant.js";
import { ALLOWED_IMAGE_TYPES, uploadToStorage } from "../storage/index.js";
import { readUploadedFile } from "../http/multipart.js";
import { optionalBoolean, optionalNullableString, optionalString } from "../http/validation.js";
import { t, type Elysia } from "elysia";

export const campaignBannerSettingsBody = t.Object({
  enabled: optionalBoolean,
  layout: optionalString,
});

export const bannerReorderBody = t.Object({
  ordered_ids: t.Array(t.String()),
});

export const bannerBody = t.Object({
  title: optionalString,
  target_url: optionalString,
  qr_url: optionalString,
  duration_sec: t.Optional(t.Number()),
  display_order: t.Optional(t.Number()),
  is_active: optionalBoolean,
  start_at: optionalNullableString,
  end_at: optionalNullableString,
});

export const campaignBannerEventBody = t.Object({
  businessId: optionalString,
  slug: optionalString,
  bannerId: optionalString,
  eventName: optionalString,
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});

function statusFromError(err: unknown): number {
  if (err && typeof err === "object" && "statusCode" in err) {
    return Number((err as { statusCode?: number }).statusCode) || 500;
  }
  return 500;
}

async function prepareBannerImage(buffer: Buffer): Promise<{
  data: Buffer;
  mime: string;
  ext: string;
}> {
  const rotated = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await rotated.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 32 || height < 32) {
    throw Object.assign(new Error("Could not read that image. Try a PNG, JPG, or WebP."), {
      statusCode: 400,
    });
  }

  const data = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toBuffer();
  const outMeta = await sharp(data).metadata();
  const format = outMeta.format;
  if (format === "png") return { data, mime: "image/png", ext: "png" };
  if (format === "webp") return { data, mime: "image/webp", ext: "webp" };
  return { data, mime: "image/jpeg", ext: "jpg" };
}

export async function registerCampaignBannerRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/campaign-banner/settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const settings = await getOrCreateCampaignBannerSettings(businessId);
      return campaignBannerSettingsOut(settings);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/campaign-banner/settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body;
      if (typeof body.enabled !== "boolean" && body.layout === undefined) {
        return request.status(400, { detail: "enabled or layout is required" });
      }
      const settings = await updateCampaignBannerSettings(
        businessId,
        {
          ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
          ...(body.layout !== undefined ? { layout: parseLayout(body.layout) } : {}),
        },
        business.slug,
      );
      return campaignBannerSettingsOut(settings);
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to update settings",
      });
    }
  }, {
    body: campaignBannerSettingsBody,
  });

  app.get("/admin/businesses/:businessId/campaign-banner/banners", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await listScheduledBanners(businessId);
      return { items: rows.map(bannerOut) };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/campaign-banner/banners", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const userId = getAuthUserId(request);
      const body = request.body;
      const created = await createBanner(businessId, body, userId);
      return request.status(201, bannerOut(created));
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to create banner",
      });
    }
  }, {
    body: bannerBody,
  });

  app.patch(
    "/admin/businesses/:businessId/campaign-banner/banners/:bannerId",
    async (request) => {
      try {
        const { businessId, bannerId } = request.params as {
          businessId: string;
          bannerId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = request.body;
        const updated = await updateBanner(businessId, bannerId, body);
        return bannerOut(updated);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to update banner",
        });
      }
    },
    {
      body: bannerBody,
    },
  );

  app.delete(
    "/admin/businesses/:businessId/campaign-banner/banners/:bannerId",
    async (request) => {
      try {
        const { businessId, bannerId } = request.params as {
          businessId: string;
          bannerId: string;
        };
        await requireBusinessAccess(request, businessId);
        await deleteBanner(businessId, bannerId);
        return { ok: true };
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to delete banner",
        });
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/campaign-banner/banners/reorder",
    async (request) => {
      try {
        const { businessId } = request.params as { businessId: string };
        await requireBusinessAccess(request, businessId);
        const body = request.body;
        const rows = await reorderBanners(businessId, body.ordered_ids.map(String));
        return { items: rows.map(bannerOut) };
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to reorder banners",
        });
      }
    },
    {
      body: bannerReorderBody,
    },
  );

  app.post(
    "/admin/businesses/:businessId/campaign-banner/banners/:bannerId/image",
    async (request) => {
      try {
        const { businessId, bannerId } = request.params as {
          businessId: string;
          bannerId: string;
        };
        await requireBusinessAccess(request, businessId);
        const data = readUploadedFile(request.body);
        if (!data) return request.status(400, { detail: "No file uploaded." });

        const mime = data.mimetype?.toLowerCase() ?? "";
        if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
          return request.status(400, { detail: "Image must be PNG, JPG, or WebP." });
        }
        const buffer = await data.toBuffer();
        if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
        if (buffer.length > MAX_BANNER_IMAGE_BYTES) {
          return request.status(400, { detail: "Banner image must be 3 MB or smaller." });
        }

        const prepared = await prepareBannerImage(buffer);
        const mapped = ALLOWED_IMAGE_TYPES[mime] || extname(data.filename || "") || `.${prepared.ext}`;
        const ext = (mapped.replace(/^\./, "") || prepared.ext).replace(/jpeg/i, "jpg");
        const path = `${businessId}/${bannerId}.${ext}`;
        const url = await uploadToStorage(
          CAMPAIGN_BANNER_BUCKET,
          path,
          prepared.data,
          prepared.mime,
        );
        const updated = await setBannerImageUrl(businessId, bannerId, url);
        return bannerOut(updated);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to upload banner image",
        });
      }
    },
  );

  app.get("/admin/businesses/:businessId/campaign-banner/analytics", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return await getCampaignBannerAnalytics(businessId);
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to load analytics",
      });
    }
  });

  app.post("/public/campaign-banner/events", async (request) => {
    try {
      const body = request.body;

      let businessId = body.businessId?.trim() ?? "";
      if (!businessId && body.slug) {
        const business = await getBusinessBySlug(body.slug);
        if (!business) return request.status(404, { detail: "Business not found" });
        businessId = business.id;
      }
      const bannerId = body.bannerId?.trim() ?? "";
      const eventName = body.eventName?.trim() ?? "";
      if (
        !businessId ||
        !bannerId ||
        (eventName !== "campaign_banner_impression" && eventName !== "campaign_banner_click")
      ) {
        return request.status(400, {
          detail: "businessId/slug, bannerId, and a valid eventName are required",
        });
      }

      await trackCampaignBannerEvent({
        businessId,
        bannerId,
        eventName,
        metadata: body.metadata,
      });
      return { ok: true };
    } catch (err) {
      const status = statusFromError(err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to track event",
      });
    }
  }, {
    body: campaignBannerEventBody,
  });
}
