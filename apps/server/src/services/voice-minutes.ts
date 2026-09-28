import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { logger } from "../http/logger.js";
import { inc } from "../http/metrics.js";
import {
  businessMembers,
  minuteGrants,
  minuteLedger,
  topupOrders,
  topupPackages,
  transcriptMessages,
  users,
  voiceSessions,
  type MinuteGrant,
  type TopupOrder,
  type TopupPackage,
} from "../db/schema.js";
import { generateAddonTransactionCode } from "./addon-entitlement.js";
import { effectivePrice } from "./pricing.js";
import {
  getEntitlementSnapshot,
  getPlanByCode,
  type EntitlementSnapshot,
} from "./entitlement.js";

const log = logger.child({ component: "billing" });

export const MIN_CHARGE_SECONDS = 15;
export const ORPHAN_SESSION_MS = 15 * 60 * 1000;
/** Only debit orphans we closed promptly. Older leftovers are closed without billing. */
export const FRESH_ORPHAN_DEBIT_MS = ORPHAN_SESSION_MS + 5 * 60 * 1000;
export const LOW_REMAINING_RATIO = 0.2;
export const CRITICAL_REMAINING_RATIO = 0.1;

export type MinuteWarning = "low" | "critical" | "empty" | null;

export type VoiceMinuteWallet = {
  included_seconds: number;
  included_used_seconds: number;
  purchased_remaining_seconds: number;
  available_seconds: number;
  period_start: string | null;
  period_end: string | null;
  warning: MinuteWarning;
  next_expiry: { seconds: number; expires_at: string } | null;
};

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function isMissingRelation(err: unknown): boolean {
  const msg =
    err instanceof Error ? `${err.message} ${(err as Error & { cause?: Error }).cause?.message ?? ""}` : "";
  return /relation .* does not exist/i.test(msg);
}

/** Connected wall-clock seconds, ceil to 1s, minimum 15s when the session ran. */
export function billableSeconds(durationSeconds: number): number {
  const raw = Math.max(0, Math.ceil(durationSeconds));
  if (raw <= 0) return 0;
  return Math.max(MIN_CHARGE_SECONDS, raw);
}

export function warningFor(available: number, included: number): MinuteWarning {
  if (available < MIN_CHARGE_SECONDS) return "empty";
  const basis = Math.max(included, available, 1);
  const ratio = available / basis;
  if (ratio <= CRITICAL_REMAINING_RATIO) return "critical";
  if (ratio <= LOW_REMAINING_RATIO) return "low";
  return null;
}

export async function getOwnerUserIdForBusiness(businessId: string): Promise<string | null> {
  const owner = await db.query.businessMembers.findFirst({
    where: and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "owner")),
  });
  return owner?.userId ?? null;
}

function currentMonthlyPeriod(anchor: Date, now: Date): { start: Date; end: Date } {
  const start = new Date(anchor);
  start.setUTCHours(0, 0, 0, 0);
  if (now < start) {
    return { start, end: addUtcMonth(start, 1) };
  }
  let cursor = new Date(start);
  while (addUtcMonth(cursor, 1) <= now) {
    cursor = addUtcMonth(cursor, 1);
  }
  return { start: cursor, end: addUtcMonth(cursor, 1) };
}

function addUtcMonth(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const max = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, max));
  return next;
}

function periodForEntitlement(
  snap: EntitlementSnapshot,
): { start: Date; end: Date; seconds: number } | null {
  const now = new Date();
  if (snap.status === "trialing") {
    const start = snap.trial_started_at ? new Date(snap.trial_started_at) : now;
    const end = snap.trial_ends_at ? new Date(snap.trial_ends_at) : new Date(start.getTime() + 48 * 60 * 60 * 1000);
    return { start, end, seconds: 0 };
  }
  if (snap.status !== "active") return null;
  const anchor = snap.starts_at ? new Date(snap.starts_at) : now;
  const { start, end } = currentMonthlyPeriod(anchor, now);
  return { start, end, seconds: 0 };
}

