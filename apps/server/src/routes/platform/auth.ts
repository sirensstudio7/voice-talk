import { eq } from "drizzle-orm";
import type { AuthContext } from "../../http/context.js";
import { sendAuthError } from "../../auth/jwt.js";
import { authenticatePlatformPassword, checkLoginRateLimit, createPlatformAccessToken, generateTotpSecret, getCurrentPlatformAdmin, getPlatformAdminFromPending, platformAdminOut, verifyTotpCode, writeAuditLog } from "../../auth/platform-auth.js";
import { db } from "../../db/client.js";
import { withLoginDb } from "../../db/login-db.js";
import { platformAdmins } from "../../db/schema.js";
import { optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

export const platformLoginBody = t.Object({
  email: optionalString,
  password: optionalString,
});

export const platformVerify2faBody = t.Object({
  code: optionalString,
});

export function clientKey(request: AuthContext): string {
  return (
    (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    request.ip ||
    "unknown"
  );
}

export async function registerPlatformAuthRoutes(app: Elysia): Promise<void> {
  app.post("/platform/auth/login", async (request) => {
    const key = `login:${clientKey(request)}`;
    if (!(await checkLoginRateLimit(key))) {
      return request.status(429, { detail: "Too many login attempts. Try again later." });
    }

    const body = request.body;
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
  }, {
    body: platformLoginBody,
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
    const body = request.body;
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
  }, {
    body: platformVerify2faBody,
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
}
