import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { aiRules } from "../../db/schema.js";
import { defaultAiRulesValues } from "../../services/onboarding.js";
import { fetchBusinessStatsSummary, fetchStatsDaily, fetchStatsOverview, fetchStatsTopProducts } from "../../services/business-stats.js";
import type { Elysia } from "elysia";
import { aiRulesOut } from "./shared.js";

export async function registerAdminStatsRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/stats/summary", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const summary = await fetchBusinessStatsSummary(businessId);

      let rules = summary.ai_rules;
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values(
            defaultAiRulesValues({
              businessId,
              businessName: business.name,
              language: "en",
              primaryUseCase: business.primaryUseCase,
              businessType: business.businessType,
            }),
          )
          .returning();
      }

      return {
        overview: summary.overview,
        daily: summary.daily,
        top_products: summary.top_products,
        ai_rules: aiRulesOut(rules!),
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/overview", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return fetchStatsOverview(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/daily", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return fetchStatsDaily(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/top-products", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return fetchStatsTopProducts(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