async function planVoiceSeconds(planCode: string): Promise<number> {
  const plan = await getPlanByCode(planCode);
  return Math.max(0, plan?.monthlyVoiceSeconds ?? 0);
}

async function sumRemaining(userId: string): Promise<number> {
  const now = new Date();
  const rows = await db
    .select({ remaining: minuteGrants.remainingSeconds })
    .from(minuteGrants)
    .where(
      and(
        eq(minuteGrants.userId, userId),
        gt(minuteGrants.remainingSeconds, 0),
        or(isNull(minuteGrants.expiresAt), gt(minuteGrants.expiresAt, now)),
      ),
    );
  return rows.reduce((sum, row) => sum + row.remaining, 0);
}

async function writeLedger(opts: {
  userId: string;
  workspaceId?: string | null;
  voiceSessionId?: string | null;
  grantId?: string | null;
  type: string;
  deltaSeconds: number;
  idempotencyKey: string;
  sourceRef?: string;
}): Promise<void> {
  const existing = await db.query.minuteLedger.findFirst({
    where: eq(minuteLedger.idempotencyKey, opts.idempotencyKey),
  });
  if (existing) return;

  const balanceAfter = await sumRemaining(opts.userId);
  await db.insert(minuteLedger).values({
    userId: opts.userId,
    workspaceId: opts.workspaceId ?? null,
    voiceSessionId: opts.voiceSessionId ?? null,
    grantId: opts.grantId ?? null,
    type: opts.type,
    deltaSeconds: opts.deltaSeconds,
    balanceAfterSeconds: balanceAfter,
    idempotencyKey: opts.idempotencyKey,
    sourceRef: opts.sourceRef ?? "",
  });
}

async function expireStaleLots(userId: string): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(minuteGrants)
    .where(
      and(
        eq(minuteGrants.userId, userId),
        gt(minuteGrants.remainingSeconds, 0),
        lte(minuteGrants.expiresAt, now),
      ),
    );
  for (const lot of expired) {
    await db
      .update(minuteGrants)
      .set({ remainingSeconds: 0 })
      .where(eq(minuteGrants.id, lot.id));
    await writeLedger({
      userId,
      grantId: lot.id,
      type: "EXPIRATION",
      deltaSeconds: -lot.remainingSeconds,
      idempotencyKey: `expire:${lot.id}`,
      sourceRef: lot.sourceRef,
    });
  }
}

export async function ensurePeriodGrant(userId: string): Promise<void> {
  const snap = await getEntitlementSnapshot(userId);
  const period = periodForEntitlement(snap);
  if (!period) return;

  const seconds = await planVoiceSeconds(snap.plan_code);
  if (seconds <= 0) return;

  const sourceRef = `sub:${userId}:${period.start.toISOString()}`;
  const existing = await db.query.minuteGrants.findFirst({
    where: and(
      eq(minuteGrants.userId, userId),
      eq(minuteGrants.kind, "subscription"),
      eq(minuteGrants.sourceRef, sourceRef),
    ),
  });

  if (existing) {
    if (seconds > existing.grantedSeconds) {
      const extra = seconds - existing.grantedSeconds;
      await db
        .update(minuteGrants)
        .set({
          grantedSeconds: seconds,
          remainingSeconds: existing.remainingSeconds + extra,
        })
        .where(eq(minuteGrants.id, existing.id));
      await writeLedger({
        userId,
        grantId: existing.id,
        type: "SUBSCRIPTION_GRANT",
        deltaSeconds: extra,
        idempotencyKey: `sub-upgrade:${sourceRef}:${seconds}`,
        sourceRef,
      });
    }
    return;
  }

  const stale = await db
    .select()
    .from(minuteGrants)
    .where(and(eq(minuteGrants.userId, userId), eq(minuteGrants.kind, "subscription")));
  for (const lot of stale) {
    if (lot.remainingSeconds <= 0) continue;
    await db.update(minuteGrants).set({ remainingSeconds: 0 }).where(eq(minuteGrants.id, lot.id));
    await writeLedger({
      userId,
      grantId: lot.id,
      type: "EXPIRATION",
      deltaSeconds: -lot.remainingSeconds,
      idempotencyKey: `expire-period:${lot.id}`,
      sourceRef: lot.sourceRef,
    });
  }

  const [created] = await db
    .insert(minuteGrants)
    .values({
      userId,
      kind: "subscription",
      grantedSeconds: seconds,
      remainingSeconds: seconds,
      periodStart: period.start,
      periodEnd: period.end,
      expiresAt: period.end,
      sourceRef,
    })
    .returning();

  await writeLedger({
    userId,
    grantId: created!.id,
    type: "SUBSCRIPTION_GRANT",
    deltaSeconds: seconds,
    idempotencyKey: `sub:${sourceRef}`,
    sourceRef,
  });
}

