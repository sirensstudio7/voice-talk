import { and, eq, gte, lt, ne } from "drizzle-orm";

import { db } from "../db/client.js";
import { appointments, businessHours, products } from "../db/schema.js";

const SLOT_STEP_MIN = 15;

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

function toUtcDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00.000Z`);
}

export function appointmentOut(row: typeof appointments.$inferSelect) {
  return {
    id: row.id,
    product_id: row.productId,
    treatment_name: row.treatmentName,
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
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    conditions.push(gte(appointments.startsAt, start), lt(appointments.startsAt, end));
  }

  const rows = await db
    .select()
    .from(appointments)
    .where(and(...conditions))
    .orderBy(appointments.startsAt);

  return rows.map(appointmentOut);
}

export async function getAvailableSlots(options: {
  businessId: string;
  productId: string;
  date: string;
}) {
  const product = await db.query.products.findFirst({
    where: and(
      eq(products.businessId, options.businessId),
      eq(products.productId, options.productId),
      eq(products.isActive, true),
    ),
  });
  if (!product) {
    throw new Error("Treatment not found.");
  }

  const date = new Date(`${options.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date. Use YYYY-MM-DD.");
  }

  const dayOfWeek = date.getUTCDay();
  const hours = await listBusinessHours(options.businessId);
  const dayHours = hours.find((hour) => hour.day_of_week === dayOfWeek);
  if (!dayHours || dayHours.is_closed) {
    return [];
  }

  const openMinutes = parseTimeToMinutes(dayHours.open_time);
  const closeMinutes = parseTimeToMinutes(dayHours.close_time);
  const duration = product.durationMin > 0 ? product.durationMin : 30;

  const dayStart = toUtcDate(options.date, dayHours.open_time);
  const dayEnd = toUtcDate(options.date, dayHours.close_time);

  const booked = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, options.businessId),
        gte(appointments.startsAt, dayStart),
        lt(appointments.startsAt, dayEnd),
        ne(appointments.status, "cancelled"),
      ),
    );

  const slots: string[] = [];
  for (let minute = openMinutes; minute + duration <= closeMinutes; minute += SLOT_STEP_MIN) {
    const slotStart = toUtcDate(options.date, minutesToTime(minute));
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
    const overlaps = booked.some(
      (appointment) => slotStart < appointment.endsAt && slotEnd > appointment.startsAt,
    );
    if (!overlaps) {
      slots.push(slotStart.toISOString());
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
}) {
  const product = await db.query.products.findFirst({
    where: and(
      eq(products.businessId, options.businessId),
      eq(products.productId, options.productId),
      eq(products.isActive, true),
    ),
  });
  if (!product) {
    throw new Error("Treatment not found.");
  }

  const startsAt = new Date(options.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("Invalid start time.");
  }

  const duration = product.durationMin > 0 ? product.durationMin : 30;
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);
  const date = startsAt.toISOString().slice(0, 10);
  const available = await getAvailableSlots({
    businessId: options.businessId,
    productId: options.productId,
    date,
  });

  if (!available.includes(startsAt.toISOString())) {
    throw new Error("That time slot is no longer available.");
  }

  const [row] = await db
    .insert(appointments)
    .values({
      businessId: options.businessId,
      productId: product.productId,
      treatmentName: product.name,
      customerName: options.customerName.trim(),
      customerPhone: options.customerPhone?.trim() ?? "",
      startsAt,
      endsAt,
      voiceSessionId: options.voiceSessionId ?? null,
    })
    .returning();

  return appointmentOut(row!);
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
