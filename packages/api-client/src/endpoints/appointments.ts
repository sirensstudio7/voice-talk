import type { HttpClient } from "../http";
import { AppointmentSchema, AppointmentListSchema, type Appointment, BusinessHourSchema, BusinessHourListSchema, type BusinessHour } from "../schemas/appointments";
import { z } from "zod";

export async function listAppointments(http: HttpClient, businessId: string, date?: string): Promise<Appointment[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const data = await http.get(`/admin/businesses/${businessId}/appointments${query}`);
  return AppointmentListSchema.parse(data);
}

export async function getSchedule(http: HttpClient, businessId: string): Promise<BusinessHour[]> {
  const data = await http.get(`/admin/businesses/${businessId}/schedule`);
  return BusinessHourListSchema.parse(data);
}

export async function saveSchedule(http: HttpClient, businessId: string, hours: BusinessHour[]): Promise<BusinessHour[]> {
  const data = await http.put(`/admin/businesses/${businessId}/schedule`, { hours });
  return BusinessHourListSchema.parse(data);
}

export async function getAvailableSlots(http: HttpClient, businessSlug: string, productId: string, date: string): Promise<string[]> {
  const params = new URLSearchParams({ product_id: productId, date });
  const data = await http.get(`/businesses/${encodeURIComponent(businessSlug)}/availability?${params.toString()}`);
  return (data as any).slots ?? [];
}

export async function bookAppointment(http: HttpClient, businessSlug: string, body: any): Promise<Appointment> {
  const data = await http.post(`/businesses/${encodeURIComponent(businessSlug)}/appointments`, body);
  return AppointmentSchema.parse(data);
}

export async function updateAppointmentStatus(http: HttpClient, businessId: string, appointmentId: string): Promise<Appointment> {
  const data = await http.patch(`/admin/businesses/${businessId}/appointments/${appointmentId}/cancel`);
  return AppointmentSchema.parse(data);
}
