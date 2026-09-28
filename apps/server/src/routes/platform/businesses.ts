import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { sendAuthError, createAccessToken } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db } from "../../db/client.js";
import { aiRules, businessMembers, businesses, products, subscriptions, users, voiceSessions } from "../../db/schema.js";
import { env } from "../../env.js";
import { t, type Elysia } from "elysia";
import { parsePagination, ensureSubscriptionForBusiness } from "./shared.js";

export const businessStatusBody = t.Object({
  status: t.Union([t.Literal("active"), t.Literal("disabled")]),
});

export async function registerPlatformBusinessRoutes(app: Elysia): Promise<void> {
  app.get("/platform/businesses", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "businesses:read");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);
      const search = typeof query.search === "string" ? query.search.trim() : "";
      const status = typeof query.status === "string" ? query.status.trim() : "";

      const conditions = [];
      if (search) {
        conditions.push(
          or(ilike(businesses.name, `%${search}%`), ilike(businesses.slug, `%${search}%`))!,
        );
      }
      if (status === "active") conditions.push(eq(businesses.isActive, true));
      if (status === "disabled") conditions.push(eq(businesses.isActive, false));
      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [totalRow] = await db.select({ value: count() }).from(businesses).where(whereClause);
      const rows = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          isActive: businesses.isActive,
          createdAt: businesses.createdAt,
          planName: subscriptions.planName,
          subStatus: subscriptions.status,
        })
        .from(businesses)
        .leftJoin(subscriptions, eq(subscriptions.businessId, businesses.id))
        .where(whereClause)
        .orderBy(desc(businesses.createdAt))
        .limit(limit)
        .offset(offset);

      const businessIds = rows.map((r) => r.id);
      const owners =
        businessIds.length === 0
          ? []
          : await db
              .select({
                businessId: businessMembers.businessId,
                role: businessMembers.role,
                name: users.name,
                email: users.email,
              })
              .from(businessMembers)
              .innerJoin(users, eq(users.id, businessMembers.userId))
              .where(inArray(businessMembers.businessId, businessIds));

      const ownerByBusiness = new Map<string, { name: string; email: string }>();
      for (const owner of owners) {
        const existing = ownerByBusiness.get(owner.businessId);
        if (!existing || owner.role === "owner") {
          ownerByBusiness.set(owner.businessId, { name: owner.name, email: owner.email });
        }
      }

      return {
        items: rows.map((r) => {
          const owner = ownerByBusiness.get(r.id);
          return {
            id: r.id,
            name: r.name,
            slug: r.slug,
            domain: `${r.slug}.lorescale.com`,
            status: r.isActive ? "active" : "disabled",
            plan: r.planName ?? "starter",
            subscription_status: r.subStatus ?? "active",
            owner_name: owner?.name ?? null,
            owner_email: owner?.email ?? null,
            created_at: r.createdAt.toISOString(),
          };
        }),
        total: totalRow?.value ?? 0,
        page,
        limit,
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/businesses/:id", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "businesses:read");
      const { id } = request.params as { id: string };

      const business = await db.query.businesses.findFirst({ where: eq(businesses.id, id) });
      if (!business) return request.status(404, { detail: "Business not found" });

      const sub = await ensureSubscriptionForBusiness(id);
      const [[productCount], [sessionCount], members, rules] = await Promise.all([
        db.select({ value: count() }).from(products).where(eq(products.businessId, id)),
        db.select({ value: count() }).from(voiceSessions).where(eq(voiceSessions.businessId, id)),
        db
          .select({
            userId: users.id,
            name: users.name,
            email: users.email,
            role: businessMembers.role,
          })
          .from(businessMembers)
          .innerJoin(users, eq(users.id, businessMembers.userId))
          .where(eq(businessMembers.businessId, id)),
        db.query.aiRules.findFirst({ where: eq(aiRules.businessId, id) }),
      ]);

      return {
        id: business.id,
        name: business.name,
        slug: business.slug,
        tagline: business.tagline,
        status: business.isActive ? "active" : "disabled",
        business_type: business.businessType,
        primary_use_case: business.primaryUseCase,
        gemini_model: business.geminiModel,
        created_at: business.createdAt.toISOString(),
        assistants_count: rules ? 1 : 0,
        products_count: productCount?.value ?? 0,
        voice_sessions_count: sessionCount?.value ?? 0,
        whatsapp_status: "not_configured",
        storage_usage_bytes: 0,
        members: members.map((m) => ({
          id: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
        })),
        subscription: {
          id: sub.id,
          plan_name: sub.planName,
          billing_cycle: sub.billingCycle,
          status: sub.status,
          start_date: sub.startDate?.toISOString() ?? null,
          end_date: sub.endDate?.toISOString() ?? null,
          notes: sub.notes,
        },
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/businesses/:id/status", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "businesses:write");
      const { id } = request.params as { id: string };
      const body = request.body;
      const isActive = body.status === "active";

      const business = await db.query.businesses.findFirst({ where: eq(businesses.id, id) });
      if (!business) return request.status(404, { detail: "Business not found" });

      await db.update(businesses).set({ isActive }).where(eq(businesses.id, id));
      await writeAuditLog({
        adminId: admin.id,
        action: isActive ? "business.enable" : "business.disable",
        entityType: "business",
        entityId: id,
        metadata: { previous: business.isActive, next: isActive },
        request,
      });

      return { id, status: isActive ? "active" : "disabled" };
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: businessStatusBody,
  });

  app.post("/platform/businesses/:id/impersonate", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "impersonate");
      const { id } = request.params as { id: string };

      const business = await db.query.businesses.findFirst({ where: eq(businesses.id, id) });
      if (!business) return request.status(404, { detail: "Business not found" });

      const [owner] = await db
        .select({ user: users })
        .from(businessMembers)
        .innerJoin(users, eq(users.id, businessMembers.userId))
        .where(
          and(eq(businessMembers.businessId, id), eq(businessMembers.role, "owner")),
        )
        .limit(1);

      const targetUser =
        owner?.user ??
        (
          await db
            .select({ user: users })
            .from(businessMembers)
            .innerJoin(users, eq(users.id, businessMembers.userId))
            .where(eq(businessMembers.businessId, id))
            .limit(1)
        )[0]?.user;

      if (!targetUser) {
        return request.status(400, { detail: "Business has no members to impersonate." });
      }
      if (targetUser.status === "suspended") {
        return request.status(400, { detail: "Cannot impersonate a suspended user." });
      }
      if (targetUser.status === "pending") {
        return request.status(400, { detail: "Cannot impersonate a pending user." });
      }

      await writeAuditLog({
        adminId: admin.id,
        action: "business.impersonate",
        entityType: "business",
        entityId: id,
        metadata: { user_id: targetUser.id, email: targetUser.email },
        request,
      });

      const accessToken = createAccessToken(targetUser.id);
      const redirectUrl = `${env.MERCHANT_ADMIN_URL.replace(/\/+$/, "")}/?impersonate=1&business=${id}`;

      return {
        access_token: accessToken,
        token_type: "bearer",
        business_id: id,
        user: { id: targetUser.id, email: targetUser.email, name: targetUser.name },
        redirect_url: redirectUrl,
        merchant_admin_url: env.MERCHANT_ADMIN_URL,
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
