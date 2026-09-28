import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db } from "../../db/client.js";
import { plans, accountSubscriptions, subscriptionRequests, users } from "../../db/schema.js";
import { activateSubscriptionRequest, getEntitlementSnapshot, listPaidPlans, rejectSubscriptionRequest } from "../../services/entitlement.js";
import { optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";
import { parsePagination } from "./shared.js";

export const subscriptionRequestActivateBody = t.Object({
  plan_code: optionalString,
  duration_months: t.Optional(t.Number()),
  custom_ends_at: optionalString,
  notes: optionalString,
});

export const subscriptionRequestRejectBody = t.Object({
  notes: optionalString,
});

export async function registerPlatformSubscriptionRequestRoutes(app: Elysia): Promise<void> {
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
      const body = request.body;

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
  }, {
    body: subscriptionRequestActivateBody,
  });

  app.post("/platform/subscription-requests/:id/reject", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body;

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
  }, {
    body: subscriptionRequestRejectBody,
  });
}