export async function getVoiceMinuteWallet(userId: string): Promise<VoiceMinuteWallet> {
  await expireStaleLots(userId);
  await ensurePeriodGrant(userId);

  const snap = await getEntitlementSnapshot(userId);
  const period = periodForEntitlement(snap);
  const now = new Date();

  const lots = await db
    .select()
    .from(minuteGrants)
    .where(eq(minuteGrants.userId, userId));

  let included = 0;
  let includedRemaining = 0;
  let purchasedRemaining = 0;
  let nextExpiry: VoiceMinuteWallet["next_expiry"] = null;

  for (const lot of lots) {
    const live = lot.remainingSeconds > 0 && (!lot.expiresAt || lot.expiresAt.getTime() > now.getTime());
    if (lot.kind === "subscription" && period && lot.sourceRef.endsWith(period.start.toISOString())) {
      included = lot.grantedSeconds;
      includedRemaining = live ? lot.remainingSeconds : 0;
    }
    if ((lot.kind === "topup" || lot.kind === "admin") && live) {
      purchasedRemaining += lot.remainingSeconds;
      if (lot.expiresAt) {
        if (!nextExpiry || lot.expiresAt.getTime() < new Date(nextExpiry.expires_at).getTime()) {
          nextExpiry = {
            seconds: lot.remainingSeconds,
            expires_at: lot.expiresAt.toISOString(),
          };
        }
      }
    }
  }

  const available = includedRemaining + purchasedRemaining;
  return {
    included_seconds: included,
    included_used_seconds: Math.max(0, included - includedRemaining),
    purchased_remaining_seconds: purchasedRemaining,
    available_seconds: available,
    period_start: period?.start.toISOString() ?? null,
    period_end: period?.end.toISOString() ?? null,
    warning: warningFor(available, included || available),
    next_expiry: nextExpiry,
  };
}

export async function assertCanStartVoiceSession(userId: string): Promise<VoiceMinuteWallet> {
  const wallet = await getVoiceMinuteWallet(userId);
  if (wallet.available_seconds < MIN_CHARGE_SECONDS) {
    throw httpError("You've reached your Lore Voice Minute limit.", 402);
  }
  return wallet;
}

/**
 * Take `seconds` from the user's live lots, subscription lots first.
 *
 * Runs as one transaction with the lots row-locked (`FOR UPDATE`). Two
 * concurrent debits — two API instances, or a session ending while the orphan
 * sweep runs — serialize instead of both reading the same `remaining_seconds`,
 * so the wallet can never be spent twice. The per-lot update is additionally
 * conditional on the locked value, which keeps `remaining_seconds` >= 0 even if
 * a future call path bypasses the lock.
 *
 * Exported for the concurrency test (TKT-001); application code charges through
 * `debitVoiceSession`.
 */
