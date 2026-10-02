import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

/**
 * TKT-002: two concurrent bookings for one slot must leave exactly one row.
 *
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL (the
 * `test:with-services` wrapper provides both). Uses the seeded
 * `sunrise-coffee` business; any active product works as a bookable service.
 *
 * Shared DB/Redis clients are left open: every test file runs in one process
 * and the smoke suite owns teardown.
 */
const hasDb =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite("appointment overlap guard", () => {
  test("concurrent creates at one time yield one appointment; cancel frees it", async () => {
    const { db } = await import("../src/db/client.js");
    const { appointments, businesses, products } = await import("../src/db/schema.js");
    const { cancelAppointment, createAppointment, getAvailableSlots, SlotTakenError } =
      await import("../src/services/appointments.js");

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

    // Find an open slot in the next fortnight (skip Sundays, where the seeded
    // business hours are closed).
    let slot: string | undefined;
    let date = "";
    for (let offset = 1; offset <= 14 && !slot; offset += 1) {
      const candidate = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const slots = await getAvailableSlots({
        businessId: business!.id,
        productId: product!.productId,
        date: candidate,
        staffId: null,
      });
      if (slots.length > 0) {
        date = candidate;
        slot = slots[0]!;
      }
    }
    expect(slot).toBeDefined();
    expect(date).not.toBe("");

    const options = {
      businessId: business!.id,
      productId: product!.productId,
      customerName: "Overlap Probe",
      customerPhone: "+620000000",
      startsAt: slot!,
      staffId: null,
    };

    try {
      const results = await Promise.allSettled([
        createAppointment(options),
        createAppointment(options),
      ]);

      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<{ id: string }> =>
          result.status === "fulfilled",
      );
      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toBeDefined();
      expect(rejected!.reason).toBeInstanceOf(SlotTakenError);
      expect((rejected!.reason as SlotTakenError).statusCode).toBe(409);

      const rows = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, business!.id),
            eq(appointments.startsAt, new Date(slot!)),
          ),
        );
      expect(rows).toHaveLength(1);

      // Cancelling frees the slot: it is excluded from the overlap predicate.
      await cancelAppointment(business!.id, fulfilled[0]!.value.id);
      const rebooked = await createAppointment(options);
      expect(rebooked.id).toBeTruthy();
    } finally {
      // Delete by slot, not by collected ids: a failed assertion may have left
      // a row behind before it could be registered.
      await db
        .delete(appointments)
        .where(
          and(
            eq(appointments.businessId, business!.id),
            eq(appointments.startsAt, new Date(slot!)),
          ),
        );
    }
  });

  test("concurrent creates for one staff member conflict too", async () => {
    const { db } = await import("../src/db/client.js");
    const { appointments, businesses, products } = await import("../src/db/schema.js");
    const { createAppointment, getAvailableSlots, SlotTakenError } = await import(
      "../src/services/appointments.js"
    );
    const { createStaff } = await import("../src/services/booking.js");

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
    const staff = await createStaff(business!.id, { name: `Probe ${randomUUID().slice(0, 8)}` });

    let slot: string | undefined;
    for (let offset = 1; offset <= 14 && !slot; offset += 1) {
      const candidate = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      const slots = await getAvailableSlots({
        businessId: business!.id,
        productId: product!.productId,
        date: candidate,
        staffId: staff.id,
      });
      if (slots.length > 0) slot = slots[0]!;
    }
    expect(slot).toBeDefined();

    const options = {
      businessId: business!.id,
      productId: product!.productId,
      customerName: "Staff Overlap Probe",
      customerPhone: "+620000001",
      startsAt: slot!,
      staffId: staff.id,
    };

    try {
      const results = await Promise.allSettled([
        createAppointment(options),
        createAppointment(options),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      expect(rejected!.reason).toBeInstanceOf(SlotTakenError);

      const rows = await db
        .select()
        .from(appointments)
        .where(
          and(eq(appointments.businessId, business!.id), eq(appointments.staffId, staff.id)),
        );
      expect(rows).toHaveLength(1);
    } finally {
      // Delete the doctor's appointments before the doctor: the FK sets
      // staff_id to NULL, which the unassigned-overlap constraint re-checks.
      await db
        .delete(appointments)
        .where(
          and(eq(appointments.businessId, business!.id), eq(appointments.staffId, staff.id)),
        );
      const { bookingStaff } = await import("../src/db/schema.js");
      await db.delete(bookingStaff).where(eq(bookingStaff.id, staff.id));
    }
  });
});
