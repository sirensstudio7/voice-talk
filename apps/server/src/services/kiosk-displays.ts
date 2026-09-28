import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

import { hashPassword, verifyPassword } from "../auth/jwt.js";
import { db } from "../db/client.js";
import { businessMembers, kioskDisplays, plans, type KioskDisplay } from "../db/schema.js";
import { env } from "../env.js";
import { getEntitlementSnapshot } from "./entitlement.js";

export const DEFAULT_KIOSK_SLUG = "default";
const KIOSK_TOKEN_TTL_HOURS = 12;
const JWT_ALGORITHM = "HS256";

export type KioskDisplayOut = {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  pin_set: boolean;
  unlockable: boolean;
  in_use: boolean;
  lease_expires_at: string | null;
  created_at: string;
};

type KioskTokenPayload = {
  typ: "kiosk";
  bid: string;
  kid: string;
  jti?: string;
  exp?: number;
};

function httpError(detail: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(detail) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export function normalizeDisplaySlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Resolve kiosk_displays.id for a new voice session (falls back to default display). */
export async function resolveKioskDisplayIdForSession(
  businessId: string,
  kioskSlug?: string | null,
): Promise<string | null> {
  const slug = normalizeDisplaySlug(kioskSlug || DEFAULT_KIOSK_SLUG) || DEFAULT_KIOSK_SLUG;
  const row = await db.query.kioskDisplays.findFirst({
    where: and(eq(kioskDisplays.businessId, businessId), eq(kioskDisplays.slug, slug)),
    columns: { id: true },
  });
  if (row) return row.id;

  const fallback = await db.query.kioskDisplays.findFirst({
    where: and(eq(kioskDisplays.businessId, businessId), eq(kioskDisplays.isDefault, true)),
    columns: { id: true },
  });
  return fallback?.id ?? null;
}

export function assertValidPin(pin: string): string {
  const trimmed = pin.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    throw httpError("PIN must be exactly 6 digits.", 400);
  }
  return trimmed;
}

export function isUnlockLeaseActive(row: KioskDisplay, now = new Date()): boolean {
  if (!row.unlockSessionId || !row.unlockLeaseExpiresAt) return false;
  return row.unlockLeaseExpiresAt.getTime() > now.getTime();
}

