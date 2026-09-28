import { t, type Elysia } from "elysia";
import { eq } from "drizzle-orm";
import {
  normalizeVoiceGender,
  normalizeVoicePreset,
} from "@voicetalk/shared";
import { db } from "../db/client.js";
import { demoRequests, orderItems } from "../db/schema.js";
import { env } from "../env.js";
import { getOrCreateVisionSettings } from "../services/vision-orchestrator.js";
import { visionSettingsOut } from "../services/vision-settings.js";
import {
  buildValidatedOrderSnapshot,
  OrderValidationError,
  persistConfirmedOrder,
} from "../services/order-persistence.js";
import { effectivePrice, serializeUtcDatetime } from "../services/pricing.js";
import {
  getActiveProducts,
  getSellableProducts,
  resolveAssistantName,
} from "../services/config-builder.js";
import { getBusinessBySlug, mapBusinessRow } from "../services/tenant.js";
import {
  createAppointment,
  getAvailableSlots,
} from "../services/appointments.js";
import {
  getLanguagePackPublicConfig,
  getSmartPhotoMomentPublicConfig,
} from "../services/addon-entitlement.js";
import { getLuckySpinPublicConfig } from "../services/lucky-spin.js";
import { getCampaignBannerPublicConfig } from "../services/campaign-banner.js";
import { resolveCapabilities } from "../services/capabilities.js";
import { getBookingPublicConfig } from "../services/booking.js";
import {
  completePhotoSession,
  markPhotoOfferResponse,
  resolvePhotoDownload,
  startPhotoSession,
  trackAnalyticsEvent,
  uploadPhotoSessionImage,
} from "../services/photo-moment.js";
import { MAX_PHOTO_UPLOAD_BYTES } from "../storage/index.js";
import { readUploadedFile } from "../http/multipart.js";
import { nonEmptyString, numberLike, optionalString } from "../http/validation.js";

export const kioskUnlockBody = t.Object({
  business: optionalString,
  kiosk: optionalString,
  pin: optionalString,
});

export const kioskReleaseBody = t.Object({
  business: optionalString,
  kiosk: optionalString,
  token: optionalString,
});

export const orderConfirmBody = t.Object({
  items: t.Array(
    t.Object({
      product_id: nonEmptyString,
      quantity: t.Number(),
    }),
  ),
});

export const appointmentCreateBody = t.Object({
  product_id: optionalString,
  customer_name: optionalString,
  customer_phone: optionalString,
  starts_at: optionalString,
  staff_id: optionalString,
});

export const demoRequestBody = t.Object({
  email: optionalString,
  phone: optionalString,
  company_name: optionalString,
  city: optionalString,
  country: optionalString,
  business_industry: optionalString,
  branch_total: t.Optional(numberLike),
  preferred_date: optionalString,
  preferred_time: optionalString,
});

export const photoSessionStartBody = t.Object({
  businessId: optionalString,
  slug: optionalString,
  orderId: optionalString,
});

export const photoSessionResponseBody = t.Object({
  response: optionalString,
});

export const photoEventBody = t.Object({
  businessId: optionalString,
  slug: optionalString,
  eventName: optionalString,
  photoSessionId: optionalString,
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});

function orderToOut(order: {
  id: string;
  status: string;
  total: number;
  customerName: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerNotes?: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
  }>;
}) {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    customer_name: order.customerName,
    customer_phone: order.customerPhone?.trim() || null,
    customer_address: order.customerAddress?.trim() || null,
    customer_notes: order.customerNotes?.trim() || null,
    created_at: serializeUtcDatetime(order.createdAt),
    confirmed_at: order.confirmedAt ? serializeUtcDatetime(order.confirmedAt) : null,
    items: order.items.map((item) => ({
      product_id: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: Math.round(item.price * item.quantity * 100) / 100,
    })),
  };
}

export { orderToOut };

