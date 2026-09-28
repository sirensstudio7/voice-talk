import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { cancelAppointment, listAppointments, listBusinessHours, saveBusinessHours, type BusinessHourInput } from "../../services/appointments.js";
import { assertBookingAddon, bookingSettingsOut, createService, createStaff, deleteService, deleteStaff, getOrCreateBookingSettings, listServices, listStaff, listStaffHours, saveStaffHours, updateBookingSettings, updateService, updateStaff } from "../../services/booking.js";
import type { Elysia } from "elysia";

export async function registerAdminBookingRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/appointments", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const { date } = request.query as { date?: string };
      return listAppointments(businessId, date);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/appointments/:appointmentId/cancel", async (request) => {
    try {
      const { businessId, appointmentId } = request.params as {
        businessId: string;
        appointmentId: string;
      };
      await requireBusinessAccess(request, businessId);
      return cancelAppointment(businessId, appointmentId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/schedule", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return listBusinessHours(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.put("/admin/businesses/:businessId/schedule", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body as { hours: BusinessHourInput[] };
      return saveBusinessHours(businessId, body.hours ?? []);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/booking/settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const settings = await getOrCreateBookingSettings(businessId);
      return bookingSettingsOut(settings);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/booking/settings", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const body = request.body as { enabled?: boolean };
      if (typeof body.enabled !== "boolean") {
        return request.status(400, { detail: "enabled boolean is required" });
      }
      const settings = await updateBookingSettings(businessId, { enabled: body.enabled }, business.slug);
      return bookingSettingsOut(settings);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/booking/staff", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      return listStaff(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/booking/staff", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const body = request.body as {
        name?: string;
        specialty?: string;
        photo_url?: string;
        hours?: BusinessHourInput[];
      };
      const staff = await createStaff(businessId, {
        name: String(body.name ?? ""),
        specialty: body.specialty,
        photo_url: body.photo_url,
        hours: body.hours,
      });
      return request.status(201, staff);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/booking/staff/:staffId", async (request) => {
    try {
      const { businessId, staffId } = request.params as { businessId: string; staffId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const body = request.body as {
        name?: string;
        specialty?: string;
        photo_url?: string;
        is_active?: boolean;
        sort_order?: number;
      };
      return updateStaff(businessId, staffId, body);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.delete("/admin/businesses/:businessId/booking/staff/:staffId", async (request) => {
    try {
      const { businessId, staffId } = request.params as { businessId: string; staffId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      return deleteStaff(businessId, staffId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/booking/staff/:staffId/hours", async (request) => {
    try {
      const { businessId, staffId } = request.params as { businessId: string; staffId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      return listStaffHours(businessId, staffId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.put("/admin/businesses/:businessId/booking/staff/:staffId/hours", async (request) => {
    try {
      const { businessId, staffId } = request.params as { businessId: string; staffId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const body = request.body as { hours: BusinessHourInput[] };
      return saveStaffHours(businessId, staffId, body.hours ?? []);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/booking/services", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      return listServices(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/booking/services", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const body = request.body as {
        name?: string;
        duration_min?: number;
        price?: number;
        description?: string;
      };
      const service = await createService(businessId, {
        name: String(body.name ?? ""),
        duration_min: body.duration_min,
        price: body.price,
        description: body.description,
      });
      return request.status(201, service);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.patch("/admin/businesses/:businessId/booking/services/:serviceId", async (request) => {
    try {
      const { businessId, serviceId } = request.params as {
        businessId: string;
        serviceId: string;
      };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const body = request.body as {
        name?: string;
        duration_min?: number;
        price?: number;
        description?: string;
        is_active?: boolean;
      };
      return updateService(businessId, serviceId, body);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.delete("/admin/businesses/:businessId/booking/services/:serviceId", async (request) => {
    try {
      const { businessId, serviceId } = request.params as {
        businessId: string;
        serviceId: string;
      };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      return deleteService(businessId, serviceId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
