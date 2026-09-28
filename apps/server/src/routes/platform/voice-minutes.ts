import { sendAuthError } from "../../auth/jwt.js";
import { getCurrentPlatformAdmin, writeAuditLog } from "../../auth/platform-auth.js";
import { requirePermission } from "../../auth/platform-rbac.js";
import { applyAdminAdjustment, getVoiceMinuteWallet, listMinuteLedger } from "../../services/voice-minutes.js";
import { numberLike, optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

export const voiceMinutesAdjustBody = t.Object({
  seconds: numberLike,
  note: optionalString,
});

export async function registerPlatformVoiceMinuteRoutes(app: Elysia): Promise<void> {
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
      const body = request.body;
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
  }, {
    body: voiceMinutesAdjustBody,
  });
}
