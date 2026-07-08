import { Type } from "@google/genai";

import {
  cancelAppointment,
  createAppointment,
  getAvailableSlots,
} from "./appointments.js";
import { effectivePrice } from "./pricing.js";
import type { ProductInfo } from "./tools.js";

export function buildBookingToolDeclarations() {
  return [
    {
      functionDeclarations: [
        {
          name: "list_treatments",
          description: "List available salon treatments/services with price and duration.",
          parameters: { type: Type.OBJECT, properties: {} },
        },
        {
          name: "check_availability",
          description: "Check open appointment slots for a treatment on a given date (YYYY-MM-DD).",
          parameters: {
            type: Type.OBJECT,
            properties: {
              product_id: { type: Type.STRING, description: "Treatment id from list_treatments." },
              date: { type: Type.STRING, description: "Date in YYYY-MM-DD format." },
            },
            required: ["product_id", "date"],
          },
        },
        {
          name: "book_appointment",
          description:
            "Book an appointment after the customer confirms treatment, date/time, and contact details.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              product_id: { type: Type.STRING, description: "Treatment id." },
              starts_at: { type: Type.STRING, description: "ISO datetime for the slot start." },
              customer_name: { type: Type.STRING, description: "Customer full name." },
              customer_phone: { type: Type.STRING, description: "Customer phone number." },
            },
            required: ["product_id", "starts_at", "customer_name"],
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
      ],
    },
  ];
}

export function buildBookingToolMapping(options: {
  businessId: string;
  products: ProductInfo[];
  voiceSessionId?: string;
}) {
  return {
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
        const slots = await getAvailableSlots({
          businessId: options.businessId,
          productId: String(args.product_id ?? ""),
          date: String(args.date ?? ""),
        });
        return { slots };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Could not check availability." };
      }
    },
    book_appointment: async (args: Record<string, unknown>) => {
      try {
        const appointment = await createAppointment({
          businessId: options.businessId,
          productId: String(args.product_id ?? ""),
          customerName: String(args.customer_name ?? ""),
          customerPhone: String(args.customer_phone ?? ""),
          startsAt: String(args.starts_at ?? ""),
          voiceSessionId: options.voiceSessionId,
        });
        return { success: true, appointment };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Could not book appointment." };
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
