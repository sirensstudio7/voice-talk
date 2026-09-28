import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { Elysia } from "elysia";
import type { AuthContext } from "../http/context.js";
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
import { db, withDbTimeout } from "../db/client.js";
import { withLoginDb } from "../db/login-db.js";
import {
  addons,
  aiRules,
  auditLogs,
  businessMembers,
  businesses,
  demoRequests,
  platformAdmins,
  platformSettings,
  plans,
  products,
  topupPackages,
  accountSubscriptions,
  subscriptionRequests,
  subscriptions,
  users,
  visionSettings,
  voiceSessions,
} from "../db/schema.js";
import {
  normalizeGreetingTriggerMode,
  normalizeVisionSource,
} from "../services/vision-settings.js";
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
import {
  applyAdminAdjustment,
  approveTopupOrder,
  getVoiceMinuteWallet,
  listMinuteLedger,
  listPlatformTopupOrders,
  orderOut,
  rejectTopupOrder,
} from "../services/voice-minutes.js";
import {
  listPlatformProviderKeys,
  listUserApiKeys,
  publicPlatformProviderKeys,
  setUserAssignedProviderKey,
  userAssignment,
  usersWithCustomApiKeys,
} from "../services/user-api-keys.js";

function clientKey(request: AuthContext): string {
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

const SECRET_SETTING_KEYS = new Set([
  "elevenlabs_api_key",
  "custom_voice_api_key",
  "provider_api_keys",
]);

type ProviderApiKey = {
  id: string;
  provider: string;
  label: string;
  key: string;
};

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `••••••••${trimmed.slice(-4)}`;
}

function looksLikeMaskedSecret(value: string): boolean {
  return /^•+/.test(value.trim());
}

function parseProviderApiKeys(raw: string): ProviderApiKey[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      const provider = String(row.provider ?? "").trim().toLowerCase();
      if (!id || !provider) return [];
      return [
        {
          id,
          provider,
          label: String(row.label ?? "").trim(),
          key: String(row.key ?? ""),
        },
      ];
    });
  } catch {
    return [];
  }
}

function withLegacyProviderKeys(map: Record<string, string>): ProviderApiKey[] {
  const items = parseProviderApiKeys(map.provider_api_keys ?? "[]");
  const has = (provider: string) => items.some((item) => item.provider === provider && item.key.trim());
  if ((map.elevenlabs_api_key ?? "").trim() && !has("elevenlabs")) {
    items.push({
      id: "legacy-elevenlabs",
      provider: "elevenlabs",
      label: "ElevenLabs",
      key: map.elevenlabs_api_key,
    });
  }
  if ((map.custom_voice_api_key ?? "").trim() && !has("custom")) {
    items.push({
      id: "legacy-custom",
      provider: "custom",
      label: "Custom",
      key: map.custom_voice_api_key,
    });
  }
  return items;
}

function mergeProviderApiKeys(incomingRaw: string, existing: ProviderApiKey[]): ProviderApiKey[] {
  const existingById = new Map(existing.map((item) => [item.id, item]));
  return parseProviderApiKeys(incomingRaw)
    .map((row) => {
      const previous = existingById.get(row.id);
      const nextKey = looksLikeMaskedSecret(row.key) ? (previous?.key ?? "") : row.key.trim();
      return {
        id: row.id,
        provider: row.provider,
        label: row.label,
        key: nextKey,
      };
    })
    .filter((row) => row.provider && (row.key || row.label));
}

function redactSettings(map: Record<string, string>): Record<string, string> {
  const out = { ...map };
  const items = withLegacyProviderKeys(out);
  out.provider_api_keys = JSON.stringify(
    items.map((item) => ({
      id: item.id,
      provider: item.provider,
      label: item.label,
      key: maskSecret(item.key),
      set: Boolean(item.key.trim()),
    })),
  );
  for (const key of ["elevenlabs_api_key", "custom_voice_api_key"] as const) {
    const raw = out[key] ?? "";
    out[`${key}_set`] = raw.trim() ? "true" : "false";
    out[key] = maskSecret(raw);
  }
  return out;
}

