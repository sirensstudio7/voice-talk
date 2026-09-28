import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { withDbTimeout } from "../../db/client.js";
import { businesses, demoRequests, subscriptionRequests, subscriptions, users, voiceSessions } from "../../db/schema.js";
import type { Elysia } from "elysia";
import { parsePagination, getSettingsMap, enrichUsers } from "./shared.js";

export async function registerPlatformDashboardRoutes(app: Elysia): Promise<void> {
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
}
