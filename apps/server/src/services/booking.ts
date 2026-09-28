import { and, asc, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  bookingServices,
  bookingSettings,
  bookingStaff,
  bookingStaffHours,
  businesses,
  type BookingService,
  type BookingSettings,
  type BookingStaff,
} from "../db/schema.js";
import { BOOKING_CODE, hasActiveAddon } from "./addon-entitlement.js";
import { broadcastKioskPayload } from "./vision-orchestrator.js";

export type StaffHourInput = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
};

const DEFAULT_STAFF_HOURS: StaffHourInput[] = [
  { day_of_week: 0, open_time: "09:00", close_time: "18:00", is_closed: true },
  { day_of_week: 1, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 2, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 3, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 4, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 5, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 6, open_time: "09:00", close_time: "18:00", is_closed: false },
];

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function assertBookingAddon(businessId: string): Promise<void> {
  const active = await hasActiveAddon(businessId, BOOKING_CODE);
  if (!active) {
    throw httpError("Booking add-on is not active", 403);
  }
}

export function bookingSettingsOut(settings: BookingSettings) {
  return {
    enabled: settings.enabled,
    updated_at: settings.updatedAt.toISOString(),
  };
}

export async function getOrCreateBookingSettings(businessId: string): Promise<BookingSettings> {
  const [existing] = await db
    .select()
    .from(bookingSettings)
    .where(eq(bookingSettings.businessId, businessId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(bookingSettings)
    .values({ businessId })
    .returning();
  return created!;
}

/** Subscription is active AND the merchant has not paused kiosk booking. */
export async function isBookingRuntimeActive(businessId: string): Promise<boolean> {
  const subscribed = await hasActiveAddon(businessId, BOOKING_CODE);
  if (!subscribed) return false;
  const settings = await getOrCreateBookingSettings(businessId);
  return settings.enabled;
}

export async function broadcastBookingConfig(businessId: string, businessSlug?: string) {
  const slug =
    businessSlug ??
    (
      await db
        .select({ slug: businesses.slug })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1)
    )[0]?.slug;
  if (!slug) return;
  const cfg = await getBookingPublicConfig(businessId);
  broadcastKioskPayload(slug, { type: "booking.config", ...cfg });
}

export async function updateBookingSettings(
  businessId: string,
  input: { enabled?: boolean },
  businessSlug?: string,
): Promise<BookingSettings> {
  await assertBookingAddon(businessId);
  if (typeof input.enabled !== "boolean") {
    throw httpError("enabled boolean is required", 400);
  }
  const existing = await getOrCreateBookingSettings(businessId);
  const [updated] = await db
    .update(bookingSettings)
    .set({ enabled: input.enabled, updatedAt: new Date() })
    .where(eq(bookingSettings.businessId, existing.businessId))
    .returning();
  await broadcastBookingConfig(businessId, businessSlug);
  return updated!;
}

export function staffOut(row: BookingStaff) {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    photo_url: row.photoUrl ?? "",
    is_active: row.isActive,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
  };
}

export function serviceOut(row: BookingService) {
  return {
    id: row.id,
    name: row.name,
    duration_min: row.durationMin,
    price: row.price,
    description: row.description,
    is_active: row.isActive,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
  };
}

export function staffHourOut(row: typeof bookingStaffHours.$inferSelect): StaffHourInput {
  return {
    day_of_week: row.dayOfWeek,
    open_time: row.openTime,
    close_time: row.closeTime,
    is_closed: row.isClosed,
  };
}

export async function listStaff(businessId: string, activeOnly = false) {
  const rows = await db
    .select()
    .from(bookingStaff)
    .where(
      activeOnly
        ? and(eq(bookingStaff.businessId, businessId), eq(bookingStaff.isActive, true))
        : eq(bookingStaff.businessId, businessId),
    )
    .orderBy(asc(bookingStaff.sortOrder), asc(bookingStaff.name));
  return rows.map(staffOut);
}

export async function getStaff(businessId: string, staffId: string) {
  const row = await db.query.bookingStaff.findFirst({
    where: and(eq(bookingStaff.id, staffId), eq(bookingStaff.businessId, businessId)),
  });
  return row ?? null;
}