export async function registerPublicRoutes(app: Elysia): Promise<void> {
  app.post("/public/kiosks/unlock", async (request) => {
    const body = request.body;
    const business = body.business?.trim() ?? "";
    const pin = body.pin ?? "";
    if (!business || !pin) {
      return request.status(400, { detail: "business and pin are required." });
    }
    const { checkKioskUnlockRateLimit, unlockKioskDisplay } = await import(
      "../services/kiosk-displays.js"
    );
    const forwardedFor = (request.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
    const clientIp =
      forwardedFor || request.server?.requestIP(request.request)?.address || "unknown";
    const key = `${clientIp}:${business}`;
    if (!(await checkKioskUnlockRateLimit(key))) {
      return request.status(429, { detail: "Too many PIN attempts. Try again later." });
    }
    try {
      return await unlockKioskDisplay({
        businessSlug: business,
        kioskSlug: body.kiosk,
        pin,
      });
    } catch (err) {
      const status =
        err instanceof Error && "statusCode" in err
          ? (err as Error & { statusCode: number }).statusCode
          : 500;
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Unlock failed.",
      });
    }
  }, {
    body: kioskUnlockBody,
  });

  app.post("/public/kiosks/release", async (request) => {
    const body = request.body;
    const business = body.business?.trim() ?? "";
    const authHeader = request.headers.authorization ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const token = (body.token ?? bearer).trim();
    if (!business || !token) {
      return request.status(400, { detail: "business and token are required." });
    }
    const { releaseKioskDisplayByToken } = await import("../services/kiosk-displays.js");
    try {
      await releaseKioskDisplayByToken({
        businessSlug: business,
        kioskSlug: body.kiosk,
        token,
      });
      return request.status(204);
    } catch (err) {
      const status =
        err instanceof Error && "statusCode" in err
          ? (err as Error & { statusCode: number }).statusCode
          : 500;
      return request.status(status, {
        detail: err instanceof Error ? err.message : "Release failed.",
      });
    }
  }, {
    body: kioskReleaseBody,
  });

  app.get("/businesses/:slug", async (request) => {
    const { slug } = request.params as { slug: string };
    const business = await getBusinessBySlug(slug);
    if (!business) return request.status(404, { detail: "Business not found" });
    return mapBusinessRow(business);
  });

  app.get("/businesses/:slug/payment", async (request) => {
    const { slug } = request.params as { slug: string };
    const business = await getBusinessBySlug(slug);
    if (!business) return request.status(404, { detail: "Business not found" });
    return { payment_qr_url: business.paymentQrUrl || "" };
  });

  app.post("/businesses/:slug/orders/confirm", async (request) => {
    const { slug } = request.params as { slug: string };
    const body = request.body;
    const business = await getBusinessBySlug(slug);
    if (!business) return request.status(404, { detail: "Business not found" });

    const { capabilities } = await resolveCapabilities(business);
    if (!capabilities.ordering_enabled) {
      return request.status(403, { detail: "Ordering is not enabled for this business." });
    }

    try {
      const snapshot = buildValidatedOrderSnapshot(
        getSellableProducts(business),
        body.items.map((i) => ({ productId: i.product_id, quantity: i.quantity })),
      );
      const order = await persistConfirmedOrder(business.id, null, snapshot);
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      return orderToOut({ ...order, items });
    } catch (exc) {
      if (exc instanceof OrderValidationError) {
        return request.status(400, { detail: exc.detail });
      }
      throw exc;
    }
  }, {
    body: orderConfirmBody,
  });

  app.get("/menu", async (request) => {
    const query = request.query as { business?: string };
    const slug = query.business || env.DEFAULT_BUSINESS_SLUG;
    const tenant = await getBusinessBySlug(slug);
    if (!tenant) return request.status(404, { detail: "Business not found" });

    const { capabilities } = await resolveCapabilities(tenant);
    const productList = capabilities.menu_enabled ? getActiveProducts(tenant) : [];
    const vision = await getOrCreateVisionSettings(tenant.id);
    const smartPhotoMoment = await getSmartPhotoMomentPublicConfig(tenant.id);
    const luckySpin = await getLuckySpinPublicConfig(tenant.id);
    const campaignBanner = await getCampaignBannerPublicConfig(tenant.id);
    const languagePack = await getLanguagePackPublicConfig(tenant.id);
    const booking = await getBookingPublicConfig(tenant.id);
    return {
      business: tenant.name,
      slug: tenant.slug,
      tagline: tenant.tagline,
      business_type: tenant.businessType,
      assistant_name: resolveAssistantName(tenant.aiRules),
      avatar_url: tenant.aiRules?.avatarUrl || "",
      avatar_model_path: tenant.aiRules?.avatarModelPath || "",
      background_url: tenant.backgroundUrl || "",
      gradient_color: tenant.gradientColor || "",
      display_orientation: tenant.displayOrientation || "landscape",
      kiosk_ui_mode: tenant.kioskUiMode === "studio" ? "studio" : "classic",
      voice_preset: normalizeVoicePreset(tenant.aiRules?.voicePreset),
      voice_gender: normalizeVoiceGender(tenant.aiRules?.voiceGender),
      capabilities,
      vision: visionSettingsOut(vision),
      smart_photo_moment: smartPhotoMoment,
      lucky_spin: luckySpin,
      campaign_banner: campaignBanner,
      languages: languagePack,
      booking,
      products: productList.map((p) => ({
        id: p.productId,
        name: p.name,
        price: effectivePrice(p.price, p.discountPercent),
        original_price: p.discountPercent > 0 ? p.price : null,
        discount_percent: p.discountPercent,
        category: p.category,
        description: p.description,
        image_url: p.imageUrl,
        duration_min: p.durationMin,
      })),
    };
  });

  app.get("/businesses/:slug/availability", async (request) => {
    const { slug } = request.params as { slug: string };
    const { product_id: productId, date, staff_id: staffId } = request.query as {
      product_id?: string;
      date?: string;
      staff_id?: string;
    };
    const business = await getBusinessBySlug(slug);
    if (!business) return request.status(404, { detail: "Business not found" });
    if (!productId || !date) {
      return request.status(400, { detail: "product_id and date are required." });
    }

    const { capabilities } = await resolveCapabilities(business);
    if (!capabilities.booking_enabled) {
      return request.status(403, { detail: "Booking is not enabled for this business." });
    }

    try {
      const slots = await getAvailableSlots({
        businessId: business.id,
        productId,
        date,
        staffId,
      });
      return { slots };
    } catch (error) {
      return request.status(400, {
        detail: error instanceof Error ? error.message : "Could not load availability.",
      });
    }
  });

  app.post("/businesses/:slug/appointments", async (request) => {
    const { slug } = request.params as { slug: string };
    const body = request.body;
    const business = await getBusinessBySlug(slug);
    if (!business) return request.status(404, { detail: "Business not found" });

    const { capabilities } = await resolveCapabilities(business);
    if (!capabilities.booking_enabled) {
      return request.status(403, { detail: "Booking is not enabled for this business." });
    }

    try {
      const appointment = await createAppointment({
        businessId: business.id,
        productId: String(body.product_id ?? ""),
        customerName: String(body.customer_name ?? ""),
        customerPhone: String(body.customer_phone ?? ""),
        startsAt: String(body.starts_at ?? ""),
        staffId: body.staff_id ? String(body.staff_id) : null,
      });
      return request.status(201, appointment);
    } catch (error) {
      return request.status(400, {
        detail: error instanceof Error ? error.message : "Could not create appointment.",
      });
    }
  }, {
    body: appointmentCreateBody,
  });

  app.post("/public/demo-requests", async (request) => {
    const body = request.body;

    const email = body.email?.toLowerCase().trim() ?? "";
    const phone = body.phone?.trim() ?? "";
    const companyName = body.company_name?.trim() ?? "";
    const city = body.city?.trim() ?? "";
    const country = body.country?.trim() ?? "";
    const businessIndustry = body.business_industry?.trim() ?? "";
    const branchTotal = Number(body.branch_total);
    const preferredDateRaw = body.preferred_date?.trim() ?? "";
    const preferredTime = body.preferred_time?.trim() ?? "";

    if (
      !email ||
      !phone ||
      !companyName ||
      !city ||
      !country ||
      !businessIndustry ||
      !preferredDateRaw ||
      !preferredTime
    ) {
      return request.status(400, { detail: "All fields are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return request.status(400, { detail: "Enter a valid email address." });
    }
    if (phone.length < 6 || phone.length > 40) {
      return request.status(400, { detail: "Enter a valid phone number." });
    }
    if (!Number.isInteger(branchTotal) || branchTotal < 1) {
      return request.status(400, { detail: "Branch total must be a whole number of at least 1." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDateRaw)) {
      return request.status(400, { detail: "Enter a valid preferred date." });
    }
    const preferredDate = new Date(`${preferredDateRaw}T12:00:00.000Z`);
    if (Number.isNaN(preferredDate.getTime())) {
      return request.status(400, { detail: "Enter a valid preferred date." });
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (preferredDateRaw < todayStr) {
      return request.status(400, { detail: "Preferred date must be today or later." });
    }
    if (!/^\d{2}:\d{2}$/.test(preferredTime)) {
      return request.status(400, { detail: "Enter a valid preferred time." });
    }
    if (
      companyName.length > 255 ||
      city.length > 120 ||
      country.length > 120 ||
      businessIndustry.length > 100 ||
      email.length > 255 ||
      preferredTime.length > 10
    ) {
      return request.status(400, { detail: "One or more fields are too long." });
    }

    const [created] = await db
      .insert(demoRequests)
      .values({
        email,
        phone,
        companyName,
        city,
        country,
        businessIndustry,
        branchTotal,
        preferredDate,
        preferredTime,
        status: "new",
      })
      .returning({ id: demoRequests.id, status: demoRequests.status });

    return request.status(201, { id: created!.id, status: created!.status });
  }, {
    body: demoRequestBody,
  });

  app.post("/public/photo/session/start", async (request) => {
    const body = request.body;

    let businessId = body.businessId?.trim() ?? "";
    if (!businessId && body.slug) {
      const business = await getBusinessBySlug(body.slug);
      if (!business) return request.status(404, { detail: "Business not found" });
      businessId = business.id;
    }
    if (!businessId) {
      return request.status(400, { detail: "businessId or slug is required" });
    }

    try {
      const session = await startPhotoSession({
        businessId,
        orderId: body.orderId ?? null,
      });
      await trackAnalyticsEvent({
        businessId,
        eventName: "photo_offer_shown",
        photoSessionId: session.id,
      });
      return { sessionId: session.id };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      throw err;
    }
  }, {
    body: photoSessionStartBody,
  });

  app.post("/public/photo/session/:id/response", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body;
    const response = body.response?.trim().toLowerCase();
    if (response !== "yes" && response !== "no" && response !== "timeout") {
      return request.status(400, { detail: "response must be yes, no, or timeout" });
    }
    await markPhotoOfferResponse(id, response);
    return { ok: true };
  }, {
    body: photoSessionResponseBody,
  });

  app.post("/public/photo/session/:id/upload", async (request) => {
    const { id } = request.params as { id: string };
    const data = readUploadedFile(request.body);
    if (!data) return request.status(400, { detail: "No file uploaded." });

    const buffer = await data.toBuffer();
    if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
    if (buffer.length > MAX_PHOTO_UPLOAD_BYTES) {
      return request.status(400, { detail: "Photo must be 8 MB or smaller." });
    }

    try {
      const result = await uploadPhotoSessionImage(id, buffer);
      return { photoPath: result.photoPath, ok: true };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      throw err;
    }
  });

  app.post("/public/photo/session/:id/complete", async (request) => {
    const { id } = request.params as { id: string };
    try {
      const result = await completePhotoSession(id);
      return {
        qrToken: result.qrToken,
        downloadUrl: result.downloadUrl,
        expiresAt: result.expiresAt,
      };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      throw err;
    }
  });

  app.get("/public/photo/download/:token", async (request) => {
    const { token } = request.params as { token: string };
    const query = request.query as { redirect?: string };
    try {
      const result = await resolvePhotoDownload(token);
      if (query.redirect === "1") {
        return request.redirect(result.url);
      }
      return result;
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return request.status((err as Error & { statusCode: number }).statusCode, {
          detail: err.message,
        });
      }
      throw err;
    }
  });

  app.post("/public/photo/events", async (request) => {
    const body = request.body;

    let businessId = body.businessId?.trim() ?? "";
    if (!businessId && body.slug) {
      const business = await getBusinessBySlug(body.slug);
      if (!business) return request.status(404, { detail: "Business not found" });
      businessId = business.id;
    }
    if (!businessId || !body.eventName) {
      return request.status(400, { detail: "businessId/slug and eventName are required" });
    }

    await trackAnalyticsEvent({
      businessId,
      eventName: body.eventName,
      photoSessionId: body.photoSessionId,
      metadata: body.metadata,
    });
    return { ok: true };
  }, {
    body: photoEventBody,
  });
}
