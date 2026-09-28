import { and, eq, gte, lt, ne, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  appointments,
  bookingServices,
  bookingStaff,
  businessHours,
  products,
} from "../db/schema.js";
import { loadStaffHoursForSlot } from "./booking.js";

const SLOT_STEP_MIN = 15;
/** Clinic wall-clock. Indonesia product; matches seed bookings and kiosk copy. */
const BOOKING_TIME_ZONE = "Asia/Jakarta";
const BOOKING_OFFSET = "+07:00";

export type BusinessHourInput = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
};

export const DEFAULT_BUSINESS_HOURS: BusinessHourInput[] = [
  { day_of_week: 0, open_time: "09:00", close_time: "18:00", is_closed: true },
  { day_of_week: 1, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 2, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 3, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 4, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 5, open_time: "09:00", close_time: "18:00", is_closed: false },
  { day_of_week: 6, open_time: "09:00", close_time: "18:00", is_closed: false },
];

function parseTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toClinicDate(date: string, time: string): Date {
  const [hours, minutes] = time.split(":");
  return new Date(`${date}T${hours}:${minutes ?? "00"}:00${BOOKING_OFFSET}`);
}

function ymdInClinicZone(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatClinicIso(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${ymdInClinicZone(date)}T${get("hour")}:${get("minute")}:${get("second")}.000${BOOKING_OFFSET}`;
}

function minuteKey(date: Date): number {
  return Math.floor(date.getTime() / 60_000);
}

/**
 * Voice models often send naive local times or legacy UTC-as-wall-clock (`...Z`)
 * from older slot lists. Treat those as Asia/Jakarta. Explicit offsets stay absolute.
 */
export function parseAppointmentStart(raw: string): Date {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new Error("Invalid start time.");
  }

  const wallClock = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?(Z)?$/i,
  );
  if (wallClock) {
    return toClinicDate(wallClock[1]!, wallClock[2]!);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Start time must include the clock time, not only the date.");
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid start time.");
  }
  return parsed;
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day! + days));
  return utc.toISOString().slice(0, 10);
}

export function appointmentOut(
  row: typeof appointments.$inferSelect,
  staffName?: string | null,
) {
  return {
    id: row.id,
    product_id: row.productId,
    treatment_name: row.treatmentName,
    staff_id: row.staffId ?? null,
    staff_name: staffName ?? null,
    customer_name: row.customerName,
    customer_phone: row.customerPhone,
    starts_at: row.startsAt.toISOString(),
    ends_at: row.endsAt.toISOString(),
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

export function businessHourOut(row: typeof businessHours.$inferSelect) {
  return {
    day_of_week: row.dayOfWeek,
    open_time: row.openTime,
    close_time: row.closeTime,
    is_closed: row.isClosed,
  };
}

export async function ensureDefaultBusinessHours(businessId: string) {
  const existing = await db.query.businessHours.findMany({
    where: eq(businessHours.businessId, businessId),
  });
  if (existing.length > 0) return existing.map(businessHourOut);

  await db.insert(businessHours).values(
    DEFAULT_BUSINESS_HOURS.map((hour) => ({
      businessId,
      dayOfWeek: hour.day_of_week,
      openTime: hour.open_time,
      closeTime: hour.close_time,
      isClosed: hour.is_closed,
    })),
  );

  const rows = await db.query.businessHours.findMany({
    where: eq(businessHours.businessId, businessId),
  });
  return rows.map(businessHourOut);
}

export async function listBusinessHours(businessId: string) {
  const rows = await db.query.businessHours.findMany({
    where: eq(businessHours.businessId, businessId),
    orderBy: (table, { asc }) => [asc(table.dayOfWeek)],
  });
  if (rows.length === 0) {
    return ensureDefaultBusinessHours(businessId);
  }
  return rows.map(businessHourOut);
}

export async function saveBusinessHours(businessId: string, hours: BusinessHourInput[]) {
  await db.delete(businessHours).where(eq(businessHours.businessId, businessId));
  if (hours.length > 0) {
    await db.insert(businessHours).values(
      hours.map((hour) => ({
        businessId,
        dayOfWeek: hour.day_of_week,
        openTime: hour.open_time,
        closeTime: hour.close_time,
        isClosed: hour.is_closed,
      })),
    );
  }
  return listBusinessHours(businessId);
}

export async function listAppointments(businessId: string, date?: string) {
  const conditions = [eq(appointments.businessId, businessId)];
  if (date) {
    const start = toClinicDate(date, "00:00");
    const end = toClinicDate(addCalendarDays(date, 1), "00:00");
    conditions.push(gte(appointments.startsAt, start), lt(appointments.startsAt, end));
  }

  const rows = await db
    .select({
      appointment: appointments,
      staffName: bookingStaff.name,
    })
    .from(appointments)
    .leftJoin(bookingStaff, eq(bookingStaff.id, appointments.staffId))
    .where(and(...conditions))
    .orderBy(appointments.startsAt);

  return rows.map((row) => appointmentOut(row.appointment, row.staffName));
}

function asBookable(id: string, name: string, durationMin: number) {
  return {
    id,
    name,
    durationMin: durationMin > 0 ? durationMin : 30,
  };
}

async function resolveBookableService(businessId: string, productId: string) {
  const raw = productId.trim();
  if (!raw) {
    throw new Error("Treatment not found.");
  }

  const product = await db.query.products.findFirst({
    where: and(
      eq(products.businessId, businessId),
      eq(products.productId, raw),
      eq(products.isActive, true),
    ),
  });
  if (product) {
    return asBookable(product.productId, product.name, product.durationMin);
  }

  const service = await db.query.bookingServices.findFirst({
    where: and(
      eq(bookingServices.businessId, businessId),
      eq(bookingServices.id, raw),
      eq(bookingServices.isActive, true),
    ),
  });
  if (service) {
    return asBookable(service.id, service.name, service.durationMin);
  }

  const namedServices = await db
    .select()
    .from(bookingServices)
    .where(
      and(
        eq(bookingServices.businessId, businessId),
        eq(bookingServices.isActive, true),
        sql`lower(${bookingServices.name}) = ${raw.toLowerCase()}`,
      ),
    );
  if (namedServices.length === 1) {
    const match = namedServices[0]!;
    return asBookable(match.id, match.name, match.durationMin);
  }

  throw new Error("Treatment not found.");
}

async function resolveStaffId(businessId: string, staffId: string | null | undefined) {
  const raw = staffId?.trim() || "";
  if (!raw) return null;

  const byId = await db.query.bookingStaff.findFirst({
    where: and(
      eq(bookingStaff.businessId, businessId),
      eq(bookingStaff.id, raw),
      eq(bookingStaff.isActive, true),
    ),
  });
  if (byId) return byId.id;

  const rows = await db.query.bookingStaff.findMany({
    where: and(eq(bookingStaff.businessId, businessId), eq(bookingStaff.isActive, true)),
  });
  const needle = raw.toLowerCase();
  const matches = rows.filter((row) => {
    const name = row.name.toLowerCase();
    return name === needle || name.includes(needle) || needle.includes(name);
  });
  if (matches.length === 1) return matches[0]!.id;
  throw new Error("Doctor not found.");
}

export async function getAvailableSlots(options: {
  businessId: string;
  productId: string;
  date: string;
  staffId?: string | null;
}) {
  const service = await resolveBookableService(options.businessId, options.productId);

  const date = new Date(`${options.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date. Use YYYY-MM-DD.");
  }

  const dayOfWeek = date.getUTCDay();
  let hours = await listBusinessHours(options.businessId);
  const staffId = await resolveStaffId(options.businessId, options.staffId);
  if (staffId) {
    const staffHours = await loadStaffHoursForSlot(options.businessId, staffId);
    if (!staffHours) {
      throw new Error("Doctor not found.");
    }
    hours = staffHours.hours;
  }

  const dayHours = hours.find((hour) => hour.day_of_week === dayOfWeek);
  if (!dayHours || dayHours.is_closed) {
    return [];
  }

  const openMinutes = parseTimeToMinutes(dayHours.open_time);
  const closeMinutes = parseTimeToMinutes(dayHours.close_time);
  const duration = service.durationMin;

  const dayStart = toClinicDate(options.date, dayHours.open_time);
  const dayEnd = toClinicDate(options.date, dayHours.close_time);

  const bookedFilters = [
    eq(appointments.businessId, options.businessId),
    gte(appointments.startsAt, dayStart),
    lt(appointments.startsAt, dayEnd),
    ne(appointments.status, "cancelled"),
  ];
  if (staffId) {
    bookedFilters.push(eq(appointments.staffId, staffId));
  }

  const booked = await db
    .select()
    .from(appointments)
    .where(and(...bookedFilters));

  const slots: string[] = [];
  for (let minute = openMinutes; minute + duration <= closeMinutes; minute += SLOT_STEP_MIN) {
    const slotStart = toClinicDate(options.date, minutesToTime(minute));
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
    const overlaps = booked.some(
      (appointment) => slotStart < appointment.endsAt && slotEnd > appointment.startsAt,
    );
    if (!overlaps) {
      slots.push(formatClinicIso(slotStart));
    }
  }

  return slots;
}

export async function createAppointment(options: {
  businessId: string;
  productId: string;
  customerName: string;
  customerPhone?: string;
  startsAt: string;
  voiceSessionId?: string | null;
  staffId?: string | null;
}) {
  const service = await resolveBookableService(options.businessId, options.productId);
  const staffId = await resolveStaffId(options.businessId, options.staffId);
  if (staffId) {
    const staffHours = await loadStaffHoursForSlot(options.businessId, staffId);
    if (!staffHours) {
      throw new Error("Doctor not found.");
    }
  }

  if (!options.customerName.trim()) {
    throw new Error("Customer name is required.");
  }

  const startsAt = parseAppointmentStart(options.startsAt);
  const duration = service.durationMin;
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);
  const date = ymdInClinicZone(startsAt);
  const available = await getAvailableSlots({
    businessId: options.businessId,
    productId: service.id,
    date,
    staffId,
  });

  const matched = available.some((slot) => minuteKey(new Date(slot)) === minuteKey(startsAt));
  if (!matched) {
    throw new Error("That time slot is no longer available.");
  }

  const [row] = await db
    .insert(appointments)
    .values({
      businessId: options.businessId,
      productId: service.id,
      treatmentName: service.name,
      customerName: options.customerName.trim(),
      customerPhone: options.customerPhone?.trim() ?? "",
      startsAt,
      endsAt,
      voiceSessionId: options.voiceSessionId ?? null,
      staffId,
    })
    .returning();

  let staffName: string | null = null;
  if (row!.staffId) {
    const staff = await db.query.bookingStaff.findFirst({
      where: eq(bookingStaff.id, row!.staffId),
    });
    staffName = staff?.name ?? null;
  }

  return appointmentOut(row!, staffName);
}

export async function cancelAppointment(businessId: string, appointmentId: string) {
  const existing = await db.query.appointments.findFirst({
    where: and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId)),
  });
  if (!existing) {
    throw new Error("Appointment not found.");
  }

  const [row] = await db
    .update(appointments)
    .set({ status: "cancelled" })
    .where(eq(appointments.id, appointmentId))
    .returning();

  return appointmentOut(row!);
}