export async function consumeLots(userId: string, seconds: number): Promise<number> {
  if (seconds <= 0) return 0;
  const now = new Date();
  return db.transaction(async (tx) => {
    const lots: MinuteGrant[] = await tx
      .select()
      .from(minuteGrants)
      .where(
        and(
          eq(minuteGrants.userId, userId),
          gt(minuteGrants.remainingSeconds, 0),
          or(isNull(minuteGrants.expiresAt), gt(minuteGrants.expiresAt, now)),
        ),
      )
      .orderBy(
        sql`case when ${minuteGrants.kind} = 'subscription' then 0 else 1 end`,
        asc(minuteGrants.expiresAt),
        asc(minuteGrants.createdAt),
      )
      .for("update");

    let left = seconds;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(lot.remainingSeconds, left);
      const [updated] = await tx
        .update(minuteGrants)
        .set({ remainingSeconds: sql`${minuteGrants.remainingSeconds} - ${take}` })
        .where(and(eq(minuteGrants.id, lot.id), gte(minuteGrants.remainingSeconds, take)))
        .returning({ remainingSeconds: minuteGrants.remainingSeconds });
      if (!updated) {
        // Unreachable while the row lock holds; counted so a future regression
        // (an update path that skips the lock) is visible instead of silent.
        inc("minutes.debit_retry_total");
        continue;
      }
      left -= take;
    }
    return seconds - left;
  });
}

export async function debitVoiceSession(opts: {
  userId: string;
  businessId: string;
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
}): Promise<void> {
  const duration = (opts.endedAt.getTime() - opts.startedAt.getTime()) / 1000;
  const charge = billableSeconds(duration);
  if (charge <= 0) return;

  const existing = await db.query.minuteLedger.findFirst({
    where: eq(minuteLedger.idempotencyKey, `usage:${opts.sessionId}`),
  });
  if (existing) return;

  await expireStaleLots(opts.userId);
  await ensurePeriodGrant(opts.userId);
  const taken = await consumeLots(opts.userId, charge);
  if (taken <= 0) return;

  await writeLedger({
    userId: opts.userId,
    workspaceId: opts.businessId,
    voiceSessionId: opts.sessionId,
    type: "VOICE_USAGE",
    deltaSeconds: -taken,
    idempotencyKey: `usage:${opts.sessionId}`,
    sourceRef: opts.sessionId,
  });
}

export async function debitEndedSession(sessionId: string): Promise<void> {
  const session = await db.query.voiceSessions.findFirst({
    where: eq(voiceSessions.id, sessionId),
  });
  if (!session?.endedAt) return;
  const userId = await getOwnerUserIdForBusiness(session.businessId);
  if (!userId) return;
  await debitVoiceSession({
    userId,
    businessId: session.businessId,
    sessionId: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  });
}

export function orphanEndedAt(
  startedAt: Date,
  lastActivityAt: Date | null,
  now = new Date(),
): Date {
  const start = startedAt.getTime();
  const activity = lastActivityAt?.getTime() ?? start;
  const uncapped = Math.min(now.getTime(), Math.max(activity, start));
  return new Date(Math.min(uncapped, start + ORPHAN_SESSION_MS));
}

export async function sweepOrphanVoiceSessions(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - ORPHAN_SESSION_MS);
  const orphans = await db
    .select()
    .from(voiceSessions)
    .where(and(eq(voiceSessions.status, "active"), lte(voiceSessions.startedAt, cutoff), isNull(voiceSessions.endedAt)));

  let closed = 0;
  for (const session of orphans) {
    const [lastMessage] = await db
      .select({ createdAt: transcriptMessages.createdAt })
      .from(transcriptMessages)
      .where(eq(transcriptMessages.voiceSessionId, session.id))
      .orderBy(desc(transcriptMessages.createdAt))
      .limit(1);
    const endedAt = orphanEndedAt(session.startedAt, lastMessage?.createdAt ?? null, now);
    const [updated] = await db
      .update(voiceSessions)
      .set({ status: "ended", endedAt, endReason: "interrupted" })
      .where(and(eq(voiceSessions.id, session.id), isNull(voiceSessions.endedAt)))
      .returning({ id: voiceSessions.id });
    if (!updated) continue;

    const fresh = now.getTime() - session.startedAt.getTime() <= FRESH_ORPHAN_DEBIT_MS;
    if (fresh) {
      const userId = await getOwnerUserIdForBusiness(session.businessId);
      if (userId) {
        await debitVoiceSession({
          userId,
          businessId: session.businessId,
          sessionId: session.id,
          startedAt: session.startedAt,
          endedAt,
        });
      }
    }
    closed += 1;
  }
  return closed;
}

