import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

/**
 * TKT-005: `/menu` is cached per business slug and invalidated by every kiosk
 * config path. Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL.
 */
const hasDb =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite("menu cache", () => {
  test("warm reads reuse the payload; both invalidation paths rebuild it", async () => {
    const { getMenuPayload } = await import("../src/services/menu.js");
    const { invalidateMenuCacheForBusiness } = await import("../src/services/menu-cache.js");
    const { broadcastKioskPayloadLocally } = await import(
      "../src/services/vision-orchestrator.js"
    );
    const { metricsSnapshot } = await import("../src/http/metrics.js");
    const { db } = await import("../src/db/client.js");
    const { businesses } = await import("../src/db/schema.js");

    const [business] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, "sunrise-coffee"))
      .limit(1);
    expect(business).toBeDefined();

    const first = await getMenuPayload("sunrise-coffee");
    expect(first).toBeTruthy();

    const hitsBefore = metricsSnapshot()["menu.cache_hits_total"] ?? 0;
    const second = await getMenuPayload("sunrise-coffee");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect((metricsSnapshot()["menu.cache_hits_total"] ?? 0) - hitsBefore).toBe(1);

    // Admin mutation path: invalidate by business id (products/appearance routes).
    const missesBefore = metricsSnapshot()["menu.cache_misses_total"] ?? 0;
    invalidateMenuCacheForBusiness(business!.id);
    const afterAdminEdit = await getMenuPayload("sunrise-coffee");
    expect((metricsSnapshot()["menu.cache_misses_total"] ?? 0) - missesBefore).toBe(1);
    expect(JSON.stringify(afterAdminEdit)).toBe(JSON.stringify(first));

    // Kiosk bus path: any payload invalidates the slug on the receiving side.
    const busMissesBefore = metricsSnapshot()["menu.cache_misses_total"] ?? 0;
    broadcastKioskPayloadLocally("sunrise-coffee", { type: "test.invalidate" });
    const afterBus = await getMenuPayload("sunrise-coffee");
    expect((metricsSnapshot()["menu.cache_misses_total"] ?? 0) - busMissesBefore).toBe(1);
    expect(JSON.stringify(afterBus)).toBe(JSON.stringify(first));
  });
});
