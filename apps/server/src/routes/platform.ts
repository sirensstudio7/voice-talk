import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { sendAuthError, createAccessToken, hashPassword, clearUserCache } from "../auth/jwt.js";
import {
  authenticatePlatformPassword,
  checkLoginRateLimit,
  createPlatformAccessToken,
  ensurePlatformAdminSeed,
  generateTotpSecret,
  getCurrentPlatformAdmin,
  getPlatformAdminFromPending,
  platformAdminOut,
  verifyTotpCode,
  writeAuditLog,
} from "../auth/platform-auth.js";
import { requirePermission } from "../auth/platform-rbac.js";
import { db } from "../db/client.js";
import {
  aiRules,
  auditLogs,
  businessMembers,
  businesses,
  demoRequests,
  platformAdmins,
  platformSettings,
  plans,
  products,
  accountSubscriptions,
  subscriptionRequests,
  subscriptions,
  users,
  voiceSessions,
} from "../db/schema.js";
import { env } from "../env.js";
import {
  activateSubscriptionRequest,
  ensureTrialEntitlement,
  getEntitlementSnapshot,
  listPaidPlans,
  rejectSubscriptionRequest,
} from "../services/entitlement.js";
import {
  approveAddonRequest,
  listAddonRequestRows,
  rejectAddonRequest,
  suspendAddon,
} from "../services/addon-entitlement.js";

function clientKey(request: FastifyRequest): string {
  return (
    (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    request.ip ||
    "unknown"
  );
}

function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(platformSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function ensureSubscriptionForBusiness(businessId: string) {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.businessId, businessId),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(subscriptions)
    .values({
      businessId,
      planName: "starter",
      billingCycle: "monthly",
      status: "active",
      startDate: new Date(),
    })
    .returning();
  return created!;
}

async function ensureAllBusinessSubscriptions(): Promise<void> {
  const missing = await db
    .select({ id: businesses.id })
    .from(businesses)
    .leftJoin(subscriptions, eq(subscriptions.businessId, businesses.id))
    .where(isNull(subscriptions.id));

  for (const row of missing) {
    await ensureSubscriptionForBusiness(row.id);
  }
}

async function enrichUsers(
  rows: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
    createdAt: Date;
    lastLoginAt: Date | null;
  }>,
) {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const memberRows = await db
    .select({
      userId: businessMembers.userId,
      businessId: businessMembers.businessId,
      role: businessMembers.role,
      planName: subscriptions.planName,
    })
    .from(businessMembers)
    .leftJoin(subscriptions, eq(subscriptions.businessId, businessMembers.businessId))
    .where(inArray(businessMembers.userId, ids));

  const byUser = new Map<
    string,
    { count: number; plan: string | null; owners: Array<{ plan: string | null }> }
  >();
  for (const id of ids) byUser.set(id, { count: 0, plan: null, owners: [] });
  for (const row of memberRows) {
    const entry = byUser.get(row.userId);
    if (!entry) continue;
    entry.count += 1;
    if (row.role === "owner") {
      entry.owners.push({ plan: row.planName });
      if (!entry.plan) entry.plan = row.planName;
    } else if (!entry.plan) {
      entry.plan = row.planName;
    }
  }

  return rows.map((row) => {
    const meta = byUser.get(row.id);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || null,
      status: row.status,
      workspace_count: meta?.count ?? 0,
      plan: meta?.plan ?? "starter",
      created_at: row.createdAt.toISOString(),
      last_login_at: row.lastLoginAt?.toISOString() ?? null,
    };
  });
}

