import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

/**
 * TKT-008: dashboards aggregate in SQL over bounded windows, and the retention
 * job deletes only rows older than the configured cutoff.
 *
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL.
 */
const hasDb =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;

suite("analytics aggregation and retention", () => {
  test("vision metrics count only the window, in SQL", async () => {
    const { db } = await import("../src/db/client.js");
    const { businesses, visionEvents } = await import("../src/db/schema.js");
    const { getVisionMetrics } = await import("../src/services/vision-orchestrator.js");

    const [business] = await db
      .insert(businesses)
      .values({ slug: `analytics-${randomUUID().slice(0, 8)}`, name: "Analytics Probe" })
      .returning();

    try {
      const old = new Date(Date.now() - 30 * DAY_MS);
      await db.insert(visionEvents).values([
        { businessId: business!.id, kioskId: "probe", eventType: "PERSON_ENTER" },
        { businessId: business!.id, kioskId: "probe", eventType: "PERSON_ENTER" },
        { businessId: business!.id, kioskId: "probe", eventType: "PERSON_CONFIRMED" },
        { businessId: business!.id, kioskId: "probe", eventType: "PERSON_ENTER", createdAt: old },
      ]);

      const metrics = await getVisionMetrics(business!.id, 7);
      expect(metrics.person_enter_count).toBe(2);
      expect(metrics.person_confirmed_count).toBe(1);
      expect(metrics.greeting_accuracy).toBe(0.5);
      expect(metrics.false_greeting_rate).toBe(0.5);
    } finally {
      await db.delete(visionEvents).where(eq(visionEvents.businessId, business!.id));
      await db.delete(businesses).where(eq(businesses.id, business!.id));
    }
  });

  test("retention deletes old events and keeps recent ones", async () => {
    const { db } = await import("../src/db/client.js");
    const { analyticsEvents, businesses } = await import("../src/db/schema.js");
    const { runAnalyticsRetention } = await import("../src/services/analytics-jobs.js");

    const [business] = await db
      .insert(businesses)
      .values({ slug: `retention-${randomUUID().slice(0, 8)}`, name: "Retention Probe" })
      .returning();
    const eventName = `retention_probe_${randomUUID().slice(0, 8)}`;

    try {
      await db.insert(analyticsEvents).values([
        {
          businessId: business!.id,
          eventName,
          createdAt: new Date(Date.now() - 400 * DAY_MS),
        },
        { businessId: business!.id, eventName },
      ]);

      const deleted = await runAnalyticsRetention();
      expect(deleted.analytics).toBeGreaterThanOrEqual(1);

      const remaining = await db
        .select()
        .from(analyticsEvents)
        .where(
          and(eq(analyticsEvents.businessId, business!.id), eq(analyticsEvents.eventName, eventName)),
        );
      expect(remaining).toHaveLength(1);
    } finally {
      await db.delete(analyticsEvents).where(eq(analyticsEvents.businessId, business!.id));
      await db.delete(businesses).where(eq(businesses.id, business!.id));
    }
  });
});
