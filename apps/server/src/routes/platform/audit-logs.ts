import { count, desc, eq } from "drizzle-orm";
import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db } from "../../db/client.js";
import { auditLogs, platformAdmins } from "../../db/schema.js";
import type { Elysia } from "elysia";
import { parsePagination, safeJson } from "./shared.js";

export async function registerPlatformAuditLogRoutes(app: Elysia): Promise<void> {
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
}