async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(platformSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function getPublicSettingsMap(): Promise<Record<string, string>> {
  return redactSettings(await getSettingsMap());
}

const DEFAULT_USD_IDR_RATE = 16500;
const FX_CACHE_MS = 15 * 60 * 1000;
let cachedUsdIdr: { rate: number; fetchedAt: number; marketAt: string | null; source: string } | null =
  null;

type UsdIdrQuote = {
  rate: number;
  market_at: string | null;
  source: "live" | "manual" | "fallback";
};

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchLiveUsdIdr(): Promise<{ rate: number; marketAt: string; source: string } | null> {
  const open = (await fetchJson("https://open.er-api.com/v6/latest/USD")) as {
    result?: string;
    time_last_update_utc?: string;
    rates?: { IDR?: number };
  } | null;
  const openRate = Number(open?.rates?.IDR);
  if (open?.result === "success" && Number.isFinite(openRate) && openRate > 0) {
    return {
      rate: openRate,
      marketAt: open.time_last_update_utc ?? new Date().toISOString(),
      source: "open.er-api.com",
    };
  }

  const frankfurter = (await fetchJson("https://api.frankfurter.app/latest?from=USD&to=IDR")) as {
    date?: string;
    rates?: { IDR?: number };
  } | null;
  const frankRate = Number(frankfurter?.rates?.IDR);
  if (Number.isFinite(frankRate) && frankRate > 0) {
    return {
      rate: frankRate,
      marketAt: frankfurter?.date ? `${frankfurter.date}T00:00:00.000Z` : new Date().toISOString(),
      source: "frankfurter.app",
    };
  }
  return null;
}

async function resolveUsdIdrQuote(): Promise<UsdIdrQuote> {
  const settings = await getSettingsMap();
  const override = Number(settings.usd_idr_rate);
  if (Number.isFinite(override) && override > 0) {
    return { rate: override, market_at: null, source: "manual" };
  }
  if (cachedUsdIdr && Date.now() - cachedUsdIdr.fetchedAt < FX_CACHE_MS) {
    return { rate: cachedUsdIdr.rate, market_at: cachedUsdIdr.marketAt, source: "live" };
  }
  const live = await fetchLiveUsdIdr();
  if (live) {
    cachedUsdIdr = {
      rate: live.rate,
      fetchedAt: Date.now(),
      marketAt: live.marketAt,
      source: live.source,
    };
    return { rate: live.rate, market_at: live.marketAt, source: "live" };
  }
  if (cachedUsdIdr) {
    return { rate: cachedUsdIdr.rate, market_at: cachedUsdIdr.marketAt, source: "live" };
  }
  return { rate: DEFAULT_USD_IDR_RATE, market_at: null, source: "fallback" };
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
  const keyedUsers = await usersWithCustomApiKeys(ids);
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
      has_custom_api_keys: keyedUsers.has(row.id),
      created_at: row.createdAt.toISOString(),
      last_login_at: row.lastLoginAt?.toISOString() ?? null,
    };
  });
}

