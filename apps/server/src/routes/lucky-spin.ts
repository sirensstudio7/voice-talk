import { extname } from "node:path";
import type { FastifyInstance } from "fastify";

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

const PRIZE_BUCKET = "lucky-spin-prizes";
const MAX_PRIZE_IMAGE_BYTES = 2 * 1024 * 1024;

function statusFromError(err: unknown): number {
  if (err && typeof err === "object" && "statusCode" in err) {
    return Number((err as { statusCode?: number }).statusCode) || 500;
  }
  return 500;
}

export async function registerLuckySpinRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/businesses/:businessId/lucky-spin/settings", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const settings = await getOrCreateLuckySpinSettings(businessId);
      return luckySpinSettingsOut(settings);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/lucky-spin/settings", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body as { enabled?: boolean; ai_voice_enabled?: boolean };
      if (typeof body.enabled !== "boolean" && typeof body.ai_voice_enabled !== "boolean") {
        return reply
          .status(400)
          .send({ detail: "enabled or ai_voice_enabled boolean is required" });
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
      if (status === 401 || status === 403) return sendAuthError(reply, err);
      return reply.status(status).send({
        detail: err instanceof Error ? err.message : "Failed to update settings",
      });
    }
  });

  app.get("/admin/businesses/:businessId/lucky-spin/campaigns", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await listCampaigns(businessId);
      return { items: rows.map(campaignOut) };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/lucky-spin/campaigns", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body as Parameters<typeof createCampaign>[1];
      const created = await createCampaign(businessId, body);
      return reply.status(201).send(campaignOut(created));
    } catch (err) {
      const status = statusFromError(err);
      if (status === 401 || status === 403) return sendAuthError(reply, err);
      return reply.status(status).send({
        detail: err instanceof Error ? err.message : "Failed to create campaign",
      });
    }
  });

  app.patch(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId",
    async (request, reply) => {
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
        if (status === 401 || status === 403) return sendAuthError(reply, err);
        return reply.status(status).send({
          detail: err instanceof Error ? err.message : "Failed to update campaign",
        });
      }
    },
  );

  app.delete(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId",
    async (request, reply) => {
      try {
        const { businessId, campaignId } = request.params as {
          businessId: string;
          campaignId: string;
        };
        await requireBusinessAccess(request, businessId);
        await deleteCampaign(businessId, campaignId);
        return reply.status(204).send();
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(reply, err);
        return reply.status(status).send({
          detail: err instanceof Error ? err.message : "Failed to delete campaign",
        });
      }
    },
  );

  app.get(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes",
    async (request, reply) => {
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
        return sendAuthError(reply, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes",
    async (request, reply) => {
      try {
        const { businessId, campaignId } = request.params as {
          businessId: string;
          campaignId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = request.body as Parameters<typeof createPrize>[2];
        const created = await createPrize(businessId, campaignId, body);
        return reply.status(201).send(prizeOut(created));
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(reply, err);
        return reply.status(status).send({
          detail: err instanceof Error ? err.message : "Failed to create prize",
        });
      }
    },
  );

  app.patch(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes/:prizeId",
    async (request, reply) => {
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
        if (status === 401 || status === 403) return sendAuthError(reply, err);
        return reply.status(status).send({
          detail: err instanceof Error ? err.message : "Failed to update prize",
        });
      }
    },
  );

  app.delete(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes/:prizeId",
    async (request, reply) => {
      try {
        const { businessId, campaignId, prizeId } = request.params as {
          businessId: string;
          campaignId: string;
          prizeId: string;
        };
        await requireBusinessAccess(request, businessId);
        await deletePrize(businessId, campaignId, prizeId);
        return reply.status(204).send();
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(reply, err);
        return reply.status(status).send({
          detail: err instanceof Error ? err.message : "Failed to delete prize",
        });
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/lucky-spin/campaigns/:campaignId/prizes/:prizeId/image",
    async (request, reply) => {
      try {
        const { businessId, campaignId, prizeId } = request.params as {
          businessId: string;
          campaignId: string;
          prizeId: string;
        };
        await requireBusinessAccess(request, businessId);
        const file = await request.file();
        if (!file) return reply.status(400).send({ detail: "Image file is required" });
        if (!(file.mimetype in ALLOWED_IMAGE_TYPES) || file.mimetype === "image/gif") {
          return reply.status(400).send({ detail: "Use PNG, JPG, or WEBP" });
        }
        const buffer = await file.toBuffer();
        if (buffer.byteLength > MAX_PRIZE_IMAGE_BYTES) {
          return reply.status(400).send({ detail: "Image must be 2MB or smaller" });
        }
        const ext = extname(file.filename || "").toLowerCase() || ".png";
        const path = `${businessId}/${campaignId}/${prizeId}${ext}`;
        const url = await uploadToStorage(PRIZE_BUCKET, path, buffer, file.mimetype);
        const updated = await updatePrize(businessId, campaignId, prizeId, { image_url: url });
        return prizeOut(updated);
      } catch (err) {
        const status = statusFromError(err);
        if (status === 401 || status === 403) return sendAuthError(reply, err);
        return reply.status(status).send({
          detail: err instanceof Error ? err.message : "Failed to upload image",
        });
      }
    },
  );

  app.get("/admin/businesses/:businessId/lucky-spin/winners", async (request, reply) => {
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
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/lucky-spin/redeem", async (request, reply) => {
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
      if (status === 401 || status === 403) return sendAuthError(reply, err);
      return reply.status(status).send({
        detail: err instanceof Error ? err.message : "Failed to redeem voucher",
      });
    }
  });

  app.get("/admin/businesses/:businessId/lucky-spin/analytics", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return await getLuckySpinAnalytics(businessId);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  // Public kiosk endpoints
  app.get("/public/lucky-spin/:slug/state", async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const tenant = await getBusinessBySlug(slug);
      if (!tenant) return reply.status(404).send({ detail: "Business not found" });
      return await getLuckySpinPublicConfig(tenant.id);
    } catch (err) {
      return reply.status(500).send({
        detail: err instanceof Error ? err.message : "Failed to load Lucky Spin",
      });
    }
  });

  app.post("/public/lucky-spin/:slug/spin", async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const tenant = await getBusinessBySlug(slug);
      if (!tenant) return reply.status(404).send({ detail: "Business not found" });
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
      return reply.status(status).send({
        detail: err instanceof Error ? err.message : "Spin failed",
      });
    }
  });
}
