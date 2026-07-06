import bcrypt from "bcrypt";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { businessMembers, businesses, users, type User } from "../db/schema.js";
import { env } from "../env.js";

const JWT_ALGORITHM = "HS256";

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

export async function getCurrentUser(request: FastifyRequest): Promise<User> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw authError("Not authenticated");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] }) as {
      sub?: string;
    };
    if (!payload.sub) throw authError("Invalid token");

    const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
    if (!user) throw authError("User not found");
    return user;
  } catch {
    throw authError("Invalid token");
  }
}

export async function requireBusinessAccess(
  request: FastifyRequest,
  businessId: string,
): Promise<typeof businesses.$inferSelect> {
  const user = await getCurrentUser(request);

  const membership = await db.query.businessMembers.findFirst({
    where: (m, { and, eq: eqFn }) =>
      and(eqFn(m.businessId, businessId), eqFn(m.userId, user.id)),
  });
  if (!membership) throw forbiddenError("No access to this business");

  const business = await db.query.businesses.findFirst({
    where: eq(businesses.id, businessId),
  });
  if (!business) throw notFoundError("Business not found");
  return business;
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

export function sendAuthError(reply: FastifyReply, error: unknown): void {
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  const detail = error instanceof Error ? error.message : "Internal error";
  reply.status(statusCode).send({ detail });
}

export function userOut(user: User) {
  return { id: user.id, email: user.email, name: user.name };
}

export function businessOut(business: typeof businesses.$inferSelect) {
  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    tagline: business.tagline,
    voice_name: business.voiceName,
    gemini_model: business.geminiModel,
    is_active: business.isActive,
  };
}
