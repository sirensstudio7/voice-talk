import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { approveTopupOrder, listPlatformTopupOrders, orderOut, rejectTopupOrder } from "../../services/voice-minutes.js";
import { optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

export const topupOrderRejectBody = t.Object({
  notes: optionalString,
});

export async function registerPlatformTopupOrderRoutes(app: Elysia): Promise<void> {
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
      const body = request.body;
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
  }, {
    body: topupOrderRejectBody,
  });
}
