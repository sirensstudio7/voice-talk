import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

/**
 * TKT-001: voice-minute debits must be atomic across instances.
 *
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL (the
 * `test:with-services` wrapper provides both). Exercises `consumeLots`
 * directly so the assertion is about the lot arithmetic, not the HTTP layer.
 *
 * Shared DB/Redis clients are left open: every test file runs in one process
 * and the smoke suite owns teardown.
 */
const hasDb =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite("voice-minute debit", () => {
  test("concurrent debits drain a lot exactly once and never go negative", async () => {
    const { db } = await import("../src/db/client.js");
    const { minuteGrants, users } = await import("../src/db/schema.js");
    const { consumeLots } = await import("../src/services/voice-minutes.js");

    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `billing-${userId}@example.test`,
      passwordHash: "not-a-real-hash",
      name: "Billing Probe",
      status: "active",
    });

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
});