export async function registerPlatformRoutes(app: Elysia): Promise<void> {
  try {
    await ensurePlatformAdminSeed();
  } catch (error) {
    console.warn(
      "[auth] platform admin seed skipped:",
      error instanceof Error ? error.message : error,
    );
  }

  app.post("/platform/auth/login", async (request) => {
    const key = `login:${clientKey(request)}`;
    if (!checkLoginRateLimit(key)) {
      return request.status(429, { detail: "Too many login attempts. Try again later." });
    }

    const body = request.body as { email?: string; password?: string };
    try {
      const admin = await authenticatePlatformPassword(body.email ?? "", body.password ?? "");
      const now = new Date();
      // Keep post-auth writes off the shared pool so a stuck pool cannot block login.
      await withLoginDb(async (loginDb) => {
        await loginDb
          .update(platformAdmins)
          .set({ lastLoginAt: now })
          .where(eq(platformAdmins.id, admin.id));
      });
      void writeAuditLog({
        adminId: admin.id,
        action: "login",
        entityType: "platform_admin",
        entityId: admin.id,
        request,
      }).catch(() => {
        // Best-effort — never block login on audit insert.
      });
      return {
        access_token: createPlatformAccessToken(admin.id, admin.role),
        token_type: "bearer",
        admin: platformAdminOut({ ...admin, lastLoginAt: now }),
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/auth/setup-2fa", async (request) => {
    try {
      const admin = await getPlatformAdminFromPending(request);
      if (admin.totpEnabled && admin.totpSecret) {
        return request.status(400, { detail: "2FA is already enabled." });
      }
      const { secret, otpauthUrl } = generateTotpSecret(admin.email);
      await db
        .update(platformAdmins)
        .set({ totpSecret: secret, totpEnabled: false })
        .where(eq(platformAdmins.id, admin.id));
      return { secret, otpauth_url: otpauthUrl };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/auth/verify-2fa", async (request) => {
    const body = request.body as { code?: string };
    const code = body.code?.trim() ?? "";
    try {
      const admin = await getPlatformAdminFromPending(request);
      if (!admin.totpSecret) {
        return request.status(400, { detail: "2FA is not set up. Call setup-2fa first." });
      }
      if (!verifyTotpCode(admin.totpSecret, code)) {
        return request.status(401, { detail: "Invalid 2FA code." });
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
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/auth/logout", async (request) => {
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
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/auth/me", async (request) => {
    try {
      return platformAdminOut(await getCurrentPlatformAdmin(request));
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/dashboard", async (request) => {
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

      return await withDbTimeout(async (database) => {
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

        const [
          [totalUsers],
          [activeUsers],
          [totalBusinesses],
          [activeSubs],
          [pendingUsers],
          [newDemoRequests],
          [pendingSubRequests],
          [voiceRow],
          settings,
          [totalRow],
          userRows,
          recentSignupRows,
        ] = await Promise.all([
          database.select({ value: count() }).from(users),
          database.select({ value: count() }).from(users).where(gte(users.lastLoginAt, thirtyDaysAgo)),
          database.select({ value: count() }).from(businesses),
          database
            .select({ value: count() })
            .from(subscriptions)
            .where(eq(subscriptions.status, "active")),
          database.select({ value: count() }).from(users).where(eq(users.status, "pending")),
          database.select({ value: count() }).from(demoRequests).where(eq(demoRequests.status, "new")),
          database
            .select({ value: count() })
            .from(subscriptionRequests)
            .where(eq(subscriptionRequests.status, "pending")),
          database
            .select({
              minutes: sql<number>`coalesce(sum(extract(epoch from (
            case
              when ended_at is not null then ended_at
              else least(now(), started_at + interval '15 minutes')
            end - started_at
          )) / 60.0), 0)::float`,
            })
            .from(voiceSessions)
            .where(gte(voiceSessions.startedAt, monthStart)),
          getSettingsMap(),
          database.select({ value: count() }).from(users).where(whereClause),
          database
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
            .offset(offset),
          database
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
            .limit(10),
        ]);

        const voiceMinutes = Number(voiceRow?.minutes ?? 0);
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
      }, 20_000);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/users", async (request) => {
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
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/users/:id", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "users:read");
      const { id } = request.params as { id: string };

      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return request.status(404, { detail: "User not found" });

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
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/users/:id/api-keys", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "users:read");
      const { id } = request.params as { id: string };
      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return request.status(404, { detail: "User not found" });
      const [keys, catalog] = await Promise.all([
        listUserApiKeys(id),
        listPlatformProviderKeys(),
      ]);
      return {
        source_id: userAssignment(keys).source_id,
        catalog: publicPlatformProviderKeys(catalog),
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/users/:id/api-keys", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "settings:write");
      const { id } = request.params as { id: string };
      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return request.status(404, { detail: "User not found" });

      const body = (request.body ?? {}) as { source_id?: string | null };
      const sourceId =
        typeof body.source_id === "string" ? body.source_id.trim() || null : body.source_id === null ? null : undefined;
      if (sourceId === undefined) {
        return request.status(400, { detail: "source_id is required" });
      }

      const saved = await setUserAssignedProviderKey(id, sourceId);
      await writeAuditLog({
        adminId: admin.id,
        action: "user.api_keys.update",
        entityType: "user",
        entityId: id,
        metadata: {
          source_id: sourceId,
          providers: saved.map((row) => row.provider),
        },
        request,
      });
      const catalog = await listPlatformProviderKeys();
      return {
        source_id: userAssignment(saved).source_id,
        catalog: publicPlatformProviderKeys(catalog),
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/users/:id/status", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "users:write");
      const { id } = request.params as { id: string };
      const body = request.body as { status?: string };
      const status = body.status?.trim();
      if (status !== "active" && status !== "suspended") {
        return request.status(400, { detail: "status must be active or suspended" });
      }

      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return request.status(404, { detail: "User not found" });

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
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/users/:id/reset-password", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "users:write");
      const { id } = request.params as { id: string };

      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) return request.status(404, { detail: "User not found" });

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
      return sendAuthError(request, err);
    }
  });

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
      const body = request.body as { status?: string };
      const isActive = body.status === "active";
      if (body.status !== "active" && body.status !== "disabled") {
        return request.status(400, { detail: "status must be active or disabled" });
      }

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

  app.get("/platform/vision", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "businesses:read");

      const query = request.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(query);
      const search = typeof query.search === "string" ? query.search.trim() : "";
      const sourceFilter =
        typeof query.vision_source === "string" ? query.vision_source.trim().toLowerCase() : "";

      const conditions = [];
      if (search) {
        conditions.push(
          or(ilike(businesses.name, `%${search}%`), ilike(businesses.slug, `%${search}%`))!,
        );
      }
      if (sourceFilter === "auto") {
        conditions.push(
          or(isNull(visionSettings.visionSource), eq(visionSettings.visionSource, "auto"))!,
        );
      } else if (
        sourceFilter === "python" ||
        sourceFilter === "browser" ||
        sourceFilter === "human"
      ) {
        conditions.push(eq(visionSettings.visionSource, sourceFilter));
      }
      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(businesses)
        .leftJoin(visionSettings, eq(visionSettings.businessId, businesses.id))
        .where(whereClause);

      const rows = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          isActive: businesses.isActive,
          cameraTriggerEnabled: visionSettings.cameraTriggerEnabled,
          visionSource: visionSettings.visionSource,
          greetingTriggerMode: visionSettings.greetingTriggerMode,
          updatedAt: visionSettings.updatedAt,
        })
        .from(businesses)
        .leftJoin(visionSettings, eq(visionSettings.businessId, businesses.id))
        .where(whereClause)
        .orderBy(desc(businesses.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          status: r.isActive ? "active" : "disabled",
          camera_trigger_enabled: r.cameraTriggerEnabled ?? false,
          vision_source: normalizeVisionSource(r.visionSource ?? "auto"),
          greeting_trigger_mode: normalizeGreetingTriggerMode(r.greetingTriggerMode ?? "presence"),
          updated_at: r.updatedAt ? r.updatedAt.toISOString() : null,
        })),
        total: totalRow?.value ?? 0,
        page,
        limit,
        sources: ["auto", "python", "browser", "human"] as const,
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/subscriptions", async (request) => {
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
  });

  app.patch("/platform/subscriptions/:id", async (request) => {
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
  });

  app.get("/platform/settings", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "dashboard");
      return await getPublicSettingsMap();
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/settings", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "settings:write");
      const body = request.body as Record<string, string>;
      if (!body || typeof body !== "object") {
        return request.status(400, { detail: "Expected settings object" });
      }

      const current = await getSettingsMap();
      const auditMeta: Record<string, string> = {};
      for (const [key, rawValue] of Object.entries(body)) {
        if (typeof rawValue !== "string") continue;
        if (key.endsWith("_set")) continue;
        let value = rawValue;
        if (key === "provider_api_keys") {
          const merged = mergeProviderApiKeys(value, withLegacyProviderKeys(current));
          value = JSON.stringify(merged);
          const eleven = merged.find((item) => item.provider === "elevenlabs");
          const custom = merged.find((item) => item.provider === "custom");
          current.elevenlabs_api_key = eleven?.key ?? "";
          current.custom_voice_api_key = custom?.key ?? "";
          for (const alias of ["elevenlabs_api_key", "custom_voice_api_key"] as const) {
            await db
              .insert(platformSettings)
              .values({ key: alias, value: current[alias] ?? "", updatedAt: new Date() })
              .onConflictDoUpdate({
                target: platformSettings.key,
                set: { value: current[alias] ?? "", updatedAt: new Date() },
              });
          }
        } else if (SECRET_SETTING_KEYS.has(key) && looksLikeMaskedSecret(value)) {
          continue;
        }
        await db
          .insert(platformSettings)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: { value, updatedAt: new Date() },
          });
        auditMeta[key] = SECRET_SETTING_KEYS.has(key)
          ? value.trim()
            ? "[updated]"
            : "[cleared]"
          : value;
      }

      await writeAuditLog({
        adminId: admin.id,
        action: "settings.update",
        entityType: "platform_settings",
        entityId: "global",
        metadata: auditMeta,
        request,
      });

      return await getPublicSettingsMap();
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/demo-requests", async (request) => {
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
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/demo-requests/:id", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "demo_requests:write");
      const { id } = request.params as { id: string };
      const body = request.body as { status?: string; notes?: string };

      const existing = await db.query.demoRequests.findFirst({
        where: eq(demoRequests.id, id),
      });
      if (!existing) return request.status(404, { detail: "Demo request not found" });

      const nextStatus = body.status?.trim();
      if (nextStatus && !["new", "contacted", "closed"].includes(nextStatus)) {
        return request.status(400, { detail: "status must be new, contacted, or closed" });
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
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/audit-logs", async (request) => {
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
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/subscription-requests", async (request) => {
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
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/subscription-requests/:id", async (request) => {
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

      if (!row) return request.status(404, { detail: "Request not found" });

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
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/subscription-requests/:id/activate", async (request) => {
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
          return request.status(400, { detail: "Invalid custom_ends_at" });
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
          return request.status((err as Error & { statusCode: number }).statusCode, {
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/subscription-requests/:id/reject", async (request) => {
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
          return request.status((err as Error & { statusCode: number }).statusCode, {
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
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/addon-requests", async (request) => {
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
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/addon-requests/:id/approve", async (request) => {
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
          return request.status(400, { detail: "Invalid custom_ends_at" });
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
          return request.status((err as Error & { statusCode: number }).statusCode, {
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/addon-requests/:id/reject", async (request) => {
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
          return request.status((err as Error & { statusCode: number }).statusCode, {
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
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/addon-requests/:id/suspend", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as { notes?: string };

      const { items } = await listAddonRequestRows({ limit: 500, offset: 0 });
      const found = items.find((r) => r.id === id);
      if (!found) return request.status(404, { detail: "Request not found" });

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
          return request.status((err as Error & { statusCode: number }).statusCode, {
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/topup-orders", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");
      const query = request.query as { status?: string; search?: string };
      const rows = await listPlatformTopupOrders({
        status: query.status,
        search: query.search,
      });
      return {
        items: rows.map((row) => ({
          ...orderOut(row),
          user_email: row.user_email,
          user_name: row.user_name,
        })),
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/topup-orders/:id/approve", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const order = await approveTopupOrder(id, admin.id);
      await writeAuditLog({
        adminId: admin.id,
        action: "topup_order.approve",
        entityType: "topup_order",
        entityId: id,
        metadata: { minutes: order.minutes, user_id: order.userId },
        request,
      });
      return orderOut(order);
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/topup-orders/:id/reject", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as { notes?: string };
      await rejectTopupOrder(id, admin.id, body.notes);
      await writeAuditLog({
        adminId: admin.id,
        action: "topup_order.reject",
        entityType: "topup_order",
        entityId: id,
        metadata: { notes: body.notes ?? "" },
        request,
      });
      return { id, status: "rejected" };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/users/:id/voice-minutes", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");
      const { id } = request.params as { id: string };
      const [wallet, ledger] = await Promise.all([
        getVoiceMinuteWallet(id),
        listMinuteLedger(id, 80),
      ]);
      return { wallet, ledger };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/platform/users/:id/voice-minutes/adjust", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body as { seconds?: number; note?: string };
      const wallet = await applyAdminAdjustment({
        userId: id,
        seconds: Number(body.seconds),
        adminId: admin.id,
        note: body.note,
      });
      await writeAuditLog({
        adminId: admin.id,
        action: "voice_minutes.adjust",
        entityType: "user",
        entityId: id,
        metadata: { seconds: body.seconds, note: body.note ?? "" },
        request,
      });
      return wallet;
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.get("/platform/pricing", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");
      const [planRows, addonRows, packageRows] = await withDbTimeout(
        (database) =>
          Promise.all([
            database.select().from(plans),
            database.select().from(addons),
            database.select().from(topupPackages),
          ]),
        20_000,
      );
      return {
        plans: planRows
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((plan) => ({
            id: plan.id,
            code: plan.code,
            name: plan.name,
            is_trial: plan.isTrial,
            workspace_limit: plan.workspaceLimit,
            kiosk_display_limit: plan.kioskDisplayLimit,
            monthly_price_idr: plan.monthlyPriceIdr,
            yearly_price_idr: plan.yearlyPriceIdr,
            yearly_discount_percent: plan.yearlyDiscountPercent,
            monthly_voice_minutes: Math.round(plan.monthlyVoiceSeconds / 60),
          })),
        addons: addonRows
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((addon) => ({
            id: addon.id,
            code: addon.code,
            name: addon.name,
            description: addon.description,
            price_display: addon.priceDisplay,
            monthly_price_idr: addon.monthlyPriceIdr,
            discount_3m_percent: addon.discount3mPercent,
            discount_6m_percent: addon.discount6mPercent,
            discount_12m_percent: addon.discount12mPercent,
          })),
        topup_packages: packageRows
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((pkg) => ({
            id: pkg.id,
            code: pkg.code,
            name: pkg.name,
            minutes: pkg.minutes,
            price_idr: pkg.priceIdr,
            discount_percent: pkg.discountPercent,
            expires_after_days: pkg.expiresAfterDays,
            is_popular: pkg.isPopular,
            status: pkg.status,
          })),
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/pricing/plans/:code", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { code } = request.params as { code: string };
      const body = (request.body ?? {}) as {
        monthly_price_idr?: number;
        yearly_price_idr?: number;
        yearly_discount_percent?: number;
        monthly_voice_minutes?: number;
        workspace_limit?: number;
        kiosk_display_limit?: number;
      };
      const plan = await db.query.plans.findFirst({ where: eq(plans.code, code) });
      if (!plan) {
        return request.status(404, { detail: "Plan not found." });
      }
      const updates: Partial<typeof plans.$inferInsert> = {};
      if (body.monthly_price_idr !== undefined) {
        updates.monthlyPriceIdr = parsePositiveInt(body.monthly_price_idr, "Monthly price");
      }
      if (body.yearly_discount_percent !== undefined) {
        updates.yearlyDiscountPercent = parsePercent(body.yearly_discount_percent, "Yearly discount");
      }
      const nextMonthly = updates.monthlyPriceIdr ?? plan.monthlyPriceIdr;
      const nextDiscount = updates.yearlyDiscountPercent ?? plan.yearlyDiscountPercent;
      if (body.monthly_price_idr !== undefined || body.yearly_discount_percent !== undefined) {
        updates.yearlyPriceIdr = yearlyFromMonthly(nextMonthly, nextDiscount);
      } else if (body.yearly_price_idr !== undefined) {
        updates.yearlyPriceIdr = parsePositiveInt(body.yearly_price_idr, "Yearly price");
      }
      if (body.monthly_voice_minutes !== undefined) {
        updates.monthlyVoiceSeconds = parsePositiveInt(body.monthly_voice_minutes, "Monthly minutes") * 60;
      }
      if (body.workspace_limit !== undefined) {
        const limit = parsePositiveInt(body.workspace_limit, "Workspace limit");
        if (limit < 1) {
          return request.status(400, { detail: "Workspace limit must be at least 1." });
        }
        updates.workspaceLimit = limit;
      }
      if (body.kiosk_display_limit !== undefined) {
        const limit = parsePositiveInt(body.kiosk_display_limit, "Kiosk display limit");
        if (limit < 1) {
          return request.status(400, { detail: "Kiosk display limit must be at least 1." });
        }
        updates.kioskDisplayLimit = limit;
      }
      if (Object.keys(updates).length === 0) {
        return request.status(400, { detail: "No pricing fields to update." });
      }
      const [updated] = await db.update(plans).set(updates).where(eq(plans.id, plan.id)).returning();
      await writeAuditLog({
        adminId: admin.id,
        action: "pricing.plan.update",
        entityType: "plan",
        entityId: plan.id,
        metadata: body,
        request,
      });
      return {
        id: updated!.id,
        code: updated!.code,
        name: updated!.name,
        is_trial: updated!.isTrial,
        workspace_limit: updated!.workspaceLimit,
        kiosk_display_limit: updated!.kioskDisplayLimit,
        monthly_price_idr: updated!.monthlyPriceIdr,
        yearly_price_idr: updated!.yearlyPriceIdr,
        yearly_discount_percent: updated!.yearlyDiscountPercent,
        monthly_voice_minutes: Math.round(updated!.monthlyVoiceSeconds / 60),
      };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/pricing/addons/:code", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { code } = request.params as { code: string };
      const body = (request.body ?? {}) as {
        monthly_price_idr?: number;
        discount_3m_percent?: number;
        discount_6m_percent?: number;
        discount_12m_percent?: number;
      };
      const addon = await db.query.addons.findFirst({ where: eq(addons.code, code) });
      if (!addon) {
        return request.status(404, { detail: "Add-on not found." });
      }
      const updates: Partial<typeof addons.$inferInsert> = {};
      if (body.monthly_price_idr !== undefined) {
        const monthly = parsePositiveInt(body.monthly_price_idr, "Monthly price");
        updates.monthlyPriceIdr = monthly;
        updates.priceDisplay = formatAddonPriceDisplay(monthly);
      }
      if (body.discount_3m_percent !== undefined) {
        updates.discount3mPercent = parsePercent(body.discount_3m_percent, "3-month discount");
      }
      if (body.discount_6m_percent !== undefined) {
        updates.discount6mPercent = parsePercent(body.discount_6m_percent, "6-month discount");
      }
      if (body.discount_12m_percent !== undefined) {
        updates.discount12mPercent = parsePercent(body.discount_12m_percent, "12-month discount");
      }
      if (Object.keys(updates).length === 0) {
        return request.status(400, { detail: "No pricing fields to update." });
      }
      const [updated] = await db.update(addons).set(updates).where(eq(addons.id, addon.id)).returning();
      await writeAuditLog({
        adminId: admin.id,
        action: "pricing.addon.update",
        entityType: "addon",
        entityId: addon.id,
        metadata: body,
        request,
      });
      return {
        id: updated!.id,
        code: updated!.code,
        name: updated!.name,
        description: updated!.description,
        price_display: updated!.priceDisplay,
        monthly_price_idr: updated!.monthlyPriceIdr,
        discount_3m_percent: updated!.discount3mPercent,
        discount_6m_percent: updated!.discount6mPercent,
        discount_12m_percent: updated!.discount12mPercent,
      };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.patch("/platform/pricing/topup-packages/:id", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as {
        price_idr?: number;
        minutes?: number;
        discount_percent?: number;
      };
      const pkg = await db.query.topupPackages.findFirst({ where: eq(topupPackages.id, id) });
      if (!pkg) {
        return request.status(404, { detail: "Top-up package not found." });
      }
      const updates: Partial<typeof topupPackages.$inferInsert> = { updatedAt: new Date() };
      if (body.price_idr !== undefined) {
        updates.priceIdr = parsePositiveInt(body.price_idr, "Price");
      }
      if (body.minutes !== undefined) {
        const minutes = parsePositiveInt(body.minutes, "Minutes");
        if (minutes < 1) {
          return request.status(400, { detail: "Minutes must be at least 1." });
        }
        updates.minutes = minutes;
      }
      if (body.discount_percent !== undefined) {
        updates.discountPercent = parsePercent(body.discount_percent, "Discount");
      }
      if (
        body.price_idr === undefined &&
        body.minutes === undefined &&
        body.discount_percent === undefined
      ) {
        return request.status(400, { detail: "No pricing fields to update." });
      }
      const [updated] = await db
        .update(topupPackages)
        .set(updates)
        .where(eq(topupPackages.id, id))
        .returning();
      await writeAuditLog({
        adminId: admin.id,
        action: "pricing.topup.update",
        entityType: "topup_package",
        entityId: id,
        metadata: body,
        request,
      });
      return {
        id: updated!.id,
        code: updated!.code,
        name: updated!.name,
        minutes: updated!.minutes,
        price_idr: updated!.priceIdr,
        discount_percent: updated!.discountPercent,
        expires_after_days: updated!.expiresAfterDays,
        is_popular: updated!.isPopular,
        status: updated!.status,
      };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });
}

function formatAddonPriceDisplay(amountIdr: number) {
  return `Rp${amountIdr.toLocaleString("id-ID")}/month`;
}

function parsePositiveInt(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    const err = new Error(`${label} must be a whole number.`) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function parsePercent(value: unknown, label: string) {
  const n = parsePositiveInt(value, label);
  if (n > 100) {
    const err = new Error(`${label} must be between 0 and 100.`) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function yearlyFromMonthly(monthlyIdr: number, discountPercent: number) {
  return Math.round(monthlyIdr * 12 * (1 - discountPercent / 100));
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