function mergeStaffHours(hours?: StaffHourInput[]): StaffHourInput[] {
  if (!hours || hours.length === 0) return DEFAULT_STAFF_HOURS;
  const byDay = new Map(
    hours
      .filter((hour) => Number.isInteger(hour.day_of_week) && hour.day_of_week >= 0 && hour.day_of_week <= 6)
      .map((hour) => [hour.day_of_week, hour]),
  );
  return DEFAULT_STAFF_HOURS.map((fallback) => {
    const row = byDay.get(fallback.day_of_week);
    if (!row) return fallback;
    return {
      day_of_week: fallback.day_of_week,
      open_time: row.open_time || fallback.open_time,
      close_time: row.close_time || fallback.close_time,
      is_closed: Boolean(row.is_closed),
    };
  });
}

export async function createStaff(
  businessId: string,
  input: { name: string; specialty?: string; photo_url?: string; hours?: StaffHourInput[] },
) {
  const name = input.name.trim();
  if (!name) throw httpError("Name is required", 400);

  const [row] = await db
    .insert(bookingStaff)
    .values({
      businessId,
      name,
      specialty: (input.specialty ?? "").trim().slice(0, 255),
      photoUrl: (input.photo_url ?? "").trim(),
    })
    .returning();

  const hours = mergeStaffHours(input.hours);
  await db.insert(bookingStaffHours).values(
    hours.map((hour) => ({
      staffId: row!.id,
      dayOfWeek: hour.day_of_week,
      openTime: hour.open_time,
      closeTime: hour.close_time,
      isClosed: hour.is_closed,
    })),
  );

  return staffOut(row!);
}

export async function updateStaff(
  businessId: string,
  staffId: string,
  input: {
    name?: string;
    specialty?: string;
    photo_url?: string;
    is_active?: boolean;
    sort_order?: number;
  },
) {
  const existing = await getStaff(businessId, staffId);
  if (!existing) throw httpError("Doctor not found", 404);

  const patch: Partial<typeof bookingStaff.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw httpError("Name is required", 400);
    patch.name = name;
  }
  if (input.specialty !== undefined) {
    patch.specialty = input.specialty.trim().slice(0, 255);
  }
  if (input.photo_url !== undefined) {
    patch.photoUrl = input.photo_url.trim();
  }
  if (input.is_active !== undefined) patch.isActive = Boolean(input.is_active);
  if (typeof input.sort_order === "number" && Number.isFinite(input.sort_order)) {
    patch.sortOrder = input.sort_order;
  }

  const [row] = await db
    .update(bookingStaff)
    .set(patch)
    .where(eq(bookingStaff.id, staffId))
    .returning();
  return staffOut(row!);
}

export async function deleteStaff(businessId: string, staffId: string) {
  const existing = await getStaff(businessId, staffId);
  if (!existing) throw httpError("Doctor not found", 404);
  await db.delete(bookingStaff).where(eq(bookingStaff.id, staffId));
  return { ok: true };
}

export async function listStaffHours(businessId: string, staffId: string) {
  const existing = await getStaff(businessId, staffId);
  if (!existing) throw httpError("Doctor not found", 404);

  const rows = await db
    .select()
    .from(bookingStaffHours)
    .where(eq(bookingStaffHours.staffId, staffId))
    .orderBy(asc(bookingStaffHours.dayOfWeek));

  if (rows.length === 0) {
    await db.insert(bookingStaffHours).values(
      DEFAULT_STAFF_HOURS.map((hour) => ({
        staffId,
        dayOfWeek: hour.day_of_week,
        openTime: hour.open_time,
        closeTime: hour.close_time,
        isClosed: hour.is_closed,
      })),
    );
    return DEFAULT_STAFF_HOURS;
  }
  return rows.map(staffHourOut);
}

export async function saveStaffHours(
  businessId: string,
  staffId: string,
  hours: StaffHourInput[],
) {
  const existing = await getStaff(businessId, staffId);
  if (!existing) throw httpError("Doctor not found", 404);

  const nextHours = mergeStaffHours(hours);
  await db.delete(bookingStaffHours).where(eq(bookingStaffHours.staffId, staffId));
  await db.insert(bookingStaffHours).values(
    nextHours.map((hour) => ({
      staffId,
      dayOfWeek: hour.day_of_week,
      openTime: hour.open_time,
      closeTime: hour.close_time,
      isClosed: hour.is_closed,
    })),
  );
  return listStaffHours(businessId, staffId);
}

