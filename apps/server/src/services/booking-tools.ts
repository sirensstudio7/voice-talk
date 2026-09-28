import { Type } from "@google/genai";

import { logger } from "../http/logger.js";
import {
  cancelAppointment,
  createAppointment,
  getAvailableSlots,
} from "./appointments.js";
import { effectivePrice } from "./pricing.js";
import type { ProductInfo } from "./tools.js";

const log = logger.child({ component: "booking" });

export function buildBookingToolDeclarations(options?: { includeStaff?: boolean }) {
  const staffParams = options?.includeStaff
    ? {
        staff_id: {
          type: Type.STRING,
          description: "Doctor/staff id from list_staff.",
        },
      }
    : {};

  const declarations = [
    {
      name: "list_treatments",
      description: "List available services or treatments with price and duration.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    {
      name: "check_availability",
      description: "Check open appointment slots for a service on a given date (YYYY-MM-DD).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          product_id: { type: Type.STRING, description: "Service id from list_treatments." },
          date: { type: Type.STRING, description: "Date in YYYY-MM-DD format." },
          ...staffParams,
        },
        required: options?.includeStaff
          ? ["product_id", "date", "staff_id"]
          : ["product_id", "date"],
      },
    },
    {
      name: "book_appointment",
      description:
        "Book an appointment after the customer confirms service, date/time, and contact details.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          product_id: { type: Type.STRING, description: "Service id." },
          starts_at: {
            type: Type.STRING,
            description:
              "Slot start from check_availability. Copy the ISO string exactly, including +07:00 (Asia/Jakarta).",
          },
          customer_name: { type: Type.STRING, description: "Customer full name." },
          customer_phone: { type: Type.STRING, description: "Customer phone number." },
          ...staffParams,
        },
        required: options?.includeStaff
          ? ["product_id", "starts_at", "customer_name", "staff_id"]
          : ["product_id", "starts_at", "customer_name"],
      },
    },
    {
      name: "cancel_appointment",
      description: "Cancel an appointment by id when the customer asks to cancel.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          appointment_id: { type: Type.STRING, description: "Appointment id." },
        },
        required: ["appointment_id"],
      },
    },
  ];

  if (options?.includeStaff) {
    declarations.unshift({
      name: "list_staff",
      description: "List doctors or staff who can take appointments, with specialty.",
      parameters: { type: Type.OBJECT, properties: {} },
    });
  }

  return [{ functionDeclarations: declarations }];
}

export function buildBookingToolMapping(options: {
  businessId: string;
  products: ProductInfo[];
  voiceSessionId?: string;
  staff?: Array<{ id: string; name: string; specialty: string }>;
}) {
  const includeStaff = (options.staff?.length ?? 0) > 0;

  return {
    list_staff: () => ({
      staff: (options.staff ?? []).map((person) => ({
        id: person.id,
        name: person.name,
        specialty: person.specialty,
      })),
    }),
    list_treatments: () => ({
      treatments: options.products.map((product) => ({
        id: product.id,
        name: product.name,
        price: effectivePrice(product.price, product.discount_percent),
        duration_min: product.duration_min ?? 30,
        category: product.category,
        description: product.description,
      })),
    }),
    check_availability: async (args: Record<string, unknown>) => {
      try {
        const staffId = includeStaff ? String(args.staff_id ?? "") : undefined;
        if (includeStaff && !staffId) {
          return { error: "Choose a doctor first." };
        }
        const slots = await getAvailableSlots({
          businessId: options.businessId,
          productId: String(args.product_id ?? ""),
          date: String(args.date ?? ""),
          staffId,
        });
        return { slots };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Could not check availability." };
      }
    },
    book_appointment: async (args: Record<string, unknown>) => {
      try {
        const staffId = includeStaff ? String(args.staff_id ?? "") : undefined;
        if (includeStaff && !staffId) {
          return { error: "Choose a doctor first." };
        }
        const appointment = await createAppointment({
          businessId: options.businessId,
          productId: String(args.product_id ?? ""),
          customerName: String(args.customer_name ?? ""),
          customerPhone: String(args.customer_phone ?? ""),
          startsAt: String(args.starts_at ?? ""),
          voiceSessionId: options.voiceSessionId,
          staffId,
        });
        return { success: true, appointment };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not book appointment.";
        // The tool args carry customer name/phone — log identities, not the payload.
        log.warn({ err: error, businessId: options.businessId }, "booking.create_failed");
        return { error: message };
      }
    },
    cancel_appointment: async (args: Record<string, unknown>) => {
      try {
        const appointment = await cancelAppointment(
          options.businessId,
          String(args.appointment_id ?? ""),
        );
        return { success: true, appointment };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Could not cancel appointment." };
      }
    },
  };
}