export function packageOut(pkg: TopupPackage) {
  const sale = effectivePrice(pkg.priceIdr, pkg.discountPercent);
  return {
    id: pkg.id,
    code: pkg.code,
    name: pkg.name,
    minutes: pkg.minutes,
    price_idr: sale,
    list_price_idr: pkg.priceIdr,
    discount_percent: pkg.discountPercent,
    currency: pkg.currency,
    expires_after_days: pkg.expiresAfterDays,
    is_popular: pkg.isPopular,
    status: pkg.status,
  };
}

export function orderOut(order: TopupOrder) {
  return {
    id: order.id,
    user_id: order.userId,
    package_id: order.packageId,
    package_name: order.packageName,
    minutes: order.minutes,
    price_idr: order.priceIdr,
    currency: order.currency,
    status: order.status,
    payment_method: order.paymentMethod,
    payment_proof_url: order.paymentProofUrl,
    transaction_code: order.transactionCode,
    notes: order.notes,
    created_at: order.createdAt.toISOString(),
    paid_at: order.paidAt?.toISOString() ?? null,
  };
}

export async function listActiveTopupPackages(): Promise<TopupPackage[]> {
  const rows = await db.select().from(topupPackages).where(eq(topupPackages.status, "active"));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createTopupOrder(opts: {
  userId: string;
  packageId: string;
  paymentMethod?: string;
  paymentProofUrl?: string | null;
  notes?: string;
}): Promise<TopupOrder> {
  const pkg = await db.query.topupPackages.findFirst({
    where: eq(topupPackages.id, opts.packageId),
  });
  if (pkg?.status !== "active") {
    throw httpError("Top-up package is not available.", 400);
  }

  const [created] = await db
    .insert(topupOrders)
    .values({
      userId: opts.userId,
      packageId: pkg.id,
      packageName: `${pkg.minutes} Lore Voice Minutes`,
      minutes: pkg.minutes,
      priceIdr: effectivePrice(pkg.priceIdr, pkg.discountPercent),
      currency: pkg.currency,
      status: "pending",
      paymentMethod: opts.paymentMethod ?? "",
      paymentProofUrl: opts.paymentProofUrl ?? null,
      transactionCode: generateAddonTransactionCode("TOP"),
      notes: opts.notes ?? "",
    })
    .returning();
  return created!;
}

export async function creditTopupOrder(order: TopupOrder, adminId?: string): Promise<TopupOrder> {
  if (order.status === "paid") return order;

  const pkg = await db.query.topupPackages.findFirst({
    where: eq(topupPackages.id, order.packageId),
  });
  const seconds = order.minutes * 60;
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + (pkg?.expiresAfterDays ?? 90));
  const sourceRef = `topup:${order.id}`;

  const existing = await db.query.minuteGrants.findFirst({
    where: and(
      eq(minuteGrants.userId, order.userId),
      eq(minuteGrants.kind, "topup"),
      eq(minuteGrants.sourceRef, sourceRef),
    ),
  });
  if (!existing) {
    const [grant] = await db
      .insert(minuteGrants)
      .values({
        userId: order.userId,
        kind: "topup",
        grantedSeconds: seconds,
        remainingSeconds: seconds,
        expiresAt: expires,
        sourceRef,
      })
      .returning();
    await writeLedger({
      userId: order.userId,
      grantId: grant!.id,
      type: "TOPUP_PURCHASE",
      deltaSeconds: seconds,
      idempotencyKey: sourceRef,
      sourceRef,
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(topupOrders)
    .set({
      status: "paid",
      paidAt: now,
      reviewedBy: adminId ?? order.reviewedBy,
    })
    .where(eq(topupOrders.id, order.id))
    .returning();
  return updated!;
}

export async function approveTopupOrder(orderId: string, adminId: string): Promise<TopupOrder> {
  const order = await db.query.topupOrders.findFirst({ where: eq(topupOrders.id, orderId) });
  if (!order) throw httpError("Top-up order not found.", 404);
  if (order.status !== "pending") throw httpError("Order is not pending.", 400);
  return creditTopupOrder(order, adminId);
}

export async function rejectTopupOrder(orderId: string, adminId: string, notes?: string): Promise<void> {
  const order = await db.query.topupOrders.findFirst({ where: eq(topupOrders.id, orderId) });
  if (!order) throw httpError("Top-up order not found.", 404);
  if (order.status !== "pending") throw httpError("Order is not pending.", 400);
  await db
    .update(topupOrders)
    .set({
      status: "rejected",
      reviewedBy: adminId,
      notes: notes ?? order.notes,
    })
    .where(eq(topupOrders.id, orderId));
}

export async function applyAdminAdjustment(opts: {
  userId: string;
  seconds: number;
  adminId: string;
  note?: string;
}): Promise<VoiceMinuteWallet> {
  if (!opts.seconds || opts.seconds === 0) {
    throw httpError("Adjustment seconds are required.", 400);
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, opts.userId) });
  if (!user) throw httpError("User not found.", 404);

  if (opts.seconds > 0) {
    const expires = new Date();
    expires.setUTCDate(expires.getUTCDate() + 90);
    const sourceRef = `admin:${randomUUID()}`;
    const [grant] = await db
      .insert(minuteGrants)
      .values({
        userId: opts.userId,
        kind: "admin",
        grantedSeconds: opts.seconds,
        remainingSeconds: opts.seconds,
        expiresAt: expires,
        sourceRef,
      })
      .returning();
    await writeLedger({
      userId: opts.userId,
      grantId: grant!.id,
      type: "ADMIN_ADJUSTMENT",
      deltaSeconds: opts.seconds,
      idempotencyKey: sourceRef,
      sourceRef: opts.note ?? opts.adminId,
    });
  } else {
    const taken = await consumeLots(opts.userId, Math.abs(opts.seconds));
    await writeLedger({
      userId: opts.userId,
      type: "ADMIN_ADJUSTMENT",
      deltaSeconds: -taken,
      idempotencyKey: `admin-debit:${randomUUID()}`,
      sourceRef: opts.note ?? opts.adminId,
    });
  }
  return getVoiceMinuteWallet(opts.userId);
}

export async function listUserTopupOrders(userId: string): Promise<TopupOrder[]> {
  return db
    .select()
    .from(topupOrders)
    .where(eq(topupOrders.userId, userId))
    .orderBy(desc(topupOrders.createdAt));
}

export async function listPlatformTopupOrders(opts?: {
  status?: string;
  search?: string;
}): Promise<Array<TopupOrder & { user_email: string; user_name: string }>> {
  const rows = await db
    .select({
      order: topupOrders,
      user_email: users.email,
      user_name: users.name,
    })
    .from(topupOrders)
    .innerJoin(users, eq(users.id, topupOrders.userId))
    .orderBy(desc(topupOrders.createdAt));

  return rows
    .filter((row) => {
      if (opts?.status && row.order.status !== opts.status) return false;
      if (opts?.search) {
        const q = opts.search.toLowerCase();
        const hay = `${row.user_email} ${row.user_name} ${row.order.transactionCode} ${row.order.packageName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .map((row) => ({
      ...row.order,
      user_email: row.user_email,
      user_name: row.user_name,
    }));
}

export async function listMinuteLedger(userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(minuteLedger)
    .where(eq(minuteLedger.userId, userId))
    .orderBy(desc(minuteLedger.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    delta_seconds: row.deltaSeconds,
    balance_after_seconds: row.balanceAfterSeconds,
    workspace_id: row.workspaceId,
    voice_session_id: row.voiceSessionId,
    created_at: row.createdAt.toISOString(),
  }));
}

export async function safeAssertCanStartVoiceSession(userId: string): Promise<VoiceMinuteWallet | null> {
  try {
    return await assertCanStartVoiceSession(userId);
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

export async function safeDebitEndedSession(sessionId: string): Promise<void> {
  try {
    await debitEndedSession(sessionId);
  } catch (err) {
    if (isMissingRelation(err)) return;
    log.error({ err, voiceSessionId: sessionId }, "billing.debit_failed");
  }
}
