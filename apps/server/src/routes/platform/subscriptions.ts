import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db } from "../../db/client.js";
import { businesses, plans, subscriptions, voiceSessions } from "../../db/schema.js";
import { optionalNullableString, optionalString, listQueryFields } from "../../http/validation.js";
import { t, type Elysia } from "elysia";
import { parsePagination, resolveUsdIdrQuote, ensureSubscriptionForBusiness } from "./shared.js";

export const subscriptionUpdateBody = t.Object({
  plan_name: optionalString,
  billing_cycle: optionalString,
  status: optionalString,
  start_date: optionalNullableString,
  end_date: optionalNullableString,
  notes: optionalString,
});

export async function ensureAllBusinessSubscriptions(): Promise<void> {
  const missing = await db
    .select({ id: businesses.id })
    .from(businesses)
    .leftJoin(subscriptions, eq(subscriptions.businessId, businesses.id))
    .where(isNull(subscriptions.id));

  for (const row of missing) {
    await ensureSubscriptionForBusiness(row.id);
  }
}

export async function registerPlatformSubscriptionRoutes(app: Elysia): Promise<void> {
  app.get("/platform/subscriptions", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");

      const query = request.query;
      const { page, limit, offset } = parsePagination(query);
      const search = query.search?.trim() ?? "";
      const status = query.status?.trim() ?? "";

      // Ensure every business has a subscription row for listing completeness
      await ensureAllBusinessSubscriptions();

      const conditions = [];
      if (search) {
        conditions.push(
          or(
            ilike(businesses.name, `%${search}%`),
            ilike(businesses.slug, `%${search}%`),
            ilike(subscriptions.planName, `%${search}%`),
          )!,
        );
      }
      if (status) {
        conditions.push(eq(subscriptions.status, status));
      }
      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(subscriptions)
        .innerJoin(businesses, eq(businesses.id, subscriptions.businessId))
        .where(whereClause);
      const rows = await db
        .select({
          id: subscriptions.id,
          businessId: subscriptions.businessId,
          planName: subscriptions.planName,
          billingCycle: subscriptions.billingCycle,
          status: subscriptions.status,
          startDate: subscriptions.startDate,
          endDate: subscriptions.endDate,
          notes: subscriptions.notes,
          updatedAt: subscriptions.updatedAt,
          businessName: businesses.name,
          slug: businesses.slug,
        })
        .from(subscriptions)
        .innerJoin(businesses, eq(businesses.id, subscriptions.businessId))
        .where(whereClause)
        .orderBy(desc(subscriptions.updatedAt))
        .limit(limit)
        .offset(offset);

      const planRows = await db
        .select({
          code: plans.code,
          monthlyVoiceSeconds: plans.monthlyVoiceSeconds,
          monthlyPriceIdr: plans.monthlyPriceIdr,
          yearlyPriceIdr: plans.yearlyPriceIdr,
          yearlyDiscountPercent: plans.yearlyDiscountPercent,
        })
        .from(plans);
      const planByCode = new Map(planRows.map((plan) => [plan.code, plan]));
      const monthlyByPlan = new Map(
        planRows.map((plan) => [plan.code, Math.round(plan.monthlyVoiceSeconds / 60)]),
      );

      const allMatching = await db
        .select({
          businessId: subscriptions.businessId,
          planName: subscriptions.planName,
          billingCycle: subscriptions.billingCycle,
          status: subscriptions.status,
        })
        .from(subscriptions)
        .innerJoin(businesses, eq(businesses.id, subscriptions.businessId))
        .where(whereClause);

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const matchingBusinessIds = allMatching.map((row) => row.businessId);
      const usedByBusiness = new Map<string, number>();
      if (matchingBusinessIds.length) {
        const usedRows = await db
          .select({
            businessId: voiceSessions.businessId,
            minutes: sql<number>`coalesce(sum(extract(epoch from (
              case
                when ended_at is not null then ended_at
                else least(now(), started_at + interval '15 minutes')
              end - started_at
            )) / 60.0), 0)::float`,
          })
          .from(voiceSessions)
          .where(
            and(
              inArray(voiceSessions.businessId, matchingBusinessIds),
              gte(voiceSessions.startedAt, monthStart),
            ),
          )
          .groupBy(voiceSessions.businessId);
        for (const row of usedRows) {
          usedByBusiness.set(row.businessId, Math.round(Number(row.minutes ?? 0) * 10) / 10);
        }
      }

      let minutesUsed = 0;
      let minutesIncluded = 0;
      let priceIdrMonthly = 0;
      for (const row of allMatching) {
        minutesUsed += usedByBusiness.get(row.businessId) ?? 0;
        const plan = planByCode.get(row.planName);
        const included = monthlyByPlan.get(row.planName) ?? 0;
        const countsForPlan = status
          ? true
          : row.status === "active" || row.status === "trialing";
        if (countsForPlan) {
          minutesIncluded += included;
          if (plan) {
            if (row.billingCycle === "yearly") {
              const yearly =
                plan.yearlyPriceIdr > 0
                  ? plan.yearlyPriceIdr
                  : Math.round(
                      plan.monthlyPriceIdr * 12 * (1 - Math.min(100, Math.max(0, plan.yearlyDiscountPercent)) / 100),
                    );
              priceIdrMonthly += Math.round(yearly / 12);
            } else {
              priceIdrMonthly += plan.monthlyPriceIdr;
            }
          }
        }
      }
      minutesUsed = Math.round(minutesUsed * 10) / 10;
      const fx = await resolveUsdIdrQuote();
      const usdIdrRate = fx.rate;
      const geminiCostUsd = Math.round(minutesUsed * 0.023 * 100) / 100;

      return {
        items: rows.map((r) => ({
          id: r.id,
          business_id: r.businessId,
          business_name: r.businessName,
          slug: r.slug,
          plan_name: r.planName,
          billing_cycle: r.billingCycle,
          status: r.status,
          start_date: r.startDate?.toISOString() ?? null,
          end_date: r.endDate?.toISOString() ?? null,
          notes: r.notes,
          updated_at: r.updatedAt.toISOString(),
          lore_minutes_monthly: monthlyByPlan.get(r.planName) ?? 0,
          lore_minutes_used: usedByBusiness.get(r.businessId) ?? 0,
        })),
        total: totalRow?.value ?? 0,
        page,
        limit,
        summary: {
          minutes_used: minutesUsed,
          minutes_included: minutesIncluded,
          price_idr_monthly: priceIdrMonthly,
          price_usd_monthly: Math.round((priceIdrMonthly / usdIdrRate) * 100) / 100,
          gemini_usd_per_minute: 0.023,
          gemini_cost_usd: geminiCostUsd,
          gemini_cost_idr: Math.round(geminiCostUsd * usdIdrRate),
          usd_idr_rate: Math.round(usdIdrRate),
          usd_idr_updated_at: fx.market_at,
          usd_idr_source: fx.source,
        },
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    query: t.Object({
      ...listQueryFields,
      status: optionalString,
    }),
  });

  app.patch("/platform/subscriptions/:id", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body;

      const existing = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.id, id),
      });
      if (!existing) return request.status(404, { detail: "Subscription not found" });

      const [updated] = await db
        .update(subscriptions)
        .set({
          planName: body.plan_name?.trim() || existing.planName,
          billingCycle: body.billing_cycle?.trim() || existing.billingCycle,
          status: body.status?.trim() || existing.status,
          startDate:
            body.start_date === undefined
              ? existing.startDate
              : body.start_date
                ? new Date(body.start_date)
                : null,
          endDate:
            body.end_date === undefined
              ? existing.endDate
              : body.end_date
                ? new Date(body.end_date)
                : null,
          notes: body.notes ?? existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, id))
        .returning();

      await writeAuditLog({
        adminId: admin.id,
        action: "subscription.update",
        entityType: "subscription",
        entityId: id,
        metadata: { previous: existing, next: updated },
        request,
      });

      return {
        id: updated!.id,
        business_id: updated!.businessId,
        plan_name: updated!.planName,
        billing_cycle: updated!.billingCycle,
        status: updated!.status,
        start_date: updated!.startDate?.toISOString() ?? null,
        end_date: updated!.endDate?.toISOString() ?? null,
        notes: updated!.notes,
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: subscriptionUpdateBody,
  });
}
