import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { getBusinessCapabilities, withBookingAddon } from "@voicetalk/shared";
import { db } from "../db/client.js";
import { businessMembers, businesses, users, type User } from "../db/schema.js";
import { env } from "../env.js";
import type { AuthContext, StatusContext } from "../http/context.js";

const JWT_ALGORITHM = "HS256";
const USER_CACHE_TTL_MS = 60_000;
const BUSINESS_ACCESS_CACHE_TTL_MS = 60_000;

const userCache = new Map<string, { user: User; expiresAt: number }>();
const businessAccessCache = new Map<
  string,
  { business: typeof businesses.$inferSelect; expiresAt: number }
>();

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function createAccessToken(userId: string): string {
  const expire = new Date(Date.now() + env.JWT_EXPIRE_HOURS * 60 * 60 * 1000);
  return jwt.sign({ sub: userId, exp: Math.floor(expire.getTime() / 1000) }, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
  });
}

function readBearerToken(request: AuthContext): string {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw authError("Not authenticated");
  }
  return header.slice("Bearer ".length);
}

export function getAuthUserId(request: AuthContext): string {
  const token = readBearerToken(request);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as {
      sub?: string;
    };
    if (!payload.sub) throw authError("Invalid token");
    return payload.sub;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    throw authError("Invalid token");
  }
}

async function getCachedUser(userId: string): Promise<User | undefined> {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user) {
    userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  }
  return user;
}

export async function getCurrentUser(request: AuthContext): Promise<User> {
  const userId = getAuthUserId(request);
  const user = await getCachedUser(userId);
  if (!user) throw authError("User not found");
  if (user.status === "suspended") {
    clearUserCache(userId);
    throw authError("Account suspended");
  }
  if (user.status === "pending") {
    clearUserCache(userId);
    const err = new Error("Your account is awaiting admin approval.") as Error & {
      statusCode: number;
    };
    err.statusCode = 403;
    throw err;
  }
  return user;
}

export function clearUserCache(userId?: string): void {
  if (userId) {
    userCache.delete(userId);
    return;
  }
  userCache.clear();
}

export function clearBusinessAccessCache(businessId?: string): void {
  if (!businessId) {
    businessAccessCache.clear();
    return;
  }
  for (const key of businessAccessCache.keys()) {
    if (key.endsWith(`:${businessId}`)) {
      businessAccessCache.delete(key);
    }
  }
}

function publicErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return "Internal error";

  const parts = [error.message];
  if (error.cause instanceof Error) parts.push(error.cause.message);
  const combined = parts.join(" ");

  if (/CONNECT_TIMEOUT|connect timed out|timed out|ECONNREFUSED|connection/i.test(combined)) {
    return "Database connection timed out. Please retry in a moment.";
  }

  if (error.name === "DrizzleQueryError" && error.cause instanceof Error) {
    return error.cause.message;
  }

  return error.message;
}

export async function requireBusinessAccess(
  request: AuthContext,
  businessId: string,
): Promise<typeof businesses.$inferSelect> {
  const userId = getAuthUserId(request);
  const cacheKey = `${userId}:${businessId}`;
  const cached = businessAccessCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.business;
  }

  const [row] = await db
    .select({ business: businesses })
    .from(businesses)
    .innerJoin(
      businessMembers,
      and(
        eq(businessMembers.businessId, businesses.id),
        eq(businessMembers.userId, userId),
      ),
    )
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!row) throw forbiddenError("No access to this business");

  businessAccessCache.set(cacheKey, {
    business: row.business,
    expiresAt: Date.now() + BUSINESS_ACCESS_CACHE_TTL_MS,
  });
  return row.business;
}

function authError(detail: string) {
  const err = new Error(detail) as Error & { statusCode: number };
  err.statusCode = 401;
  return err;
}

function forbiddenError(detail: string) {
  const err = new Error(detail) as Error & { statusCode: number };
  err.statusCode = 403;
  return err;
}

function notFoundError(detail: string) {
  const err = new Error(detail) as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

export function sendAuthError(request: StatusContext, error: unknown): unknown {
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  return request.status(statusCode, { detail: publicErrorDetail(error) });
}

export function userOut(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    country: user.country || "",
  };
}

export function businessOut(
  business: typeof businesses.$inferSelect,
  extras?: { bookingAddonActive?: boolean },
) {
  const capabilities = withBookingAddon(
    getBusinessCapabilities(business.primaryUseCase, business.businessType),
    Boolean(extras?.bookingAddonActive),
  );
  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    tagline: business.tagline,
    voice_name: business.voiceName,
    gemini_model: business.geminiModel,
    background_url: business.backgroundUrl || "",
    is_active: business.isActive,
    business_type: business.businessType,
    primary_use_case: capabilities.primary_use_case,
    onboarding_completed: business.onboardingCompleted,
    capabilities,
  };
}
