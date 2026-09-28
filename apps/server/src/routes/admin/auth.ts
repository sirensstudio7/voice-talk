import { eq } from "drizzle-orm";
import { clearUserCache, createAccessToken, getCurrentUser, hashPassword, sendAuthError, userOut, verifyPassword } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { withLoginDb } from "../../db/login-db.js";
import { platformSettings, users } from "../../db/schema.js";
import {
  allowPublicRequest,
  RATE_LIMITS,
  RATE_LIMIT_DETAIL,
} from "../../http/rate-limit.js";
import { ensureTrialEntitlement } from "../../services/entitlement.js";
import { listBusinessesForUser } from "../../services/user-businesses.js";
import { t, type Elysia } from "elysia";

export const adminLoginBody = t.Object({
  email: t.String({ minLength: 1 }),
  password: t.String({ minLength: 1 }),
});

export const adminSignupBody = t.Object({
  email: t.Optional(t.String()),
  password: t.Optional(t.String()),
  name: t.Optional(t.String()),
  country: t.Optional(t.String()),
});

export const adminProfileBody = t.Object({
  country: t.Optional(t.String()),
});

export async function isRegistrationApprovalRequired(): Promise<boolean> {
  const row = await db.query.platformSettings.findFirst({
    where: eq(platformSettings.key, "require_registration_approval"),
  });
  return ["true", "1", "yes", "on"].includes((row?.value ?? "false").toLowerCase());
}

export async function registerAdminAuthRoutes(app: Elysia): Promise<void> {
  app.post("/admin/auth/login", async (request) => {
    const body = request.body;
    try {
      const normalizedEmail = body.email.toLowerCase().trim();
      if (
        !(await allowPublicRequest(request, RATE_LIMITS.merchantLogin, normalizedEmail))
      ) {
        return request.status(429, { detail: RATE_LIMIT_DETAIL });
      }
      const user = await withLoginDb((loginDb) =>
        loginDb.query.users.findFirst({
          where: eq(users.email, normalizedEmail),
        }),
      );
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        return request.status(401, { detail: "Invalid credentials" });
      }
      if (user.status === "suspended") {
        return request.status(403, {
          detail: user.lastLoginAt
            ? "Account suspended"
            : "Your registration was not approved.",
        });
      }
      if (user.status === "pending") {
        return request.status(403, { detail: "Your account is awaiting admin approval." });
      }
      const businesses = await withLoginDb(async (loginDb) => {
        await loginDb.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        return listBusinessesForUser(user.id, loginDb);
      });
      return {
        access_token: createAccessToken(user.id),
        token_type: "bearer",
        user: userOut(user),
        businesses,
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: adminLoginBody,
  });

  app.post("/admin/auth/signup", async (request) => {
    const body = request.body;
    const email = body.email?.toLowerCase().trim() ?? "";
    const password = body.password ?? "";
    const country = (body.country ?? "").trim().toUpperCase().slice(0, 2);

    if (!email || !password) {
      return request.status(400, { detail: "Email and password are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return request.status(400, { detail: "Enter a valid email address." });
    }
    if (password.length < 8) {
      return request.status(400, { detail: "Password must be at least 8 characters." });
    }

    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      return request.status(400, { detail: "Email already exists." });
    }

    const name = body.name?.trim() || email.split("@")[0] || "User";
    const approvalRequired = await isRegistrationApprovalRequired();
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        name,
        country: /^[A-Z]{2}$/.test(country) ? country : "",
        status: approvalRequired ? "pending" : "active",
      })
      .returning();

    if (!approvalRequired) {
      await ensureTrialEntitlement(user!.id);
    }

    if (approvalRequired) {
      return request.status(201, {
        status: "pending",
        message: "Your account is awaiting admin approval. You'll be able to sign in once approved.",
        user: userOut(user!),
      });
    }

    return request.status(201, {
      access_token: createAccessToken(user!.id),
      token_type: "bearer",
      user: userOut(user!),
    });
  }, {
    body: adminSignupBody,
  });

  app.patch("/admin/auth/me", async (request) => {
    try {
      const user = await getCurrentUser(request);
      const body = request.body;
      const country = (body.country ?? "").trim().toUpperCase().slice(0, 2);
      if (country && !/^[A-Z]{2}$/.test(country)) {
        return request.status(400, { detail: "country must be a 2-letter ISO code." });
      }
      if (!country || user.country) {
        return userOut(user);
      }
      const [updated] = await db
        .update(users)
        .set({ country })
        .where(eq(users.id, user.id))
        .returning();
      clearUserCache(user.id);
      return userOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: adminProfileBody,
  });

  app.get("/admin/auth/me", async (request) => {
    try {
      return userOut(await getCurrentUser(request));
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
