import { t, type Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { businessOut, clearBusinessAccessCache, getAuthUserId, getCurrentUser, requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { aiRules, businesses, businessMembers } from "../../db/schema.js";
import { nonEmptyString, optionalBoolean, optionalString } from "../../http/validation.js";
import { deleteBusinessAsOwner } from "../../services/delete-business.js";
import { assertCanCreateWorkspace } from "../../services/entitlement.js";
import { buildOnboardingAiRules, DEFAULT_ASSISTANT_AVATAR_MODEL, DEFAULT_ASSISTANT_NAME, DEFAULT_VOICE_GENDER, DEFAULT_VOICE_PRESET, defaultAiRulesValues, isValidSlug, slugSuggestions } from "../../services/onboarding.js";
import { listBusinessesForUser } from "../../services/user-businesses.js";
import { ALLOWED_IMAGE_TYPES, deleteFromStorage, MAX_UPLOAD_BYTES, uploadToStorage } from "../../storage/index.js";
import { readUploadedFile } from "../../http/multipart.js";
import { aiRulesOut } from "./shared.js";

export const businessCreateBody = t.Object({
  slug: nonEmptyString,
  name: nonEmptyString,
  tagline: optionalString,
  voice_name: optionalString,
  gemini_model: optionalString,
});

export const businessOnboardingBody = t.Object({
  business_type: t.Union([
    t.Literal("restaurant"),
    t.Literal("cafe"),
    t.Literal("retail"),
    t.Literal("salon"),
    t.Literal("clinic"),
    t.Literal("other"),
  ]),
  primary_use_case: t.Union([
    t.Literal("orders"),
    t.Literal("faqs"),
    t.Literal("both"),
    t.Literal("appointments"),
  ]),
  language: t.Optional(t.Union([t.Literal("id"), t.Literal("en")])),
});

export const businessUpdateBody = t.Object({
  name: optionalString,
  tagline: optionalString,
  voice_name: optionalString,
  gemini_model: optionalString,
  is_active: optionalBoolean,
});

export async function registerAdminBusinessRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses", async (request) => {
    try {
      const userId = getAuthUserId(request);
      return listBusinessesForUser(userId);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/check-slug", async (request) => {
    try {
      await getCurrentUser(request);
      const { slug: rawSlug } = request.query;
      const slug = rawSlug?.toLowerCase().trim() ?? "";

      if (!isValidSlug(slug)) {
        return request.status(400, { detail: "Invalid slug format." });
      }

      const existing = await db.query.businesses.findFirst({ where: eq(businesses.slug, slug) });
      if (existing) {
        return { available: false, suggestions: slugSuggestions(slug) };
      }
      return { available: true };
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    query: t.Object({ slug: optionalString }),
  });

  app.post("/admin/businesses", async (request) => {
    try {
      const user = await getCurrentUser(request);
      try {
        await assertCanCreateWorkspace(user.id);
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return request.status((err as Error & { statusCode: number }).statusCode, {
            detail: err.message,
          });
        }
        throw err;
      }
      const body = request.body;
      const slug = body.slug.toLowerCase().trim();
      if (!isValidSlug(slug)) {
        return request.status(400, { detail: "Invalid slug format." });
      }
      const existing = await db.query.businesses.findFirst({ where: eq(businesses.slug, slug) });
      if (existing) return request.status(400, { detail: "Slug already exists" });

      const [business] = await db
        .insert(businesses)
        .values({
          slug,
          name: body.name,
          tagline: body.tagline ?? "",
          voiceName: body.voice_name ?? "Aoede",
          geminiModel: body.gemini_model ?? "gemini-3.1-flash-live-preview",
        })
        .returning();

      await db.insert(businessMembers).values({
        userId: user.id,
        businessId: business!.id,
        role: "owner",
      });
      await db.insert(aiRules).values(
        defaultAiRulesValues({
          businessId: business!.id,
          businessName: String(body.name ?? business!.name),
          language: "en",
          primaryUseCase: "both",
          businessType: "other",
        }),
      );
      const { ensureDefaultKioskDisplay } = await import("../../services/kiosk-displays.js");
      await ensureDefaultKioskDisplay(business!.id);

      return request.status(201, businessOut(business!));
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: businessCreateBody,
  });

  app.patch("/admin/businesses/:businessId/onboarding", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body;

      const businessUpdates: Partial<typeof businesses.$inferInsert> = {
        businessType: body.business_type,
        primaryUseCase: body.primary_use_case,
        onboardingCompleted: true,
      };

      const aiConfig = buildOnboardingAiRules({
        businessName: business.name,
        businessType: body.business_type,
        primaryUseCase: body.primary_use_case,
        language: body.language,
      });

      await db.update(businesses).set(businessUpdates).where(eq(businesses.id, businessId));

      let rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values({
            ...defaultAiRulesValues({
              businessId,
              businessName: business.name,
              language: aiConfig.language,
              primaryUseCase: body.primary_use_case,
              businessType: body.business_type,
            }),
            personality: aiConfig.personality,
            toolInstructions: aiConfig.toolInstructions,
          })
          .returning();
      } else {
        [rules] = await db
          .update(aiRules)
          .set({
            assistantName: DEFAULT_ASSISTANT_NAME,
            avatarModelPath: DEFAULT_ASSISTANT_AVATAR_MODEL,
            voiceGender: DEFAULT_VOICE_GENDER,
            voicePreset: DEFAULT_VOICE_PRESET,
            personality: aiConfig.personality,
            language: aiConfig.language,
            toolInstructions: aiConfig.toolInstructions,
          })
          .where(eq(aiRules.businessId, businessId))
          .returning();
      }

      const updatedBusiness = await db.query.businesses.findFirst({
        where: eq(businesses.id, businessId),
      });

      return {
        business: businessOut(updatedBusiness!),
        ai_rules: aiRulesOut(rules!),
      };
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: businessOnboardingBody,
  });

  app.patch("/admin/businesses/:businessId", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body;
      const updates: Partial<typeof businesses.$inferInsert> = {};
      if (body.name !== undefined) updates.name = String(body.name);
      if (body.tagline !== undefined) updates.tagline = String(body.tagline);
      if (body.voice_name !== undefined) updates.voiceName = String(body.voice_name);
      if (body.gemini_model !== undefined) updates.geminiModel = String(body.gemini_model);
      if (body.is_active !== undefined) updates.isActive = Boolean(body.is_active);

      const [updated] = await db
        .update(businesses)
        .set(updates)
        .where(eq(businesses.id, business.id))
        .returning();
      return businessOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: businessUpdateBody,
  });

  app.delete("/admin/businesses/:businessId", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const userId = getAuthUserId(request);
      await deleteBusinessAsOwner(userId, businessId);
      clearBusinessAccessCache(businessId);
      return request.status(204, );
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/payment", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      return { payment_qr_url: business.paymentQrUrl || "" };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/payment/qr", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const data = readUploadedFile(request.body);
      if (!data) return request.status(400, { detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return request.status(400, { detail: "Upload a PNG, JPG, WEBP, or GIF image for your payment QR code." });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return request.status(400, { detail: "QR image must be 5 MB or smaller." });
      }

      await deleteFromStorage("payment-qr", business.id);
      const url = await uploadToStorage(
        "payment-qr",
        `${business.id}/qr${extension}`,
        buffer,
        contentType,
      );

      const [updated] = await db
        .update(businesses)
        .set({ paymentQrUrl: url })
        .where(eq(businesses.id, business.id))
        .returning();
      return { payment_qr_url: updated!.paymentQrUrl };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.delete("/admin/businesses/:businessId/payment/qr", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      await deleteFromStorage("payment-qr", business.id);
      await db.update(businesses).set({ paymentQrUrl: "" }).where(eq(businesses.id, business.id));
      return { payment_qr_url: "" };
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
