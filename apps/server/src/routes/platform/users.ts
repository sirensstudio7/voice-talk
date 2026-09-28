import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { sendAuthError, hashPassword, clearUserCache } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db } from "../../db/client.js";
import { auditLogs, businessMembers, businesses, subscriptions, users } from "../../db/schema.js";
import { ensureTrialEntitlement } from "../../services/entitlement.js";
import { listPlatformProviderKeys, listUserApiKeys, publicPlatformProviderKeys, setUserAssignedProviderKey, userAssignment } from "../../services/user-api-keys.js";
import type { Elysia } from "elysia";
import { parsePagination, enrichUsers, safeJson } from "./shared.js";

export async function registerPlatformUserRoutes(app: Elysia): Promise<void> {
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
}