function leaseExpiryDate(now = new Date()): Date {
  return new Date(now.getTime() + KIOSK_TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

async function clearUnlockLease(displayId: string): Promise<void> {
  await db
    .update(kioskDisplays)
    .set({
      unlockSessionId: null,
      unlockLeasedAt: null,
      unlockLeaseExpiresAt: null,
    })
    .where(eq(kioskDisplays.id, displayId));
}

/** Drop expired (or incomplete) lease rows so admin status and unlock stay in sync. */
async function expireStaleUnlockLeaseIfNeeded(row: KioskDisplay): Promise<KioskDisplay> {
  if (!row.unlockSessionId) return row;
  if (isUnlockLeaseActive(row)) return row;
  await clearUnlockLease(row.id);
  return {
    ...row,
    unlockSessionId: null,
    unlockLeasedAt: null,
    unlockLeaseExpiresAt: null,
  };
}

export async function acquireUnlockLease(displayId: string): Promise<{ sessionId: string; expiresAt: Date }> {
  const sessionId = randomUUID();
  const now = new Date();
  const expiresAt = leaseExpiryDate(now);
  await db
    .update(kioskDisplays)
    .set({
      unlockSessionId: sessionId,
      unlockLeasedAt: now,
      unlockLeaseExpiresAt: expiresAt,
    })
    .where(eq(kioskDisplays.id, displayId));
  return { sessionId, expiresAt };
}

export async function releaseUnlockLease(
  displayId: string,
  sessionId?: string,
): Promise<boolean> {
  const row = await db.query.kioskDisplays.findFirst({
    where: eq(kioskDisplays.id, displayId),
  });
  if (!row?.unlockSessionId) return false;
  if (sessionId && row.unlockSessionId !== sessionId) return false;
  await clearUnlockLease(displayId);
  return true;
}

export function parseKioskAccessToken(
  token: string,
  businessId: string,
  kioskSlug: string,
): KioskTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as KioskTokenPayload;
    if (payload.typ !== "kiosk" || payload.bid !== businessId || payload.kid !== kioskSlug) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function assertTokenMatchesLease(token: string, row: KioskDisplay, businessId: string): void {
  const payload = parseKioskAccessToken(token, businessId, row.slug);
  if (!payload) {
    throw httpError("Unlock this kiosk with its PIN first.", 401);
  }
  if (!payload.jti) {
    throw httpError("Unlock this kiosk with its PIN again.", 401);
  }
  if (!isUnlockLeaseActive(row)) {
    throw httpError("This kiosk session expired. Enter the PIN again.", 401);
  }
  if (payload.jti !== row.unlockSessionId) {
    throw httpError("This kiosk session is no longer valid. Enter the PIN again.", 401);
  }
}

function displayOut(row: KioskDisplay, unlockable: boolean): KioskDisplayOut {
  const inUse = isUnlockLeaseActive(row);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    is_default: row.isDefault,
    pin_set: Boolean(row.passwordHash),
    unlockable,
    in_use: inUse,
    lease_expires_at: inUse && row.unlockLeaseExpiresAt ? row.unlockLeaseExpiresAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}

export async function ensureDefaultKioskDisplay(businessId: string): Promise<KioskDisplay> {
  const existing = await db.query.kioskDisplays.findFirst({
    where: and(eq(kioskDisplays.businessId, businessId), eq(kioskDisplays.slug, DEFAULT_KIOSK_SLUG)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(kioskDisplays)
    .values({
      businessId,
      name: "Main display",
      slug: DEFAULT_KIOSK_SLUG,
      passwordHash: "",
      isDefault: true,
    })
    .returning();
  return created!;
}

export async function getKioskLimitForBusiness(businessId: string): Promise<number> {
  const owner = await db.query.businessMembers.findFirst({
    where: and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "owner")),
  });
  if (!owner) return 1;
  const snap = await getEntitlementSnapshot(owner.userId);
  const plan = await db.query.plans.findFirst({ where: eq(plans.code, snap.plan_code) });
  return Math.max(1, plan?.kioskDisplayLimit ?? snap.kiosk_display_limit ?? 1);
}

async function rankedDisplays(businessId: string): Promise<KioskDisplay[]> {
  await ensureDefaultKioskDisplay(businessId);
  return db
    .select()
    .from(kioskDisplays)
    .where(eq(kioskDisplays.businessId, businessId))
    .orderBy(desc(kioskDisplays.isDefault), asc(kioskDisplays.createdAt));
}

function unlockableIds(rows: KioskDisplay[], limit: number): Set<string> {
  return new Set(rows.slice(0, Math.max(1, limit)).map((row) => row.id));
}

export async function assertCanCreateKioskDisplay(businessId: string): Promise<number> {
  const limit = await getKioskLimitForBusiness(businessId);
  const [row] = await db
    .select({ value: count() })
    .from(kioskDisplays)
    .where(eq(kioskDisplays.businessId, businessId));
  const current = row?.value ?? 0;
  if (current >= limit) {
    throw httpError(
      `Kiosk display limit reached (${current}/${limit}). Upgrade your plan to add more.`,
      403,
    );
  }
  return limit;
}

export async function listKioskDisplays(businessId: string): Promise<{
  items: KioskDisplayOut[];
  limit: number;
  count: number;
  can_create: boolean;
}> {
  const rows = await rankedDisplays(businessId);
  const freshRows = await Promise.all(rows.map((row) => expireStaleUnlockLeaseIfNeeded(row)));
  const limit = await getKioskLimitForBusiness(businessId);
  const allowed = unlockableIds(freshRows, limit);
  return {
    items: freshRows.map((row) => displayOut(row, allowed.has(row.id))),
    limit,
    count: rows.length,
    can_create: rows.length < limit,
  };
}

export async function createKioskDisplay(
  businessId: string,
  input: { name?: string; slug?: string; pin: string },
): Promise<KioskDisplayOut> {
  await ensureDefaultKioskDisplay(businessId);
  await assertCanCreateKioskDisplay(businessId);

  const pin = assertValidPin(input.pin);
  const name = (input.name ?? "").trim() || "Kiosk display";
  const slug = normalizeDisplaySlug(input.slug || name);
  if (!slug) {
    throw httpError("Enter a valid display name or slug.", 400);
  }
  if (slug === DEFAULT_KIOSK_SLUG) {
    throw httpError("That display id is reserved. Choose another name.", 400);
  }

  const existing = await db.query.kioskDisplays.findFirst({
    where: and(eq(kioskDisplays.businessId, businessId), eq(kioskDisplays.slug, slug)),
  });
  if (existing) {
    throw httpError("A display with this name already exists.", 400);
  }

  const [created] = await db
    .insert(kioskDisplays)
    .values({
      businessId,
      name,
      slug,
      passwordHash: await hashPassword(pin),
      isDefault: false,
    })
    .returning();

  const listed = await listKioskDisplays(businessId);
  return listed.items.find((item) => item.id === created!.id)!;
}

export async function updateKioskDisplay(
  businessId: string,
  displayId: string,
  input: { name?: string; pin?: string },
): Promise<KioskDisplayOut> {
  const row = await db.query.kioskDisplays.findFirst({
    where: and(eq(kioskDisplays.id, displayId), eq(kioskDisplays.businessId, businessId)),
  });
  if (!row) {
    throw httpError("Kiosk display not found.", 404);
  }

  const updates: Partial<typeof kioskDisplays.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw httpError("Display name is required.", 400);
    updates.name = name;
  }
  if (input.pin !== undefined && input.pin !== "") {
    updates.passwordHash = await hashPassword(assertValidPin(input.pin));
    updates.unlockSessionId = null;
    updates.unlockLeasedAt = null;
    updates.unlockLeaseExpiresAt = null;
  }
  if (Object.keys(updates).length === 0) {
    throw httpError("Nothing to update.", 400);
  }

  await db.update(kioskDisplays).set(updates).where(eq(kioskDisplays.id, row.id));
  const listed = await listKioskDisplays(businessId);
  const next = listed.items.find((item) => item.id === row.id);
  if (!next) throw httpError("Kiosk display not found.", 404);
  return next;
}

export async function deleteKioskDisplay(businessId: string, displayId: string): Promise<void> {
  const rows = await rankedDisplays(businessId);
  const row = rows.find((item) => item.id === displayId);
  if (!row) {
    throw httpError("Kiosk display not found.", 404);
  }
  if (row.isDefault || rows.length <= 1) {
    throw httpError("You must keep at least one kiosk display.", 400);
  }
  await db.delete(kioskDisplays).where(eq(kioskDisplays.id, row.id));
}

export async function forceReleaseKioskDisplay(
  businessId: string,
  displayId: string,
): Promise<KioskDisplayOut> {
  const row = await db.query.kioskDisplays.findFirst({
    where: and(eq(kioskDisplays.id, displayId), eq(kioskDisplays.businessId, businessId)),
  });
  if (!row) {
    throw httpError("Kiosk display not found.", 404);
  }
  await clearUnlockLease(row.id);
  const listed = await listKioskDisplays(businessId);
  const next = listed.items.find((item) => item.id === row.id);
  if (!next) throw httpError("Kiosk display not found.", 404);
  return next;
}

export function createKioskAccessToken(businessId: string, kioskSlug: string, sessionId: string): string {
  return jwt.sign(
    { typ: "kiosk", bid: businessId, kid: kioskSlug, jti: sessionId },
    env.JWT_SECRET,
    { algorithm: JWT_ALGORITHM, expiresIn: `${KIOSK_TOKEN_TTL_HOURS}h` },
  );
}

export function verifyKioskAccessToken(
  token: string,
  businessId: string,
  kioskSlug: string,
): boolean {
  return parseKioskAccessToken(token, businessId, kioskSlug) !== null;
}

export function isPublicHeroDemoAccess(opts: {
  businessSlug?: string | null;
  embed?: string | null;
}): boolean {
  const slug = opts.businessSlug?.trim().toLowerCase();
  const demoSlug = env.HERO_DEMO_SLUG.trim().toLowerCase();
  return Boolean(slug && demoSlug && slug === demoSlug && opts.embed === "hero");
}

export async function assertKioskSocketAccess(opts: {
  businessId: string;
  businessSlug?: string;
  kioskSlug?: string;
  token?: string;
  embed?: string;
}): Promise<string> {
  const rows = await rankedDisplays(opts.businessId);
  const slug = normalizeDisplaySlug(opts.kioskSlug || DEFAULT_KIOSK_SLUG) || DEFAULT_KIOSK_SLUG;
  const row = rows.find((item) => item.slug === slug);
  if (!row) {
    throw httpError("Kiosk display not found.", 404);
  }
  const limit = await getKioskLimitForBusiness(opts.businessId);
  if (!unlockableIds(rows, limit).has(row.id)) {
    throw httpError(
      "This kiosk is over your plan limit. Delete extra displays or upgrade.",
      403,
    );
  }
  if (isPublicHeroDemoAccess({ businessSlug: opts.businessSlug, embed: opts.embed })) {
    return row.slug;
  }
  if (!row.passwordHash) {
    throw httpError("Ask your admin to set a PIN for this kiosk.", 403);
  }
  if (!opts.token) {
    throw httpError("Unlock this kiosk with its PIN first.", 401);
  }
  assertTokenMatchesLease(opts.token, row, opts.businessId);
  return row.slug;
}

export async function unlockKioskDisplay(opts: {
  businessSlug: string;
  kioskSlug?: string;
  pin: string;
}): Promise<{ access_token: string; kiosk: { name: string; slug: string; is_default: boolean } }> {
  const { getBusinessBySlug } = await import("./tenant.js");
  const tenant = await getBusinessBySlug(opts.businessSlug);
  if (!tenant) {
    throw httpError("Business not found.", 404);
  }

  const pin = assertValidPin(opts.pin);
  const rows = await rankedDisplays(tenant.id);
  const slug = normalizeDisplaySlug(opts.kioskSlug || DEFAULT_KIOSK_SLUG) || DEFAULT_KIOSK_SLUG;
  let row = rows.find((item) => item.slug === slug);
  if (!row) {
    throw httpError("Kiosk display not found.", 404);
  }
  row = await expireStaleUnlockLeaseIfNeeded(row);

  const limit = await getKioskLimitForBusiness(tenant.id);
  if (!unlockableIds(rows, limit).has(row.id)) {
    throw httpError(
      "This kiosk is over your plan limit. Delete extra displays or upgrade.",
      403,
    );
  }
  if (!row.passwordHash) {
    throw httpError("Ask your admin to set a PIN for this kiosk.", 403);
  }
  if (!(await verifyPassword(pin, row.passwordHash))) {
    throw httpError("Invalid PIN.", 401);
  }

  if (isUnlockLeaseActive(row)) {
    throw httpError(
      "This display is in use. End the session on the tablet or ask an admin to release it.",
      409,
    );
  }

  const { sessionId } = await acquireUnlockLease(row.id);

  return {
    access_token: createKioskAccessToken(tenant.id, row.slug, sessionId),
    kiosk: { name: row.name, slug: row.slug, is_default: row.isDefault },
  };
}

export async function releaseKioskDisplayByToken(opts: {
  businessSlug: string;
  kioskSlug?: string;
  token: string;
}): Promise<void> {
  const { getBusinessBySlug } = await import("./tenant.js");
  const tenant = await getBusinessBySlug(opts.businessSlug);
  if (!tenant) {
    throw httpError("Business not found.", 404);
  }

  const slug = normalizeDisplaySlug(opts.kioskSlug || DEFAULT_KIOSK_SLUG) || DEFAULT_KIOSK_SLUG;
  const row = await db.query.kioskDisplays.findFirst({
    where: and(eq(kioskDisplays.businessId, tenant.id), eq(kioskDisplays.slug, slug)),
  });
  if (!row) {
    throw httpError("Kiosk display not found.", 404);
  }

  const payload = parseKioskAccessToken(opts.token, tenant.id, row.slug);
  if (!payload?.jti) {
    throw httpError("Invalid kiosk session.", 401);
  }

  await releaseUnlockLease(row.id, payload.jti);
}

const unlockAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkKioskUnlockRateLimit(key: string, limit = 12, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = unlockAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    unlockAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
