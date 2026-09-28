import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { db } from "../../db/client.js";
import { demoRequests } from "../../db/schema.js";
import { optionalString, listQueryFields } from "../../http/validation.js";
import { t, type Elysia } from "elysia";
import { parsePagination } from "./shared.js";

export const demoRequestUpdateBody = t.Object({
  status: optionalString,
  notes: optionalString,
});

export async function registerPlatformDemoRequestRoutes(app: Elysia): Promise<void> {
  app.get("/platform/demo-requests", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "demo_requests:read");

      const query = request.query;
      const { page, limit, offset } = parsePagination(query);
      const search = query.search?.trim() ?? "";
      const status = query.status?.trim() ?? "";

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
  }, {
    query: t.Object({
      ...listQueryFields,
      status: optionalString,
    }),
  });

  app.patch("/platform/demo-requests/:id", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "demo_requests:write");
      const { id } = request.params as { id: string };
      const body = request.body;

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
  }, {
    body: demoRequestUpdateBody,
  });
}
