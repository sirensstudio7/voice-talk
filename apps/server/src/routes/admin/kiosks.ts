import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { nonEmptyString, optionalString } from "../../http/validation.js";
import { t, type Elysia } from "elysia";

export const kioskCreateBody = t.Object({
  name: optionalString,
  slug: optionalString,
  pin: nonEmptyString,
});

export const kioskUpdateBody = t.Object({
  name: optionalString,
  pin: optionalString,
});

export async function registerAdminKioskRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/kiosks", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const { listKioskDisplays } = await import("../../services/kiosk-displays.js");
      return listKioskDisplays(businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/kiosks", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body;
      const { createKioskDisplay } = await import("../../services/kiosk-displays.js");
      const created = await createKioskDisplay(businessId, {
        name: body.name,
        slug: body.slug,
        pin: body.pin,
      });
      return request.status(201, created);
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  }, {
    body: kioskCreateBody,
  });

  app.patch("/admin/businesses/:businessId/kiosks/:displayId", async (request) => {
    try {
      const { businessId, displayId } = request.params as { businessId: string; displayId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body;
      const { updateKioskDisplay } = await import("../../services/kiosk-displays.js");
      return updateKioskDisplay(businessId, displayId, body);
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  }, {
    body: kioskUpdateBody,
  });

  app.delete("/admin/businesses/:businessId/kiosks/:displayId", async (request) => {
    try {
      const { businessId, displayId } = request.params as { businessId: string; displayId: string };
      await requireBusinessAccess(request, businessId);
      const { deleteKioskDisplay } = await import("../../services/kiosk-displays.js");
      await deleteKioskDisplay(businessId, displayId);
      return request.status(204);
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/kiosks/:displayId/release", async (request) => {
    try {
      const { businessId, displayId } = request.params as { businessId: string; displayId: string };
      await requireBusinessAccess(request, businessId);
      const { forceReleaseKioskDisplay } = await import("../../services/kiosk-displays.js");
      const updated = await forceReleaseKioskDisplay(businessId, displayId);
      return updated;
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      return sendAuthError(request, err);
    }
  });
}
