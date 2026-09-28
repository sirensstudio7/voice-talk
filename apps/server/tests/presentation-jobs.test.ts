import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

/**
 * TKT-010: a deck abandoned mid-prepare must not stay `processing` forever.
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL.
 */
const hasDb =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite("presentation stuck sweep", () => {
  test("abandoned processing rows become failed; fresh ones stay", async () => {
    const { db } = await import("../src/db/client.js");
    const { businesses, presentations } = await import("../src/db/schema.js");
    const { sweepStuckPresentations } = await import("../src/services/presentation-jobs.js");

    const [business] = await db
      .insert(businesses)
      .values({ slug: `sweep-${randomUUID().slice(0, 8)}`, name: "Sweep Probe" })
      .returning();

    const staleUpdatedAt = new Date(Date.now() - 30 * 60 * 1000);
    const [stuck] = await db
      .insert(presentations)
      .values({
        businessId: business!.id,
        title: "Abandoned",
        status: "processing",
        processingStep: "parsing",
        updatedAt: staleUpdatedAt,
      })
      .returning();
    const [fresh] = await db
      .insert(presentations)
      .values({
        businessId: business!.id,
        title: "Still running",
        status: "processing",
        processingStep: "parsing",
      })
      .returning();

    try {
      const swept = await sweepStuckPresentations();
      expect(swept).toBeGreaterThanOrEqual(1);

      const [afterStuck] = await db
        .select()
        .from(presentations)
        .where(eq(presentations.id, stuck!.id));
      expect(afterStuck!.status).toBe("failed");
      expect(afterStuck!.processingStep).toBe("failed");
      expect(afterStuck!.processingError).toContain("Retry");

      const [afterFresh] = await db
        .select()
        .from(presentations)
        .where(eq(presentations.id, fresh!.id));
      expect(afterFresh!.status).toBe("processing");
    } finally {
      await db.delete(presentations).where(eq(presentations.businessId, business!.id));
      await db.delete(businesses).where(eq(businesses.id, business!.id));
    }
  });
});
