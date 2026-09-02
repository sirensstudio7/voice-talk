import { z } from "zod";

export const AppointmentSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  treatment_name: z.string(),
  customer_name: z.string(),
  customer_phone: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export type Appointment = z.infer<typeof AppointmentSchema>;
export const AppointmentListSchema = z.array(AppointmentSchema);

export const BusinessHourSchema = z.object({
  day_of_week: z.number(),
  open_time: z.string(),
  close_time: z.string(),
  is_closed: z.boolean(),
});

export type BusinessHour = z.infer<typeof BusinessHourSchema>;
export const BusinessHourListSchema = z.array(BusinessHourSchema);

export const AvailableSlotSchema = z.string();
export type AvailableSlot = z.infer<typeof AvailableSlotSchema>;
export const AvailableSlotListSchema = z.array(AvailableSlotSchema);