export async function registerPlatformRoutes(app: FastifyInstance): Promise<void> {
  await ensurePlatformAdminSeed();

  app.post("/platform/auth/login", async (request, reply) => {
    const key = `login:${clientKey(request)}`;
    if (!checkLoginRateLimit(key)) {
      return reply.status(429).send({ detail: "Too many login attempts. Try again later." });
    }

    const body = request.body as { email?: string; password?: string };
    try {
      const admin = await authenticatePlatformPassword(body.email ?? "", body.password ?? "");
      await db
        .update(platformAdmins)
        .set({ lastLoginAt: new Date() })
        .where(eq(platformAdmins.id, admin.id));
      await writeAuditLog({
        adminId: admin.id,
        action: "login",
        entityType: "platform_admin",
        entityId: admin.id,
        request,
      });
      return {
        access_token: createPlatformAccessToken(admin.id, admin.role),
        token_type: "bearer",
        admin: platformAdminOut({ ...admin, lastLoginAt: new Date() }),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/auth/setup-2fa", async (request, reply) => {
    try {
      const admin = await getPlatformAdminFromPending(request);
      if (admin.totpEnabled && admin.totpSecret) {
        return reply.status(400).send({ detail: "2FA is already enabled." });
      }
      const { secret, otpauthUrl } = generateTotpSecret(admin.email);
      await db
        .update(platformAdmins)
        .set({ totpSecret: secret, totpEnabled: false })
        .where(eq(platformAdmins.id, admin.id));
      return { secret, otpauth_url: otpauthUrl };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/auth/verify-2fa", async (request, reply) => {
    const body = request.body as { code?: string };
    const code = body.code?.trim() ?? "";
    try {
      const admin = await getPlatformAdminFromPending(request);
      if (!admin.totpSecret) {
        return reply.status(400).send({ detail: "2FA is not set up. Call setup-2fa first." });
      }
      if (!verifyTotpCode(admin.totpSecret, code)) {
        return reply.status(401).send({ detail: "Invalid 2FA code." });
      }

      if (!admin.totpEnabled) {
        await db
          .update(platformAdmins)
          .set({ totpEnabled: true, lastLoginAt: new Date() })
          .where(eq(platformAdmins.id, admin.id));
      } else {
        await db
          .update(platformAdmins)
          .set({ lastLoginAt: new Date() })
          .where(eq(platformAdmins.id, admin.id));
      }

      await writeAuditLog({
        adminId: admin.id,
        action: "login",
        entityType: "platform_admin",
        entityId: admin.id,
        request,
      });

      return {
        access_token: createPlatformAccessToken(admin.id, admin.role),
        token_type: "bearer",
        admin: platformAdminOut({ ...admin, totpEnabled: true, lastLoginAt: new Date() }),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/auth/logout", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      await writeAuditLog({
        adminId: admin.id,
        action: "logout",
        entityType: "platform_admin",
        entityId: admin.id,
        request,
      });
      return { ok: true };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/auth/me", async (request, reply) => {
    try {
      return platformAdminOut(await getCurrentPlatformAdmin(request));
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/dashboard", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "dashboard");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);
      const search = typeof query.search === "string" ? query.search.trim() : "";
      const status = typeof query.status === "string" ? query.status.trim() : "";

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const [totalUsers] = await db.select({ value: count() }).from(users);
      const [activeUsers] = await db
        .select({ value: count() })
        .from(users)
        .where(gte(users.lastLoginAt, thirtyDaysAgo));
      const [totalBusinesses] = await db.select({ value: count() }).from(businesses);
      const [activeSubs] = await db
        .select({ value: count() })
        .from(subscriptions)
        .where(eq(subscriptions.status, "active"));
      const [pendingUsers] = await db
        .select({ value: count() })
        .from(users)
        .where(eq(users.status, "pending"));
      const [newDemoRequests] = await db
        .select({ value: count() })
        .from(demoRequests)
        .where(eq(demoRequests.status, "new"));
      const [pendingSubRequests] = await db
        .select({ value: count() })
        .from(subscriptionRequests)
        .where(eq(subscriptionRequests.status, "pending"));
      const [voiceRow] = await db
        .select({
          minutes: sql<number>`coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at)) / 60.0), 0)::float`,
        })
        .from(voiceSessions)
        .where(gte(voiceSessions.startedAt, monthStart));
      const settings = await getSettingsMap();

      const voiceMinutes = Number(voiceRow?.minutes ?? 0);

      const conditions = [];
      if (search) {
        conditions.push(
          or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))!,
        );
      }
      if (status) {
        conditions.push(eq(users.status, status));
      }
      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [totalRow] = await db.select({ value: count() }).from(users).where(whereClause);
      const userRows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          status: users.status,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const recentSignupRows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          status: users.status,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(10);

      const [listedUsers, recentSignups] = await Promise.all([
        enrichUsers(userRows),
        enrichUsers(recentSignupRows),
      ]);

      return {
        metrics: {
          total_users: totalUsers?.value ?? 0,
          active_users_30d: activeUsers?.value ?? 0,
          pending_users: pendingUsers?.value ?? 0,
          new_demo_requests: newDemoRequests?.value ?? 0,
          pending_subscription_requests: pendingSubRequests?.value ?? 0,
          total_workspaces: totalBusinesses?.value ?? 0,
          active_subscriptions: activeSubs?.value ?? 0,
          manual_mrr: Number(settings.manual_mrr || 0),
          voice_minutes_this_month: Math.round(voiceMinutes * 10) / 10,
          whatsapp_messages_this_month: 0,
        },
        users: {
          items: listedUsers,
          total: totalRow?.value ?? 0,
          page,
          limit,
        },
        recent_signups: recentSignups,
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/users", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "users:read");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);
      const search = typeof query.search === "string" ? query.search.trim() : "";
      const status = typeof query.status === "string" ? query.status.trim() : "";

      const conditions = [];
      if (search) {
        conditions.push(
          or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))!,
        );
      }
      if (status) conditions.push(eq(users.status, status));
      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [totalRow] = await db.select({ value: count() }).from(users).where(whereClause);
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          status: users.status,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items: await enrichUsers(rows),
        total: totalRow?.value ?? 0,
        page,
        limit,
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/users/:id", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "users:read");
      const { id } = request.params as { id: string };

      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return reply.status(404).send({ detail: "User not found" });

      const memberships = await db
        .select({
          businessId: businesses.id,
          businessName: businesses.name,
          slug: businesses.slug,
          isActive: businesses.isActive,
          role: businessMembers.role,
          planName: subscriptions.planName,
          subStatus: subscriptions.status,
          createdAt: businesses.createdAt,
        })
        .from(businessMembers)
        .innerJoin(businesses, eq(businesses.id, businessMembers.businessId))
        .leftJoin(subscriptions, eq(subscriptions.businessId, businesses.id))
        .where(eq(businessMembers.userId, id))
        .orderBy(asc(businesses.name));

      const userAudits = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, "user"), eq(auditLogs.entityId, id)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(50);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        status: user.status,
        created_at: user.createdAt.toISOString(),
        last_login_at: user.lastLoginAt?.toISOString() ?? null,
        workspaces: memberships.map((m) => ({
          id: m.businessId,
          name: m.businessName,
          slug: m.slug,
          is_active: m.isActive,
          role: m.role,
          plan: m.planName ?? "starter",
          subscription_status: m.subStatus ?? "active",
          created_at: m.createdAt.toISOString(),
        })),
        audit_logs: userAudits.map((a) => ({
          id: a.id,
          action: a.action,
          admin_id: a.adminId,
          metadata: safeJson(a.metadataJson),
          created_at: a.createdAt.toISOString(),
        })),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/platform/users/:id/status", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "users:write");
      const { id } = request.params as { id: string };
      const body = request.body as { status?: string };
      const status = body.status?.trim();
      if (status !== "active" && status !== "suspended") {
        return reply.status(400).send({ detail: "status must be active or suspended" });
      }

      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return reply.status(404).send({ detail: "User not found" });

      const action =
        user.status === "pending" && status === "active"
          ? "user.approve"
          : user.status === "pending" && status === "suspended"
            ? "user.reject"
            : status === "suspended"
              ? "user.suspend"
              : "user.reactivate";

      await db.update(users).set({ status }).where(eq(users.id, id));
      clearUserCache(id);

      if (user.status === "pending" && status === "active") {
        await ensureTrialEntitlement(id);
      }

      await writeAuditLog({
        adminId: admin.id,
        action,
        entityType: "user",
        entityId: id,
        metadata: { previous: user.status, next: status },
        request,
      });

      return { id, status };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/users/:id/reset-password", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "users:write");
      const { id } = request.params as { id: string };

      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return reply.status(404).send({ detail: "User not found" });

      const temporaryPassword = randomBytes(9).toString("base64url");
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(temporaryPassword) })
        .where(eq(users.id, id));

      await writeAuditLog({
        adminId: admin.id,
        action: "user.reset_password",
        entityType: "user",
        entityId: id,
        request,
      });

      return {
        id,
        temporary_password: temporaryPassword,
        note: "Share this temporary password securely with the customer. Email delivery is not configured in MVP.",
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/businesses", async (request, reply) => {
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
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/businesses/:id", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "businesses:read");
      const { id } = request.params as { id: string };

      const business = await db.query.businesses.findFirst({ where: eq(businesses.id, id) });
      if (!business) return reply.status(404).send({ detail: "Business not found" });

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
      return sendAuthError(reply, err);
    }
  });

  app.patch("/platform/businesses/:id/status", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "businesses:write");
      const { id } = request.params as { id: string };
      const body = request.body as { status?: string };
      const isActive = body.status === "active";
      if (body.status !== "active" && body.status !== "disabled") {
        return reply.status(400).send({ detail: "status must be active or disabled" });
      }

      const business = await db.query.businesses.findFirst({ where: eq(businesses.id, id) });
      if (!business) return reply.status(404).send({ detail: "Business not found" });

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
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/businesses/:id/impersonate", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "impersonate");
      const { id } = request.params as { id: string };

      const business = await db.query.businesses.findFirst({ where: eq(businesses.id, id) });
      if (!business) return reply.status(404).send({ detail: "Business not found" });

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
        return reply.status(400).send({ detail: "Business has no members to impersonate." });
      }
      if (targetUser.status === "suspended") {
        return reply.status(400).send({ detail: "Cannot impersonate a suspended user." });
      }
      if (targetUser.status === "pending") {
        return reply.status(400).send({ detail: "Cannot impersonate a pending user." });
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
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/subscriptions", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);
      const search = typeof query.search === "string" ? query.search.trim() : "";
      const status = typeof query.status === "string" ? query.status.trim() : "";

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
        })),
        total: totalRow?.value ?? 0,
        page,
        limit,
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/platform/subscriptions/:id", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as {
        plan_name?: string;
        billing_cycle?: string;
        status?: string;
        start_date?: string | null;
        end_date?: string | null;
        notes?: string;
      };

      const existing = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.id, id),
      });
      if (!existing) return reply.status(404).send({ detail: "Subscription not found" });

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
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/settings", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "dashboard");
      return await getSettingsMap();
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/platform/settings", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "settings:write");
      const body = request.body as Record<string, string>;
      if (!body || typeof body !== "object") {
        return reply.status(400).send({ detail: "Expected settings object" });
      }

      for (const [key, value] of Object.entries(body)) {
        if (typeof value !== "string") continue;
        await db
          .insert(platformSettings)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: { value, updatedAt: new Date() },
          });
      }

      await writeAuditLog({
        adminId: admin.id,
        action: "settings.update",
        entityType: "platform_settings",
        entityId: "global",
        metadata: body,
        request,
      });

      return await getSettingsMap();
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/demo-requests", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "demo_requests:read");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);
      const search = typeof query.search === "string" ? query.search.trim() : "";
      const status = typeof query.status === "string" ? query.status.trim() : "";

      const conditions = [];
      if (search) {
        conditions.push(
          or(
            ilike(demoRequests.email, `%${search}%`),
            ilike(demoRequests.companyName, `%${search}%`),
            ilike(demoRequests.city, `%${search}%`),
            ilike(demoRequests.country, `%${search}%`),
            ilike(demoRequests.phone, `%${search}%`),
          )!,
        );
      }
      if (status) {
        conditions.push(eq(demoRequests.status, status));
      }
      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(demoRequests)
        .where(whereClause);
      const rows = await db
        .select()
        .from(demoRequests)
        .where(whereClause)
        .orderBy(desc(demoRequests.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items: rows.map((r) => ({
          id: r.id,
          email: r.email,
          phone: r.phone,
          company_name: r.companyName,
          city: r.city,
          country: r.country,
          business_industry: r.businessIndustry,
          branch_total: r.branchTotal,
          preferred_date: r.preferredDate
            ? r.preferredDate.toISOString().slice(0, 10)
            : null,
          preferred_time: r.preferredTime,
          status: r.status,
          notes: r.notes,
          created_at: r.createdAt.toISOString(),
          updated_at: r.updatedAt.toISOString(),
        })),
        total: totalRow?.value ?? 0,
        page,
        limit,
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/platform/demo-requests/:id", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "demo_requests:write");
      const { id } = request.params as { id: string };
      const body = request.body as { status?: string; notes?: string };

      const existing = await db.query.demoRequests.findFirst({
        where: eq(demoRequests.id, id),
      });
      if (!existing) return reply.status(404).send({ detail: "Demo request not found" });

      const nextStatus = body.status?.trim();
      if (nextStatus && !["new", "contacted", "closed"].includes(nextStatus)) {
        return reply.status(400).send({ detail: "status must be new, contacted, or closed" });
      }

      const [updated] = await db
        .update(demoRequests)
        .set({
          status: nextStatus || existing.status,
          notes: body.notes !== undefined ? String(body.notes) : existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(demoRequests.id, id))
        .returning();

      await writeAuditLog({
        adminId: admin.id,
        action: "demo_request.update",
        entityType: "demo_request",
        entityId: id,
        metadata: { previous: existing, next: updated },
        request,
      });

      return {
        id: updated!.id,
        email: updated!.email,
        phone: updated!.phone,
        company_name: updated!.companyName,
        city: updated!.city,
        country: updated!.country,
        business_industry: updated!.businessIndustry,
        branch_total: updated!.branchTotal,
        preferred_date: updated!.preferredDate
          ? updated!.preferredDate.toISOString().slice(0, 10)
          : null,
        preferred_time: updated!.preferredTime,
        status: updated!.status,
        notes: updated!.notes,
        created_at: updated!.createdAt.toISOString(),
        updated_at: updated!.updatedAt.toISOString(),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/audit-logs", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "audit:read");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);

      const [totalRow] = await db.select({ value: count() }).from(auditLogs);
      const rows = await db
        .select({
          id: auditLogs.id,
          adminId: auditLogs.adminId,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadataJson: auditLogs.metadataJson,
          ipAddress: auditLogs.ipAddress,
          userAgent: auditLogs.userAgent,
          createdAt: auditLogs.createdAt,
          adminEmail: platformAdmins.email,
          adminName: platformAdmins.name,
        })
        .from(auditLogs)
        .leftJoin(platformAdmins, eq(platformAdmins.id, auditLogs.adminId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items: rows.map((r) => ({
          id: r.id,
          admin_id: r.adminId,
          admin_email: r.adminEmail,
          admin_name: r.adminName,
          action: r.action,
          entity_type: r.entityType,
          entity_id: r.entityId,
          metadata: safeJson(r.metadataJson),
          ip_address: r.ipAddress,
          user_agent: r.userAgent,
          created_at: r.createdAt.toISOString(),
        })),
        total: totalRow?.value ?? 0,
        page,
        limit,
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/subscription-requests", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);
      const search = typeof query.search === "string" ? query.search.trim() : "";
      const status = typeof query.status === "string" ? query.status.trim() : "";

      const conditions = [];
      if (status) conditions.push(eq(subscriptionRequests.status, status));
      if (search) {
        conditions.push(
          or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))!,
        );
      }
      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(subscriptionRequests)
        .innerJoin(users, eq(users.id, subscriptionRequests.userId))
        .where(whereClause);

      const rows = await db
        .select({
          id: subscriptionRequests.id,
          status: subscriptionRequests.status,
          createdAt: subscriptionRequests.createdAt,
          reviewedAt: subscriptionRequests.reviewedAt,
          notes: subscriptionRequests.notes,
          userId: users.id,
          userName: users.name,
          userEmail: users.email,
          planCode: plans.code,
          planName: plans.name,
          planLimit: plans.workspaceLimit,
          trialEndsAt: accountSubscriptions.trialEndsAt,
          entitlementStatus: accountSubscriptions.status,
        })
        .from(subscriptionRequests)
        .innerJoin(users, eq(users.id, subscriptionRequests.userId))
        .innerJoin(plans, eq(plans.id, subscriptionRequests.requestedPlanId))
        .leftJoin(accountSubscriptions, eq(accountSubscriptions.userId, users.id))
        .where(whereClause)
        .orderBy(desc(subscriptionRequests.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items: rows.map((r) => ({
          id: r.id,
          status: r.status,
          created_at: r.createdAt.toISOString(),
          reviewed_at: r.reviewedAt?.toISOString() ?? null,
          notes: r.notes,
          customer: { id: r.userId, name: r.userName, email: r.userEmail },
          requested_plan: {
            code: r.planCode,
            name: r.planName,
            workspace_limit: r.planLimit,
          },
          trial_ends_at: r.trialEndsAt?.toISOString() ?? null,
          entitlement_status: r.entitlementStatus ?? null,
        })),
        total: totalRow?.value ?? 0,
        page,
        limit,
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/subscription-requests/:id", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");
      const { id } = request.params as { id: string };

      const [row] = await db
        .select({
          id: subscriptionRequests.id,
          status: subscriptionRequests.status,
          createdAt: subscriptionRequests.createdAt,
          reviewedAt: subscriptionRequests.reviewedAt,
          reviewedBy: subscriptionRequests.reviewedBy,
          notes: subscriptionRequests.notes,
          userId: users.id,
          userName: users.name,
          userEmail: users.email,
          userPhone: users.phone,
          planCode: plans.code,
          planName: plans.name,
          planLimit: plans.workspaceLimit,
        })
        .from(subscriptionRequests)
        .innerJoin(users, eq(users.id, subscriptionRequests.userId))
        .innerJoin(plans, eq(plans.id, subscriptionRequests.requestedPlanId))
        .where(eq(subscriptionRequests.id, id))
        .limit(1);

      if (!row) return reply.status(404).send({ detail: "Request not found" });

      const entitlement = await getEntitlementSnapshot(row.userId);
      const paidPlans = await listPaidPlans();

      return {
        id: row.id,
        status: row.status,
        created_at: row.createdAt.toISOString(),
        reviewed_at: row.reviewedAt?.toISOString() ?? null,
        reviewed_by: row.reviewedBy,
        notes: row.notes,
        customer: {
          id: row.userId,
          name: row.userName,
          email: row.userEmail,
          phone: row.userPhone,
        },
        requested_plan: {
          code: row.planCode,
          name: row.planName,
          workspace_limit: row.planLimit,
        },
        entitlement,
        available_plans: paidPlans.map((p) => ({
          code: p.code,
          name: p.name,
          workspace_limit: p.workspaceLimit,
        })),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/subscription-requests/:id/activate", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as {
        plan_code?: string;
        duration_months?: number;
        custom_ends_at?: string;
        notes?: string;
      };

      let customEndsAt: Date | null = null;
      if (body.custom_ends_at) {
        customEndsAt = new Date(body.custom_ends_at);
        if (Number.isNaN(customEndsAt.getTime())) {
          return reply.status(400).send({ detail: "Invalid custom_ends_at" });
        }
      }

      try {
        const entitlement = await activateSubscriptionRequest({
          requestId: id,
          adminId: admin.id,
          planCode: body.plan_code,
          durationMonths: customEndsAt ? null : (body.duration_months ?? 12),
          customEndsAt,
          notes: body.notes,
        });

        await writeAuditLog({
          adminId: admin.id,
          action: "subscription_request.activate",
          entityType: "subscription_request",
          entityId: id,
          metadata: {
            plan_code: entitlement.plan_code,
            ends_at: entitlement.ends_at,
          },
          request,
        });

        return { id, status: "approved", entitlement };
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return reply.status((err as Error & { statusCode: number }).statusCode).send({
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/subscription-requests/:id/reject", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as { notes?: string };

      try {
        await rejectSubscriptionRequest({
          requestId: id,
          adminId: admin.id,
          notes: body.notes,
        });
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return reply.status((err as Error & { statusCode: number }).statusCode).send({
            detail: err.message,
          });
        }
        throw err;
      }

      await writeAuditLog({
        adminId: admin.id,
        action: "subscription_request.reject",
        entityType: "subscription_request",
        entityId: id,
        metadata: { notes: body.notes ?? "" },
        request,
      });

      return { id, status: "rejected" };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/platform/addon-requests", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);
      const search = typeof query.search === "string" ? query.search.trim() : "";
      const status = typeof query.status === "string" ? query.status.trim() : "";

      const { items, total } = await listAddonRequestRows({
        status: status || undefined,
        search: search || undefined,
        limit,
        offset,
      });

      return {
        items: items.map((r) => ({
          id: r.id,
          status: r.status,
          created_at: r.createdAt.toISOString(),
          reviewed_at: r.reviewedAt?.toISOString() ?? null,
          notes: r.notes,
          payment_proof_url: r.paymentProofUrl,
          transaction_code: r.transactionCode,
          addon: { code: r.addonCode, name: r.addonName },
          workspace: { id: r.businessId, name: r.businessName, slug: r.businessSlug },
          owner: { id: r.userId, name: r.userName, email: r.userEmail },
        })),
        total,
        page,
        limit,
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/addon-requests/:id/approve", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as {
        duration_months?: number;
        custom_ends_at?: string;
        notes?: string;
      };

      let customEndsAt: Date | null = null;
      if (body.custom_ends_at) {
        customEndsAt = new Date(body.custom_ends_at);
        if (Number.isNaN(customEndsAt.getTime())) {
          return reply.status(400).send({ detail: "Invalid custom_ends_at" });
        }
      }

      try {
        const sub = await approveAddonRequest({
          requestId: id,
          adminId: admin.id,
          durationMonths: customEndsAt ? null : (body.duration_months ?? 12),
          customEndsAt,
          notes: body.notes,
        });

        await writeAuditLog({
          adminId: admin.id,
          action: "addon_request.approve",
          entityType: "addon_request",
          entityId: id,
          metadata: {
            addon_code: sub.addonCode,
            business_id: sub.businessId,
            ends_at: sub.endsAt?.toISOString() ?? null,
          },
          request,
        });

        return {
          id,
          status: "approved",
          subscription: {
            status: sub.status,
            starts_at: sub.startsAt?.toISOString() ?? null,
            ends_at: sub.endsAt?.toISOString() ?? null,
          },
        };
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return reply.status((err as Error & { statusCode: number }).statusCode).send({
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/addon-requests/:id/reject", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as { notes?: string };

      try {
        await rejectAddonRequest({
          requestId: id,
          adminId: admin.id,
          notes: body.notes,
        });
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return reply.status((err as Error & { statusCode: number }).statusCode).send({
            detail: err.message,
          });
        }
        throw err;
      }

      await writeAuditLog({
        adminId: admin.id,
        action: "addon_request.reject",
        entityType: "addon_request",
        entityId: id,
        metadata: { notes: body.notes ?? "" },
        request,
      });

      return { id, status: "rejected" };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/platform/addon-requests/:id/suspend", async (request, reply) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as { notes?: string };

      const { items } = await listAddonRequestRows({ limit: 500, offset: 0 });
      const found = items.find((r) => r.id === id);
      if (!found) return reply.status(404).send({ detail: "Request not found" });

      try {
        const sub = await suspendAddon({
          businessId: found.businessId,
          addonCode: found.addonCode,
          adminId: admin.id,
          notes: body.notes,
        });

        await writeAuditLog({
          adminId: admin.id,
          action: "addon.suspend",
          entityType: "addon_subscription",
          entityId: sub.id,
          metadata: { business_id: found.businessId, addon_code: found.addonCode },
          request,
        });

        return { id, status: "suspended" };
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return reply.status((err as Error & { statusCode: number }).statusCode).send({
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
