import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { approveAddonRequest, listAddonRequestRows, rejectAddonRequest, suspendAddon } from "../../services/addon-entitlement.js";
import { optionalString, listQueryFields } from "../../http/validation.js";
import { t, type Elysia } from "elysia";
import { parsePagination } from "./shared.js";

export const addonRequestApproveBody = t.Object({
  duration_months: t.Optional(t.Number()),
  custom_ends_at: optionalString,
  notes: optionalString,
});

export const addonRequestNotesBody = t.Object({
  notes: optionalString,
});

export async function registerPlatformAddonRequestRoutes(app: Elysia): Promise<void> {
  app.get("/platform/addon-requests", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:read");

      const query = request.query;
      const { page, limit, offset } = parsePagination(query);
      const search = query.search?.trim() ?? "";
      const status = query.status?.trim() ?? "";

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
  }, {
    query: t.Object({
      ...listQueryFields,
      status: optionalString,
    }),
  });

  app.post("/platform/addon-requests/:id/approve", async (request) => {
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
  }, {
    body: addonRequestApproveBody,
  });

  app.post("/platform/addon-requests/:id/reject", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body;

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
  }, {
    body: addonRequestNotesBody,
  });

  app.post("/platform/addon-requests/:id/suspend", async (request) => {
    try {
      const admin = await getCurrentPlatformAdmin(request);
      requirePermission(admin.role, "subscriptions:write");
      const { id } = request.params as { id: string };
      const body = request.body;

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
  }, {
    body: addonRequestNotesBody,
  });
}