export async function listServices(businessId: string, activeOnly = false) {
  const rows = await db
    .select()
    .from(bookingServices)
    .where(
      activeOnly
        ? and(eq(bookingServices.businessId, businessId), eq(bookingServices.isActive, true))
        : eq(bookingServices.businessId, businessId),
    )
    .orderBy(asc(bookingServices.sortOrder), asc(bookingServices.name));
  return rows.map(serviceOut);
}

export async function createService(
  businessId: string,
  input: { name: string; duration_min?: number; price?: number; description?: string },
) {
  const name = input.name.trim();
  if (!name) throw httpError("Name is required", 400);
  const duration = Number(input.duration_min ?? 30);
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    throw httpError("Duration must be between 5 and 480 minutes", 400);
  }
  const price = Number(input.price ?? 0);
  if (!Number.isFinite(price) || price < 0) {
    throw httpError("Price must be zero or more", 400);
  }

  const [row] = await db
    .insert(bookingServices)
    .values({
      businessId,
      name,
      durationMin: Math.round(duration),
      price,
      description: (input.description ?? "").trim().slice(0, 4000),
    })
    .returning();
  return serviceOut(row!);
}

export async function updateService(
  businessId: string,
  serviceId: string,
  input: {
    name?: string;
    duration_min?: number;
    price?: number;
    description?: string;
    is_active?: boolean;
  },
) {
  const existing = await db.query.bookingServices.findFirst({
    where: and(eq(bookingServices.id, serviceId), eq(bookingServices.businessId, businessId)),
  });
  if (!existing) throw httpError("Service not found", 404);

  const patch: Partial<typeof bookingServices.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw httpError("Name is required", 400);
    patch.name = name;
  }
  if (input.duration_min !== undefined) {
    const duration = Number(input.duration_min);
    if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
      throw httpError("Duration must be between 5 and 480 minutes", 400);
    }
    patch.durationMin = Math.round(duration);
  }
  if (input.price !== undefined) {
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0) {
      throw httpError("Price must be zero or more", 400);
    }
    patch.price = price;
  }
  if (input.description !== undefined) {
    patch.description = input.description.trim().slice(0, 4000);
  }
  if (input.is_active !== undefined) patch.isActive = Boolean(input.is_active);

  const [row] = await db
    .update(bookingServices)
    .set(patch)
    .where(eq(bookingServices.id, serviceId))
    .returning();
  return serviceOut(row!);
}

export async function deleteService(businessId: string, serviceId: string) {
  const existing = await db.query.bookingServices.findFirst({
    where: and(eq(bookingServices.id, serviceId), eq(bookingServices.businessId, businessId)),
  });
  if (!existing) throw httpError("Service not found", 404);
  await db.delete(bookingServices).where(eq(bookingServices.id, serviceId));
  return { ok: true };
}

export async function getBookingPublicConfig(businessId: string) {
  const subscribed = await hasActiveAddon(businessId, BOOKING_CODE);
  if (!subscribed) {
    return {
      active: false,
      enabled: false,
      staff: [] as ReturnType<typeof staffOut>[],
      services: [] as ReturnType<typeof serviceOut>[],
    };
  }
  const settings = await getOrCreateBookingSettings(businessId);
  if (!settings.enabled) {
    return {
      active: false,
      enabled: false,
      staff: [] as ReturnType<typeof staffOut>[],
      services: [] as ReturnType<typeof serviceOut>[],
    };
  }
  const [staff, services] = await Promise.all([
    listStaff(businessId, true),
    listServices(businessId, true),
  ]);
  return { active: true, enabled: true, staff, services };
}

/** Used by slot generation so appointments.ts does not import the whole booking module cycle. */
export async function loadStaffHoursForSlot(businessId: string, staffId: string) {
  const staff = await getStaff(businessId, staffId);
  if (!staff || !staff.isActive) return null;
  const hours = await listStaffHours(businessId, staffId);
  return { staff, hours };
}
