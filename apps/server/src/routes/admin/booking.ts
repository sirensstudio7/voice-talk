import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { cancelAppointment, listAppointments, listBusinessHours, saveBusinessHours } from "../../services/appointments.js";
import { assertBookingAddon, bookingSettingsOut, createService, createStaff, deleteService, deleteStaff, getOrCreateBookingSettings, listServices, listStaff, listStaffHours, saveStaffHours, updateBookingSettings, updateService, updateStaff } from "../../services/booking.js";
import { optionalBoolean, optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

const businessHour = t.Object({
  day_of_week: t.Number({ minimum: 0, maximum: 6 }),
  open_time: t.String(),
  close_time: t.String(),
  is_closed: t.Boolean(),
});

export const businessHoursBody = t.Object({
  hours: t.Optional(t.Array(businessHour)),
});

export const bookingSettingsBody = t.Object({
  enabled: t.Boolean(),
});

export const staffCreateBody = t.Object({
  name: optionalString,
  specialty: optionalString,
  photo_url: optionalString,
  hours: t.Optional(t.Array(businessHour)),
});

export const staffUpdateBody = t.Object({
  name: optionalString,
  specialty: optionalString,
  photo_url: optionalString,
  is_active: optionalBoolean,
  sort_order: t.Optional(t.Number()),
});

export const serviceCreateBody = t.Object({
  name: optionalString,
  duration_min: t.Optional(t.Number()),
  price: t.Optional(t.Number()),
  description: optionalString,
});

export const serviceUpdateBody = t.Object({
  name: optionalString,
  duration_min: t.Optional(t.Number()),
  price: t.Optional(t.Number()),
  description: optionalString,
  is_active: optionalBoolean,
});

export async function registerAdminBookingRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/appointments", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const { date } = request.query;
      return listAppointments(businessId, date);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    query: t.Object({ date: optionalString }),
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
      const body = request.body;
      return saveBusinessHours(businessId, body.hours ?? []);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: businessHoursBody,
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
      const body = request.body;
      const settings = await updateBookingSettings(businessId, { enabled: body.enabled }, business.slug);
      return bookingSettingsOut(settings);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: bookingSettingsBody,
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
      const body = request.body;
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
  }, {
    body: staffCreateBody,
  });

  app.patch("/admin/businesses/:businessId/booking/staff/:staffId", async (request) => {
    try {
      const { businessId, staffId } = request.params as { businessId: string; staffId: string };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const body = request.body;
      return updateStaff(businessId, staffId, body);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: staffUpdateBody,
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
      const body = request.body;
      return saveStaffHours(businessId, staffId, body.hours ?? []);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: businessHoursBody,
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
      const body = request.body;
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
  }, {
    body: serviceCreateBody,
  });

  app.patch("/admin/businesses/:businessId/booking/services/:serviceId", async (request) => {
    try {
      const { businessId, serviceId } = request.params as {
        businessId: string;
        serviceId: string;
      };
      await requireBusinessAccess(request, businessId);
      await assertBookingAddon(businessId);
      const body = request.body;
      return updateService(businessId, serviceId, body);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: serviceUpdateBody,
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
