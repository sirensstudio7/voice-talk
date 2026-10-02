import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

/**
 * TKT-001 / TKT-017: voice-minute debits must be atomic and conflict-safe
 * across instances.
 *
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL (the
 * `test:with-services` wrapper provides both). Shared DB/Redis clients are left
 * open: every test file runs in one process and the smoke suite owns teardown.
 */
const hasDb =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

async function createProbeUser() {
  const { db } = await import("../src/db/client.js");
  const { users } = await import("../src/db/schema.js");
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: `billing-${userId}@example.test`,
    passwordHash: "not-a-real-hash",
    name: "Billing Probe",
    status: "active",
  });
  return userId;
}

async function seededBusinessId(): Promise<string> {
  const { db } = await import("../src/db/client.js");
  const { businesses } = await import("../src/db/schema.js");
  const [business] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.slug, "sunrise-coffee"))
    .limit(1);
  expect(business).toBeDefined();
  return business!.id;
}

/** A finished 60s session, so the charge is a deterministic 60 seconds. */
async function createEndedSession(businessId: string) {
  const { db } = await import("../src/db/client.js");
  const { voiceSessions } = await import("../src/db/schema.js");
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 60_000);
  const [session] = await db
    .insert(voiceSessions)
    .values({ businessId, status: "ended", endReason: "test", startedAt, endedAt })
    .returning();
  return session!;
}

suite("voice-minute debit", () => {
  test("concurrent debits drain a lot exactly once and never go negative", async () => {
    const { db } = await import("../src/db/client.js");
    const { minuteGrants } = await import("../src/db/schema.js");
    const { consumeLots } = await import("../src/services/voice-minutes.js");

    const userId = await createProbeUser();
    const [lot] = await db
      .insert(minuteGrants)
      .values({
        userId,
        kind: "admin",
        grantedSeconds: 100,
        remainingSeconds: 100,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        sourceRef: `test:${userId}`,
      })
      .returning();

    // Four 30s debits race for a 100s lot: atomic consumption charges exactly
    // 100 in total; the old read-modify-write loop could charge 120 and leave
    // the ledger disagreeing with the lot.
    const taken = await Promise.all(
      Array.from({ length: 4 }, () => consumeLots(userId, 30)),
    );

    const [after] = await db
      .select()
      .from(minuteGrants)
      .where(eq(minuteGrants.id, lot!.id));

    const charged = taken.reduce((sum, seconds) => sum + seconds, 0);
    expect(after!.remainingSeconds).toBeGreaterThanOrEqual(0);
    expect(after!.remainingSeconds).toBe(0);
    expect(charged).toBe(100);
    expect(after!.remainingSeconds + charged).toBe(100);
  });

  test("same session debited twice concurrently settles once (TKT-017)", async () => {
    const { db } = await import("../src/db/client.js");
    const { minuteGrants, minuteLedger } = await import("../src/db/schema.js");
    const { debitVoiceSession } = await import("../src/services/voice-minutes.js");

    const userId = await createProbeUser();
    const businessId = await seededBusinessId();
    await db.insert(minuteGrants).values({
      userId,
      kind: "admin",
      grantedSeconds: 60,
      remainingSeconds: 60,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      sourceRef: `test:${userId}`,
    });
    const session = await createEndedSession(businessId);

    const results = await Promise.allSettled([
      debitVoiceSession({
        userId,
        businessId,
        sessionId: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt!,
      }),
      debitVoiceSession({
        userId,
        businessId,
        sessionId: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt!,
      }),
    ]);

    // Before the fix, the loser of the ledger insert got a 23505 and rejected.
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason?.message ?? result.reason));
    expect(failures).toEqual([]);

    const usage = await db
      .select()
      .from(minuteLedger)
      .where(
        and(
          eq(minuteLedger.userId, userId),
          eq(minuteLedger.type, "VOICE_USAGE"),
          eq(minuteLedger.voiceSessionId, session.id),
        ),
      );
    expect(usage).toHaveLength(1);
    expect(usage[0]!.deltaSeconds).toBe(-60);
  });

  test("concurrent debits of two sessions conserve seconds (TKT-017)", async () => {
    const { db } = await import("../src/db/client.js");
    const { minuteGrants, minuteLedger } = await import("../src/db/schema.js");
    const { debitVoiceSession } = await import("../src/services/voice-minutes.js");

    const userId = await createProbeUser();
    const businessId = await seededBusinessId();
    await db.insert(minuteGrants).values({
      userId,
      kind: "admin",
      grantedSeconds: 100,
      remainingSeconds: 100,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      sourceRef: `test:${userId}`,
    });
    const [first, second] = await Promise.all([
      createEndedSession(businessId),
      createEndedSession(businessId),
    ]);

    const results = await Promise.allSettled([
      debitVoiceSession({
        userId,
        businessId,
        sessionId: first!.id,
        startedAt: first!.startedAt,
        endedAt: first!.endedAt!,
      }),
      debitVoiceSession({
        userId,
        businessId,
        sessionId: second!.id,
        startedAt: second!.startedAt,
        endedAt: second!.endedAt!,
      }),
    ]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason?.message ?? result.reason));
    expect(failures).toEqual([]);

    // Conservation across every lot the account holds (the entitlement path may
    // add a plan grant to a fresh user): remaining + charged === granted.
    const lots = await db
      .select()
      .from(minuteGrants)
      .where(eq(minuteGrants.userId, userId));
    const remaining = lots.reduce((sum, lot) => sum + lot.remainingSeconds, 0);
    const granted = lots.reduce((sum, lot) => sum + lot.grantedSeconds, 0);
    const usage = await db
      .select()
      .from(minuteLedger)
      .where(and(eq(minuteLedger.userId, userId), eq(minuteLedger.type, "VOICE_USAGE")));
    const charged = usage.reduce((sum, row) => sum + Math.abs(row.deltaSeconds), 0);

    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining + charged).toBe(granted);
    expect(usage.length).toBeLessThanOrEqual(2);
  });
});
