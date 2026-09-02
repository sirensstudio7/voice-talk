import { extname } from "node:path";
import type { Elysia } from "elysia";

import { requireBusinessAccess, sendAuthError } from "../auth/jwt.js";
import { getBusinessBySlug } from "../services/tenant.js";
import {
  campaignOut,
  createCampaign,
  createPrize,
  deleteCampaign,
  deletePrize,
  getLuckySpinAnalytics,
  getLuckySpinPublicConfig,
  getOrCreateLuckySpinSettings,
  listCampaigns,
  listPrizes,
  listWinners,
  luckySpinSettingsOut,
  performSpin,
  prizeOut,
  redeemVoucher,
  sumEnabledProbability,
  updateCampaign,
  updateLuckySpinSettings,
  updatePrize,
  winnerOut,
} from "../services/lucky-spin.js";
import {
  ALLOWED_IMAGE_TYPES,
  uploadToStorage,
} from "../storage/index.js";
import { readUploadedFile } from "../http/multipart.js";

const PRIZE_BUCKET = "lucky-spin-prizes";
const MAX_PRIZE_IMAGE_BYTES = 2 * 1024 * 1024;

function statusFromError(err: unknown): number {
  if (err && typeof err === "object" && "statusCode" in err) {
    return Number((err as { statusCode?: number }).statusCode) || 500;
  }
  return 500;
}

export async function registerLuckySpinRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/lucky-spin/settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const settings = await getOrCreateLuckySpinSettings(businessId);
      return luckySpinSettingsOut(settings);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/lucky-spin/settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body as { enabled?: boolean; ai_voice_enabled?: boolean };
      if (typeof body.enabled !== "boolean" && typeof body.ai_voice_enabled !== "boolean") {
        return request.status(400, { detail: "enabled or ai_voice_enabled boolean is required" });
      }
      const settings = await updateLuckySpinSettings(
        businessId,
        {
          ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
          ...(typeof body.ai_voice_enabled === "boolean"
            ? { ai_voice_enabled: body.ai_voice_enabled }
            : {}),
        },
        business.slug,
      );
      return luckySpinSettingsOut(settings);
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to update settings",
      });
    }
  });

  app.get("/admin/businesses/:businessId/lucky-spin/campaigns", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await listCampaigns(businessId);
      return { items: rows.map(campaignOut) };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/lucky-spin/campaigns", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body as Parameters<typeof createCampaign>[1];
      const created = await createCampaign(businessId, body);
      return request.status(201, campaignOut(created));
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to create campaign",
      });
    }
  });

  app.patch(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId",
    async (request) => {
      try {
        const { businessId, campaignId } = request.params as {
          businessId: string;
          campaignId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = request.body as Parameters<typeof updateCampaign>[2];
        const updated = await updateCampaign(businessId, campaignId, body);
        return campaignOut(updated);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to update campaign",
        });
      }
    },
  );

  app.delete(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId",
    async (request) => {
      try {
        const { businessId, campaignId } = request.params as {
          businessId: string;
          campaignId: string;
        };
        await requireBusinessAccess(request, businessId);
        await deleteCampaign(businessId, campaignId);
        return request.status(204, );
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to delete campaign",
        });
      }
    },
  );

  app.get(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes",
    async (request) => {
      try {
        const { businessId, campaignId } = request.params as {
          businessId: string;
          campaignId: string;
        };
        await requireBusinessAccess(request, businessId);
        const prizes = await listPrizes(campaignId);
        const total = await sumEnabledProbability(campaignId);
        return { items: prizes.map(prizeOut), probability_total: total };
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes",
    async (request) => {
      try {
        const { businessId, campaignId } = request.params as {
          businessId: string;
          campaignId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = request.body as Parameters<typeof createPrize>[2];
        const created = await createPrize(businessId, campaignId, body);
        return request.status(201, prizeOut(created));
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to create prize",
        });
      }
    },
  );

  app.patch(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes/:prizeId",
    async (request) => {
      try {
        const { businessId, campaignId, prizeId } = request.params as {
          businessId: string;
          campaignId: string;
          prizeId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = request.body as Parameters<typeof updatePrize>[3];
        const updated = await updatePrize(businessId, campaignId, prizeId, body);
        return prizeOut(updated);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to update prize",
        });
      }
    },
  );

  app.delete(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes/:prizeId",
    async (request) => {
      try {
        const { businessId, campaignId, prizeId } = request.params as {
          businessId: string;
          campaignId: string;
          prizeId: string;
        };
        await requireBusinessAccess(request, businessId);
        await deletePrize(businessId, campaignId, prizeId);
        return request.status(204, );
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to delete prize",
        });
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes/:prizeId/image",
    async (request) => {
      try {
        const { businessId, campaignId, prizeId } = request.params as {
          businessId: string;
          campaignId: string;
          prizeId: string;
        };
        await requireBusinessAccess(request, businessId);
        const file = readUploadedFile(request.body);
        if (!file) return request.status(400, { detail: "Image file is required" });
        if (!(file.mimetype in ALLOWED_IMAGE_TYPES) || file.mimetype === "image/gif") {
          return request.status(400, { detail: "Use PNG, JPG, or WEBP" });
        }
        const buffer = await file.toBuffer();
        if (buffer.byteLength > MAX_PRIZE_IMAGE_BYTES) {
          return request.status(400, { detail: "Image must be 2MB or smaller" });
        }
        const ext = extname(file.filename || "").toLowerCase() || ".png";
        const path = `${businessId}/${campaignId}/${prizeId}${ext}`;
        const url = await uploadToStorage(PRIZE_BUCKET, path, buffer, file.mimetype);
        const updated = await updatePrize(businessId, campaignId, prizeId, { image_url: url });
        return prizeOut(updated);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(request, err);
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Failed to upload image",
        });
      }
    },
  );

  app.get("/admin/businesses/:businessId/lucky-spin/winners", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query as { search?: string; limit?: string; offset?: string };
      const result = await listWinners(businessId, {
        search: query.search,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      });
      return result;
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/lucky-spin/redeem", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body as { voucher_code?: string };
      const result = await redeemVoucher({
        businessId,
        voucherCode: body.voucher_code ?? "",
      });
      return result;
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to redeem voucher",
      });
    }
  });

  app.get("/admin/businesses/:businessId/lucky-spin/analytics", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return await getLuckySpinAnalytics(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  // Public kiosk endpoints
  app.get("/public/lucky-spin/:slug/state", async (request) => {
    try {
      const { slug } = request.params as { slug: string };
      const tenant = await getBusinessBySlug(slug);
      if (!tenant) return request.status(404, { detail: "Business not found" });
      return await getLuckySpinPublicConfig(tenant.id);
    } catch (err) {
      return request.status(500, {
        detail: err instanceof Error ? err.message : "Failed to load Lucky Spin",
      });
    }
  });

  app.post("/public/lucky-spin/:slug/spin", async (request) => {
    try {
      const { slug } = request.params as { slug: string };
      const tenant = await getBusinessBySlug(slug);
      if (!tenant) return request.status(404, { detail: "Business not found" });
      const body = (request.body as { phone?: string; name?: string } | null) ?? {};
      const result = await performSpin({
        businessId: tenant.id,
        phone: body.phone,
        name: body.name,
      });
      return {
        voucher_code: result.winner.voucherCode,
        status: result.winner.status,
        prize: prizeOut(result.prize),
        winner: winnerOut(result.winner, result.prize),
      };
    } catch (err) {
      const status = statusFromError(err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Spin failed",
      });
    }
  });
}
