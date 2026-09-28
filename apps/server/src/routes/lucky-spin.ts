import { extname } from "node:path";

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
import { nonEmptyString, optionalBoolean, optionalNullableString, optionalString, queryNumber } from "../http/validation.js";
import { t, type Elysia } from "elysia";

export const luckySpinSettingsBody = t.Object({
  enabled: optionalBoolean,
  ai_voice_enabled: optionalBoolean,
});

export const luckySpinCampaignCreateBody = t.Object({
  name: nonEmptyString,
  start_at: optionalNullableString,
  end_at: optionalNullableString,
  daily_limit: t.Optional(t.Union([t.Number(), t.Null()])),
  total_limit: t.Optional(t.Union([t.Number(), t.Null()])),
  one_per_user: optionalBoolean,
  odds_mode: t.Optional(t.Union([t.Literal("auto"), t.Literal("manual")])),
  status: optionalString,
});

export const luckySpinCampaignUpdateBody = t.Object({
  name: optionalString,
  start_at: optionalNullableString,
  end_at: optionalNullableString,
  daily_limit: t.Optional(t.Union([t.Number(), t.Null()])),
  total_limit: t.Optional(t.Union([t.Number(), t.Null()])),
  one_per_user: optionalBoolean,
  odds_mode: t.Optional(t.Union([t.Literal("auto"), t.Literal("manual")])),
  status: optionalString,
});

export const luckySpinPrizeCreateBody = t.Object({
  name: nonEmptyString,
  description: optionalString,
  image_url: optionalNullableString,
  probability: t.Optional(t.Number()),
  stock: t.Optional(t.Number()),
  voucher_prefix: optionalString,
  expires_at: optionalNullableString,
  enabled: optionalBoolean,
});

export const luckySpinPrizeUpdateBody = t.Object({
  name: optionalString,
  description: optionalString,
  image_url: optionalNullableString,
  probability: t.Optional(t.Number()),
  stock: t.Optional(t.Number()),
  voucher_prefix: optionalString,
  expires_at: optionalNullableString,
  enabled: optionalBoolean,
});

export const luckySpinRedeemBody = t.Object({
  voucher_code: optionalString,
});

export const luckySpinSpinBody = t.Optional(
  t.Object({
    phone: optionalString,
    name: optionalString,
  }),
);

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
      const body = request.body;
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
  }, {
    body: luckySpinSettingsBody,
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
      const body = request.body;
      const created = await createCampaign(businessId, body);
      return request.status(201, campaignOut(created));
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(request, err);
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Failed to create campaign",
      });
    }
  }, {
    body: luckySpinCampaignCreateBody,
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
        const body = request.body;
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
    {
      body: luckySpinCampaignUpdateBody,
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
        const body = request.body;
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
    {
      body: luckySpinPrizeCreateBody,
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
        const body = request.body;
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
    {
      body: luckySpinPrizeUpdateBody,
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
      const query = request.query;
      const result = await listWinners(businessId, {
        search: query.search,
        limit: query.limit,
        offset: query.offset,
      });
      return result;
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    query: t.Object({
      search: optionalString,
      limit: queryNumber,
      offset: queryNumber,
    }),
  });

  app.post("/admin/businesses/:businessId/lucky-spin/redeem", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body;
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
  }, {
    body: luckySpinRedeemBody,
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
      const body: { phone?: string; name?: string } = request.body ?? {};
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
  }, {
    body: luckySpinSpinBody,
  });
}
