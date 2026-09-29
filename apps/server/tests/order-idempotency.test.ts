import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

/**
 * TKT-018: confirming an order with a client request id must be idempotent —
 * a retry returns the order created by the first attempt, not a duplicate.
 *
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL.
 */
const hasDb =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite("order confirmation idempotency", () => {
  test("same key returns one order; a new key creates a new one", async () => {
    const { db } = await import("../src/db/client.js");
    const { businesses, orders, products } = await import("../src/db/schema.js");
    const { buildValidatedOrderSnapshot, persistConfirmedOrder } = await import(
      "../src/services/order-persistence.js"
    );

    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, "sunrise-coffee"))
      .limit(1);
    expect(business).toBeDefined();

    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.businessId, business!.id), eq(products.isActive, true)))
      .limit(1);
    expect(product).toBeDefined();

    const snapshot = buildValidatedOrderSnapshot([product!], [
      { productId: product!.productId, quantity: 1 },
    ]);
    const key = `probe-${randomUUID()}`;
    const otherKey = `probe-${randomUUID()}`;
    const createdIds: string[] = [];

    try {
      // Two concurrent confirms with the same key: unique index decides.
      const [first, second] = await Promise.allSettled([
        persistConfirmedOrder(business!.id, null, snapshot, { clientRequestId: key }),
        persistConfirmedOrder(business!.id, null, snapshot, { clientRequestId: key }),
      ]);
      expect(first.status).toBe("fulfilled");
      expect(second.status).toBe("fulfilled");
      if (first.status !== "fulfilled" || second.status !== "fulfilled") return;

      expect(first.value.id).toBe(second.value.id);
      expect(first.value.replayed || second.value.replayed).toBe(true);
      expect(first.value.items.length).toBeGreaterThan(0);
      createdIds.push(first.value.id);

      const rows = await db
        .select()
        .from(orders)
        .where(and(eq(orders.businessId, business!.id), eq(orders.clientRequestId, key)));
      expect(rows).toHaveLength(1);

      // A different key is a genuinely new order.
      const third = await persistConfirmedOrder(business!.id, null, snapshot, {
        clientRequestId: otherKey,
      });
      expect(third.id).not.toBe(first.value.id);
      expect(third.replayed).toBe(false);
      createdIds.push(third.id);
    } finally {
      if (createdIds.length > 0) {
        await db.delete(orders).where(inArray(orders.id, createdIds));
      }
    }
  });

  test("a request without a key still creates an order", async () => {
    const { db } = await import("../src/db/client.js");
    const { businesses, orders, products } = await import("../src/db/schema.js");
    const { buildValidatedOrderSnapshot, persistConfirmedOrder } = await import(
      "../src/services/order-persistence.js"
    );

    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, "sunrise-coffee"))
      .limit(1);
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.businessId, business!.id), eq(products.isActive, true)))
      .limit(1);
    const snapshot = buildValidatedOrderSnapshot([product!], [
      { productId: product!.productId, quantity: 2 },
    ]);

    const order = await persistConfirmedOrder(business!.id, null, snapshot);
    try {
      expect(order.replayed).toBe(false);
      expect(order.clientRequestId).toBeNull();
      expect(order.items).toHaveLength(1);
    } finally {
      await db.delete(orders).where(eq(orders.id, order.id));
    }
  });
});
