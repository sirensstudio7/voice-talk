import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import * as OTPAuth from "otpauth";
import { db } from "../db/client.js";
import { withLoginDb } from "../db/login-db.js";
import { auditLogs, platformAdmins, type PlatformAdmin } from "../db/schema.js";
import { env } from "../env.js";
import { hashPassword, verifyPassword } from "./jwt.js";
import { isPlatformRole, type PlatformRole } from "./platform-rbac.js";

const JWT_ALGORITHM = "HS256";
const PENDING_TTL_SECONDS = 10 * 60;
const PLATFORM_TTL_HOURS = 8;

type PlatformTokenPayload = {
  sub: string;
  typ: "platform" | "platform_pending";
  role?: string;
  exp?: number;
};

function authError(detail: string, statusCode = 401) {
  const err = new Error(detail) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export function platformAdminOut(admin: PlatformAdmin) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    status: admin.status,
    totp_enabled: admin.totpEnabled,
    force_password_reset: admin.forcePasswordReset,
    last_login_at: admin.lastLoginAt?.toISOString() ?? null,
    created_at: admin.createdAt.toISOString(),
  };
}

export function createPlatformPendingToken(adminId: string): string {
  return jwt.sign(
    { sub: adminId, typ: "platform_pending" },
    env.JWT_SECRET,
    { algorithm: JWT_ALGORITHM, expiresIn: PENDING_TTL_SECONDS },
  );
}

export function createPlatformAccessToken(adminId: string, role: string): string {
  return jwt.sign(
    { sub: adminId, typ: "platform", role },
    env.JWT_SECRET,
    { algorithm: JWT_ALGORITHM, expiresIn: `${PLATFORM_TTL_HOURS}h` },
  );
}

function readBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw authError("Not authenticated");
  }
  return header.slice("Bearer ".length);
}

function verifyPlatformToken(
  token: string,
  expectedTyp: PlatformTokenPayload["typ"],
): PlatformTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as PlatformTokenPayload;
    if (!payload.sub || payload.typ !== expectedTyp) {
      throw authError("Invalid token");
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    throw authError("Invalid token");
  }
}

export async function getPlatformAdminFromPending(
  request: FastifyRequest,
): Promise<PlatformAdmin> {
  const token = readBearerToken(request);
  const payload = verifyPlatformToken(token, "platform_pending");
  const admin = await db.query.platformAdmins.findFirst({
    where: eq(platformAdmins.id, payload.sub),
  });
  if (!admin || admin.status !== "active") {
    throw authError("Admin not found or disabled");
  }
  return admin;
}

export async function getCurrentPlatformAdmin(
  request: FastifyRequest,
): Promise<PlatformAdmin & { role: PlatformRole }> {
  const token = readBearerToken(request);
  const payload = verifyPlatformToken(token, "platform");
  const admin = await db.query.platformAdmins.findFirst({
    where: eq(platformAdmins.id, payload.sub),
  });
  if (!admin || admin.status !== "active") {
    throw authError("Admin not found or disabled");
  }
  if (!isPlatformRole(admin.role)) {
    throw authError("Invalid admin role", 403);
  }
  return admin as PlatformAdmin & { role: PlatformRole };
}

export function generateTotpSecret(email: string): { secret: string; otpauthUrl: string } {
  const totp = new OTPAuth.TOTP({
    issuer: "LORESCALE Platform",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });
  return {
    secret: totp.secret.base32,
    otpauthUrl: totp.toString(),
  };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  if (!secret || !code) return false;
  const totp = new OTPAuth.TOTP({
    issuer: "LORESCALE Platform",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
  return delta !== null;
}

export async function authenticatePlatformPassword(
  email: string,
  password: string,
): Promise<PlatformAdmin> {
  const normalizedEmail = email.toLowerCase().trim();
  const admin = await withLoginDb((loginDb) =>
    loginDb.query.platformAdmins.findFirst({
      where: eq(platformAdmins.email, normalizedEmail),
    }),
  );
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    throw authError("Invalid credentials");
  }
  if (admin.status !== "active") {
    throw authError("Admin account is disabled", 403);
  }
  return admin;
}

export async function writeAuditLog(input: {
  adminId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
}): Promise<void> {
  const ip =
    (input.request?.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    input.request?.ip ||
    "";
  const userAgent = (input.request?.headers["user-agent"] as string | undefined) || "";
  await db.insert(auditLogs).values({
    adminId: input.adminId,
    action: input.action,
    entityType: input.entityType ?? "",
    entityId: input.entityId ?? "",
    metadataJson: JSON.stringify(input.metadata ?? {}),
    ipAddress: ip.slice(0, 64),
    userAgent,
  });
}

export async function ensurePlatformAdminSeed(): Promise<void> {
  const email = env.PLATFORM_ADMIN_EMAIL.toLowerCase().trim();
  const existing = await db.query.platformAdmins.findFirst({
    where: eq(platformAdmins.email, email),
  });
  if (existing) return;

  await db.insert(platformAdmins).values({
    email,
    name: "Super Admin",
    passwordHash: await hashPassword(env.PLATFORM_ADMIN_PASSWORD),
    role: "super",
    status: "active",
    totpEnabled: false,
  });
  console.info(`Seeded platform super admin: ${email}`);
}

/** Simple in-memory rate limiter for login endpoints. */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(key: string, limit = 20, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
