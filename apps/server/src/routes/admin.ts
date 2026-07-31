import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { mergeTranscriptMessages, normalizeVoicePreset } from "@voicetalk/shared";
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  businessOut,
  clearBusinessAccessCache,
  clearUserCache,
  createAccessToken,
  getAuthUserId,
  getCurrentUser,
  hashPassword,
  requireBusinessAccess,
  sendAuthError,
  userOut,
  verifyPassword,
} from "../auth/jwt.js";
import { db } from "../db/client.js";
import {
  aiRules,
  addonRequests,
  addons,
  businesses,
  businessMembers,
  knowledgeEntries,
  orderItems,
  orders,
  plans,
  platformSettings,
  products,
  subscriptionRequests,
  transcriptMessages,
  users,
  voiceSessions,
  visionSettings,
} from "../db/schema.js";
import { deleteBusinessAsOwner } from "../services/delete-business.js";
import {
  createSubscriptionRequest,
  ensureTrialEntitlement,
  getEntitlementSnapshot,
  listPaidPlans,
  assertCanCreateWorkspace,
} from "../services/entitlement.js";
import { buildSystemInstruction, normalizeIdleTimeoutSeconds } from "../services/config-builder.js";
import {
  buildOnboardingAiRules,
  defaultAssistantPersonality,
  isValidSlug,
  slugSuggestions,
  type BusinessType,
  type OnboardingLanguage,
  type PrimaryUseCase,
} from "../services/onboarding.js";
import {
  cancelAppointment,
  listAppointments,
  listBusinessHours,
  saveBusinessHours,
  type BusinessHourInput,
} from "../services/appointments.js";
import {
  fetchBusinessStatsSummary,
  fetchStatsDaily,
  fetchStatsOverview,
  fetchStatsTopProducts,
} from "../services/business-stats.js";
import { serializeUtcDatetime } from "../services/pricing.js";
import { getBusinessWithRelations } from "../services/tenant.js";
import { listBusinessesForUser } from "../services/user-businesses.js";
import {
  DEFAULT_VISION_SETTINGS,
  normalizeAutoGoodbyeTimeoutSeconds,
  normalizeCooldownSeconds,
  normalizeDetectionDistanceM,
  normalizeGreetingDelaySeconds,
  normalizeGreetingTriggerMode,
  normalizeVisionSource,
  normalizeLostTimeoutSeconds,
  normalizeSilenceTimeoutSeconds,
  normalizeVisionScript,
  visionSettingsOut,
} from "../services/vision-settings.js";
import {
  broadcastVisionConfig,
  getOrCreateVisionSettings,
  getVisionHub,
  getVisionMetrics,
  refreshHubSettings,
} from "../services/vision-orchestrator.js";
import {
  ALLOWED_IMAGE_TYPES,
  deleteFromStorage,
  MAX_UPLOAD_BYTES,
  PHOTO_BRANDING_BUCKET,
  uploadToStorage,
} from "../storage/index.js";
import {
  createAddonRequest,
  getAddonStatusForBusiness,
  getOrCreatePhotoSettings,
  listAddons,
  photoSettingsOut,
  SMART_PHOTO_MOMENT_CODE,
} from "../services/addon-entitlement.js";
import {
  deletePhotoSession,
  getPhotoAnalytics,
  listPhotoGallery,
  updatePhotoSettings,
} from "../services/photo-moment.js";
import { orderToOut } from "./public.js";

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DISPLAY_ORIENTATIONS = new Set(["portrait", "landscape", "auto"]);

const ADDON_MONTHLY_IDR = 199_000;
const ADDON_DURATION_DISCOUNTS: Record<number, number> = {
  1: 0,
  3: 0.05,
  6: 0.1,
  12: 0.15,
};

/** Prefer checkout Amount in notes; otherwise derive from Duration. */
function amountLabelFromAddonNotes(notes: string): string {
  const explicit = notes.match(/Amount:\s*(.+)/i);
  if (explicit?.[1]?.trim()) return explicit[1].trim();

  const durationMatch = notes.match(/Duration:\s*(\d+)\s*month/i);
  const months = durationMatch ? Number(durationMatch[1]) : 0;
  if (!months) return "—";

  const discount = ADDON_DURATION_DISCOUNTS[months] ?? 0;
  const total = Math.round(ADDON_MONTHLY_IDR * months * (1 - discount));
  return `Rp${total.toLocaleString("id-ID")}`;
}

function normalizeGradientColor(value: string | undefined | null): string {
  if (value == null) return "";
  const cleaned = value.trim();
  if (!cleaned) return "";
  if (!HEX_COLOR_RE.test(cleaned)) {
    const err = new Error("Gradient color must be a hex value like #f1f5f9.") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }
  if (cleaned.length === 4) {
    return ("#" + [...cleaned.slice(1)].map((c) => c + c).join("")).toLowerCase();
  }
  return cleaned.toLowerCase();
}

function normalizeDisplayOrientation(value: string | undefined | null): string {
  if (value == null || !value.trim()) return "landscape";
  const cleaned = value.trim().toLowerCase();
  if (!DISPLAY_ORIENTATIONS.has(cleaned)) {
    const err = new Error("Display orientation must be portrait, landscape, or auto.") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }
  return cleaned;
}

function productOut(p: typeof products.$inferSelect) {
  return {
    id: p.id,
    product_id: p.productId,
    name: p.name,
    price: p.price,
    discount_percent: p.discountPercent,
    category: p.category,
    description: p.description,
    image_url: p.imageUrl,
    is_active: p.isActive,
    sort_order: p.sortOrder,
    duration_min: p.durationMin,
  };
}

function knowledgeOut(e: typeof knowledgeEntries.$inferSelect) {
  return {
    id: e.id,
    category: e.category,
    title: e.title ?? "",
    content: e.content,
    sort_order: e.sortOrder,
  };
}

function aiRulesOut(r: typeof aiRules.$inferSelect) {
  return {
    id: r.id,
    assistant_name: r.assistantName,
    avatar_url: r.avatarUrl || "",
    avatar_model_path: r.avatarModelPath || "",
    personality: r.personality,
    tone: r.tone,
    language: r.language,
    behavioral_rules: r.behavioralRules,
    tool_instructions: r.toolInstructions,
    idle_timeout_seconds: r.idleTimeoutSeconds,
    voice_preset: normalizeVoicePreset(r.voicePreset),
  };
}

function parseDateFilter(date: string, tzOffset?: number) {
  const day = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) {
    const err = new Error("Invalid date format. Use YYYY-MM-DD.") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  const offset = tzOffset ?? 0;
  const start = new Date(day.getTime() + offset * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function isRegistrationApprovalRequired(): Promise<boolean> {
  const row = await db.query.platformSettings.findFirst({
    where: eq(platformSettings.key, "require_registration_approval"),
  });
  return ["true", "1", "yes", "on"].includes((row?.value ?? "false").toLowerCase());
}

type ConversationSessionRow = typeof voiceSessions.$inferSelect;
type ConversationMessageRow = typeof transcriptMessages.$inferSelect;
type ConversationOrderRow = typeof orders.$inferSelect;

function buildConversationDetail(
  session: ConversationSessionRow,
  messages: ConversationMessageRow[],
  order: ConversationOrderRow | undefined,
) {
  const duration =
    session.endedAt != null
      ? Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
      : null;

  const mappedMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    created_at: serializeUtcDatetime(m.createdAt),
  }));
  const mergedMessages = mergeTranscriptMessages(mappedMessages);

  return {
    id: session.id,
    status: session.status,
    started_at: serializeUtcDatetime(session.startedAt),
    ended_at: session.endedAt ? serializeUtcDatetime(session.endedAt) : null,
    end_reason: session.endReason ?? null,
    duration_seconds: duration,
    message_count: mergedMessages.length,
    order_id: order?.id ?? null,
    order_total: order?.total ?? null,
    messages: mergedMessages,
  };
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/admin/auth/login", async (request, reply) => {
    const body = request.body as { email: string; password: string };
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase().trim()),
    });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.status(401).send({ detail: "Invalid credentials" });
    }
    if (user.status === "suspended") {
      return reply.status(403).send({
        detail: user.lastLoginAt
          ? "Account suspended"
          : "Your registration was not approved.",
      });
    }
    if (user.status === "pending") {
      return reply.status(403).send({ detail: "Your account is awaiting admin approval." });
    }
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return {
      access_token: createAccessToken(user.id),
      token_type: "bearer",
      user: userOut(user),
      businesses: await listBusinessesForUser(user.id),
    };
  });

  app.post("/admin/auth/signup", async (request, reply) => {
    const body = request.body as {
      email?: string;
      password?: string;
      name?: string;
      country?: string;
    };
    const email = body.email?.toLowerCase().trim() ?? "";
    const password = body.password ?? "";
    const country = (body.country ?? "").trim().toUpperCase().slice(0, 2);

    if (!email || !password) {
      return reply.status(400).send({ detail: "Email and password are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({ detail: "Enter a valid email address." });
    }
    if (password.length < 8) {
      return reply.status(400).send({ detail: "Password must be at least 8 characters." });
    }

    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      return reply.status(400).send({ detail: "Email already exists." });
    }

    const name = body.name?.trim() || email.split("@")[0] || "User";
    const approvalRequired = await isRegistrationApprovalRequired();
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        name,
        country: /^[A-Z]{2}$/.test(country) ? country : "",
        status: approvalRequired ? "pending" : "active",
      })
      .returning();

    if (!approvalRequired) {
      await ensureTrialEntitlement(user!.id);
    }

    if (approvalRequired) {
      return reply.status(201).send({
        status: "pending",
        message: "Your account is awaiting admin approval. You'll be able to sign in once approved.",
        user: userOut(user!),
      });
    }

    return reply.status(201).send({
      access_token: createAccessToken(user!.id),
      token_type: "bearer",
      user: userOut(user!),
    });
  });

  app.patch("/admin/auth/me", async (request, reply) => {
    try {
      const user = await getCurrentUser(request);
      const body = request.body as { country?: string };
      const country = (body.country ?? "").trim().toUpperCase().slice(0, 2);
      if (country && !/^[A-Z]{2}$/.test(country)) {
        return reply.status(400).send({ detail: "country must be a 2-letter ISO code." });
      }
      if (!country || user.country) {
        return userOut(user);
      }
      const [updated] = await db
        .update(users)
        .set({ country })
        .where(eq(users.id, user.id))
        .returning();
      clearUserCache(user.id);
      return userOut(updated!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/auth/me", async (request, reply) => {
    try {
      return userOut(await getCurrentUser(request));
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses", async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      return listBusinessesForUser(userId);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/check-slug", async (request, reply) => {
    try {
      await getCurrentUser(request);
      const { slug: rawSlug } = request.query as { slug?: string };
      const slug = rawSlug?.toLowerCase().trim() ?? "";

      if (!isValidSlug(slug)) {
        return reply.status(400).send({ detail: "Invalid slug format." });
      }

      const existing = await db.query.businesses.findFirst({ where: eq(businesses.slug, slug) });
      if (existing) {
        return { available: false, suggestions: slugSuggestions(slug) };
      }
      return { available: true };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses", async (request, reply) => {
    try {
      const user = await getCurrentUser(request);
      try {
        await assertCanCreateWorkspace(user.id);
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return reply.status((err as Error & { statusCode: number }).statusCode).send({
            detail: err.message,
          });
        }
        throw err;
      }
      const body = request.body as {
        slug: string;
        name: string;
        tagline?: string;
        voice_name?: string;
        gemini_model?: string;
      };
      const slug = body.slug.toLowerCase().trim();
      if (!isValidSlug(slug)) {
        return reply.status(400).send({ detail: "Invalid slug format." });
      }
      const existing = await db.query.businesses.findFirst({ where: eq(businesses.slug, slug) });
      if (existing) return reply.status(400).send({ detail: "Slug already exists" });

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
      await db.insert(aiRules).values({
        businessId: business!.id,
        assistantName: "Lorescale",
        personality: defaultAssistantPersonality({
          businessName: String(body.name ?? business!.name),
          language: "id",
          primaryUseCase: "both",
          businessType: "other",
          assistantName: "Lorescale",
        }),
        tone: "friendly",
      });

      return reply.status(201).send(businessOut(business!));
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/onboarding", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body as {
        business_type?: BusinessType;
        primary_use_case?: PrimaryUseCase;
        language?: OnboardingLanguage;
      };

      if (!body.business_type || !body.primary_use_case) {
        return reply.status(400).send({
          detail: "Business type and primary use case are required to complete onboarding.",
        });
      }

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
            businessId,
            assistantName: "Lorescale",
            personality: aiConfig.personality,
            tone: "friendly",
            language: aiConfig.language,
            toolInstructions: aiConfig.toolInstructions,
          })
          .returning();
      } else {
        [rules] = await db
          .update(aiRules)
          .set({
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
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body as Record<string, unknown>;
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
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const userId = getAuthUserId(request);
      await deleteBusinessAsOwner(userId, businessId);
      clearBusinessAccessCache(businessId);
      return reply.status(204).send();
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/payment", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      return { payment_qr_url: business.paymentQrUrl || "" };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/payment/qr", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const data = await request.file();
      if (!data) return reply.status(400).send({ detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return reply
          .status(400)
          .send({ detail: "Upload a PNG, JPG, WEBP, or GIF image for your payment QR code." });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return reply.status(400).send({ detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.status(400).send({ detail: "QR image must be 5 MB or smaller." });
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
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/payment/qr", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      await deleteFromStorage("payment-qr", business.id);
      await db.update(businesses).set({ paymentQrUrl: "" }).where(eq(businesses.id, business.id));
      return { payment_qr_url: "" };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/appearance", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      return {
        background_url: business.backgroundUrl || "",
        gradient_color: business.gradientColor || "",
        display_orientation: business.displayOrientation || "landscape",
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/appearance", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body as {
        gradient_color?: string | null;
        display_orientation?: string | null;
      };
      let gradientColor = business.gradientColor;
      let displayOrientation = business.displayOrientation;
      if (body.gradient_color !== undefined) {
        gradientColor = normalizeGradientColor(body.gradient_color);
      }
      if (body.display_orientation !== undefined) {
        displayOrientation = normalizeDisplayOrientation(body.display_orientation);
      }
      const [updated] = await db
        .update(businesses)
        .set({ gradientColor, displayOrientation })
        .where(eq(businesses.id, business.id))
        .returning();
      return {
        background_url: updated!.backgroundUrl || "",
        gradient_color: updated!.gradientColor || "",
        display_orientation: updated!.displayOrientation || "landscape",
      };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return reply.status((err as Error & { statusCode: number }).statusCode).send({
          detail: err.message,
        });
      }
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/appearance/background", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const data = await request.file();
      if (!data) return reply.status(400).send({ detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return reply.status(400).send({
          detail: "Upload a PNG, JPG, WEBP, or GIF image for the voice page background.",
        });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return reply.status(400).send({ detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.status(400).send({ detail: "Background image must be 5 MB or smaller." });
      }

      await deleteFromStorage("backgrounds", business.id);
      const url = await uploadToStorage(
        "backgrounds",
        `${business.id}/background${extension}`,
        buffer,
        contentType,
      );

      const [updated] = await db
        .update(businesses)
        .set({ backgroundUrl: url })
        .where(eq(businesses.id, business.id))
        .returning();
      return {
        background_url: updated!.backgroundUrl || "",
        gradient_color: updated!.gradientColor || "",
        display_orientation: updated!.displayOrientation || "landscape",
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/appearance/background", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);

      try {
        await deleteFromStorage("backgrounds", business.id);
      } catch (storageErr) {
        request.log.warn(
          { err: storageErr, businessId: business.id },
          "Background file delete failed; clearing database URL anyway",
        );
      }

      const [updated] = await db
        .update(businesses)
        .set({ backgroundUrl: "" })
        .where(eq(businesses.id, business.id))
        .returning();

      return {
        background_url: updated!.backgroundUrl || "",
        gradient_color: updated!.gradientColor || "",
        display_orientation: updated!.displayOrientation || "landscape",
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/products", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await db
        .select()
        .from(products)
        .where(eq(products.businessId, businessId))
        .orderBy(products.sortOrder, products.name);
      return rows.map(productOut);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/products", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body as Record<string, unknown>;
      const [product] = await db
        .insert(products)
        .values({
          businessId,
          productId: String(body.product_id),
          name: String(body.name),
          price: Number(body.price),
          discountPercent: Number(body.discount_percent ?? 0),
          category: String(body.category),
          description: String(body.description ?? ""),
          imageUrl: String(body.image_url ?? ""),
          isActive: body.is_active !== false,
          sortOrder: Number(body.sort_order ?? 0),
          durationMin: Number(body.duration_min ?? 30),
        })
        .returning();
      return reply.status(201).send(productOut(product!));
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/products/:productRowId", async (request, reply) => {
    try {
      const { businessId, productRowId } = request.params as {
        businessId: string;
        productRowId: string;
      };
      await requireBusinessAccess(request, businessId);
      const product = await db.query.products.findFirst({ where: eq(products.id, productRowId) });
      if (!product || product.businessId !== businessId) {
        return reply.status(404).send({ detail: "Product not found" });
      }
      const body = request.body as Record<string, unknown>;
      const updates: Partial<typeof products.$inferInsert> = {};
      if (body.product_id !== undefined) updates.productId = String(body.product_id);
      if (body.name !== undefined) updates.name = String(body.name);
      if (body.price !== undefined) updates.price = Number(body.price);
      if (body.discount_percent !== undefined) updates.discountPercent = Number(body.discount_percent);
      if (body.category !== undefined) updates.category = String(body.category);
      if (body.description !== undefined) updates.description = String(body.description);
      if (body.image_url !== undefined) updates.imageUrl = String(body.image_url);
      if (body.is_active !== undefined) updates.isActive = Boolean(body.is_active);
      if (body.sort_order !== undefined) updates.sortOrder = Number(body.sort_order);
      if (body.duration_min !== undefined) updates.durationMin = Number(body.duration_min);

      const [updated] = await db
        .update(products)
        .set(updates)
        .where(eq(products.id, productRowId))
        .returning();
      return productOut(updated!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/products/:productRowId", async (request, reply) => {
    try {
      const { businessId, productRowId } = request.params as {
        businessId: string;
        productRowId: string;
      };
      await requireBusinessAccess(request, businessId);
      const product = await db.query.products.findFirst({ where: eq(products.id, productRowId) });
      if (!product || product.businessId !== businessId) {
        return reply.status(404).send({ detail: "Product not found" });
      }
      await db.delete(products).where(eq(products.id, productRowId));
      return reply.status(204).send();
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/product-images", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const data = await request.file();
      if (!data) return reply.status(400).send({ detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return reply.status(400).send({ detail: "Upload a PNG, JPG, WEBP, or GIF image." });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return reply.status(400).send({ detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.status(400).send({ detail: "Image must be 5 MB or smaller." });
      }

      const filename = `${randomUUID().replace(/-/g, "")}${extension}`;
      const url = await uploadToStorage(
        "product-images",
        `${businessId}/${filename}`,
        buffer,
        contentType,
      );
      return reply.status(201).send({ image_url: url });
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/knowledge", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await db
        .select()
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.businessId, businessId))
        .orderBy(knowledgeEntries.sortOrder, knowledgeEntries.category);
      return rows.map(knowledgeOut);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/knowledge", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body as Record<string, unknown>;
      const [entry] = await db
        .insert(knowledgeEntries)
        .values({
          businessId,
          category: String(body.category ?? "General"),
          title: body.title !== undefined ? String(body.title).trim() || null : null,
          content: String(body.content),
          sortOrder: Number(body.sort_order ?? 0),
        })
        .returning();
      return reply.status(201).send(knowledgeOut(entry!));
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/knowledge/:entryId", async (request, reply) => {
    try {
      const { businessId, entryId } = request.params as { businessId: string; entryId: string };
      await requireBusinessAccess(request, businessId);
      const entry = await db.query.knowledgeEntries.findFirst({
        where: eq(knowledgeEntries.id, entryId),
      });
      if (!entry || entry.businessId !== businessId) {
        return reply.status(404).send({ detail: "Knowledge entry not found" });
      }
      const body = request.body as Record<string, unknown>;
      const updates: Partial<typeof knowledgeEntries.$inferInsert> = {};
      if (body.category !== undefined) updates.category = String(body.category);
      if (body.title !== undefined) updates.title = String(body.title).trim() || null;
      if (body.content !== undefined) updates.content = String(body.content);
      if (body.sort_order !== undefined) updates.sortOrder = Number(body.sort_order);

      const [updated] = await db
        .update(knowledgeEntries)
        .set(updates)
        .where(eq(knowledgeEntries.id, entryId))
        .returning();
      return knowledgeOut(updated!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/knowledge/:entryId", async (request, reply) => {
    try {
      const { businessId, entryId } = request.params as { businessId: string; entryId: string };
      await requireBusinessAccess(request, businessId);
      const entry = await db.query.knowledgeEntries.findFirst({
        where: eq(knowledgeEntries.id, entryId),
      });
      if (!entry || entry.businessId !== businessId) {
        return reply.status(404).send({ detail: "Knowledge entry not found" });
      }
      await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, entryId));
      return reply.status(204).send();
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/ai-rules", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      let rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values({
            businessId,
            assistantName: "Lorescale",
            personality: defaultAssistantPersonality({
              businessName: business.name,
              language: "id",
              primaryUseCase: business.primaryUseCase,
              businessType: business.businessType,
              assistantName: "Lorescale",
            }),
            tone: "friendly",
          })
          .returning();
      }
      return aiRulesOut(rules!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/ai-rules", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      let rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values({
            businessId,
            assistantName: "Lorescale",
            personality: defaultAssistantPersonality({
              businessName: business.name,
              language: "id",
              primaryUseCase: business.primaryUseCase,
              businessType: business.businessType,
              assistantName: "Lorescale",
            }),
            tone: "friendly",
          })
          .returning();
      }
      const body = request.body as Record<string, unknown>;
      const updates: Partial<typeof aiRules.$inferInsert> = {};
      if (body.assistant_name !== undefined) updates.assistantName = String(body.assistant_name);
      if (body.avatar_model_path !== undefined) {
        updates.avatarModelPath = String(body.avatar_model_path);
      }
      if (body.personality !== undefined) updates.personality = String(body.personality);
      if (body.tone !== undefined) updates.tone = String(body.tone);
      if (body.language !== undefined) updates.language = String(body.language);
      if (body.behavioral_rules !== undefined) updates.behavioralRules = String(body.behavioral_rules);
      if (body.tool_instructions !== undefined) updates.toolInstructions = String(body.tool_instructions);
      if (body.idle_timeout_seconds !== undefined) {
        updates.idleTimeoutSeconds = normalizeIdleTimeoutSeconds(body.idle_timeout_seconds);
      }
      if (body.voice_preset !== undefined) {
        updates.voicePreset = normalizeVoicePreset(body.voice_preset);
      }

      const [updated] = await db
        .update(aiRules)
        .set(updates)
        .where(eq(aiRules.id, rules!.id))
        .returning();
      return aiRulesOut(updated!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/ai-rules/avatar", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const data = await request.file();
      if (!data) return reply.status(400).send({ detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return reply.status(400).send({
          detail: "Upload a PNG, JPG, WEBP, or GIF image for the assistant avatar.",
        });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return reply.status(400).send({ detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.status(400).send({ detail: "Avatar image must be 5 MB or smaller." });
      }

      let rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values({
            businessId,
            assistantName: "Lorescale",
            personality: defaultAssistantPersonality({
              businessName: business.name,
              language: "id",
              primaryUseCase: business.primaryUseCase,
              businessType: business.businessType,
              assistantName: "Lorescale",
            }),
            tone: "friendly",
          })
          .returning();
      }

      await deleteFromStorage("assistant-avatars", business.id);
      const url = await uploadToStorage(
        "assistant-avatars",
        `${business.id}/avatar-${Date.now()}${extension}`,
        buffer,
        contentType,
      );

      const [updated] = await db
        .update(aiRules)
        .set({ avatarUrl: url })
        .where(eq(aiRules.id, rules!.id))
        .returning();
      return aiRulesOut(updated!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/ai-rules/avatar", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const rules = await db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) });
      if (!rules) {
        return reply.status(404).send({ detail: "AI rules not found." });
      }

      await deleteFromStorage("assistant-avatars", business.id);
      const [updated] = await db
        .update(aiRules)
        .set({ avatarUrl: "" })
        .where(eq(aiRules.id, rules.id))
        .returning();
      return aiRulesOut(updated!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/prompt-preview", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const business = await getBusinessWithRelations(businessId);
      if (!business) return reply.status(404).send({ detail: "Business not found" });
      return { system_instruction: buildSystemInstruction(business) };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/orders", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query as { date?: string; tz_offset?: string };
      let filterStart: Date | null = null;
      let filterEnd: Date | null = null;
      if (query.date) {
        const { start, end } = parseDateFilter(query.date, query.tz_offset ? Number(query.tz_offset) : 0);
        filterStart = start;
        filterEnd = end;
      }

      let rows = await db
        .select()
        .from(orders)
        .where(eq(orders.businessId, businessId))
        .orderBy(desc(orders.createdAt))
        .limit(200);

      if (filterStart && filterEnd) {
        rows = rows.filter((o) => o.createdAt >= filterStart! && o.createdAt < filterEnd!);
      }

      const orderIds = rows.map((order) => order.id);
      const itemsByOrderId = new Map<string, (typeof orderItems.$inferSelect)[]>();

      if (orderIds.length) {
        const items = await db
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds));
        for (const item of items) {
          const existing = itemsByOrderId.get(item.orderId) ?? [];
          existing.push(item);
          itemsByOrderId.set(item.orderId, existing);
        }
      }

      return rows.map((order) =>
        orderToOut({ ...order, items: itemsByOrderId.get(order.id) ?? [] }),
      );
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return reply.status((err as Error & { statusCode: number }).statusCode).send({
          detail: err.message,
        });
      }
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/conversations", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query as { date?: string; tz_offset?: string };
      let filterStart: Date | null = null;
      let filterEnd: Date | null = null;
      if (query.date) {
        const { start, end } = parseDateFilter(query.date, query.tz_offset ? Number(query.tz_offset) : 0);
        filterStart = start;
        filterEnd = end;
      }

      let sessions = await db
        .select()
        .from(voiceSessions)
        .where(
          filterStart && filterEnd
            ? and(
                eq(voiceSessions.businessId, businessId),
                gte(voiceSessions.startedAt, filterStart),
                lt(voiceSessions.startedAt, filterEnd),
              )
            : eq(voiceSessions.businessId, businessId),
        )
        .orderBy(desc(voiceSessions.startedAt))
        .limit(200);

      const sessionIds = sessions.map((s) => s.id);
      const messageCounts = new Map<string, number>();
      const orderBySessionId = new Map<string, (typeof orders.$inferSelect)>();

      if (sessionIds.length) {
        const [counts, sessionOrders] = await Promise.all([
          db
            .select({
              voiceSessionId: transcriptMessages.voiceSessionId,
              count: count(),
            })
            .from(transcriptMessages)
            .where(inArray(transcriptMessages.voiceSessionId, sessionIds))
            .groupBy(transcriptMessages.voiceSessionId),
          db
            .select()
            .from(orders)
            .where(inArray(orders.voiceSessionId, sessionIds)),
        ]);

        for (const row of counts) {
          messageCounts.set(row.voiceSessionId, Number(row.count));
        }
        for (const order of sessionOrders) {
          if (order.voiceSessionId && !orderBySessionId.has(order.voiceSessionId)) {
            orderBySessionId.set(order.voiceSessionId, order);
          }
        }
      }

      return sessions.map((session) => {
        const order = orderBySessionId.get(session.id);
        const duration =
          session.endedAt != null
            ? Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
            : null;
        return {
          id: session.id,
          status: session.status,
          started_at: serializeUtcDatetime(session.startedAt),
          ended_at: session.endedAt ? serializeUtcDatetime(session.endedAt) : null,
          end_reason: session.endReason ?? null,
          duration_seconds: duration,
          message_count: messageCounts.get(session.id) ?? 0,
          order_id: order?.id ?? null,
          order_total: order?.total ?? null,
        };
      });
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return reply.status((err as Error & { statusCode: number }).statusCode).send({
          detail: err.message,
        });
      }
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/conversations/export", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query as { date?: string; tz_offset?: string };
      let filterStart: Date | null = null;
      let filterEnd: Date | null = null;
      if (query.date) {
        const { start, end } = parseDateFilter(query.date, query.tz_offset ? Number(query.tz_offset) : 0);
        filterStart = start;
        filterEnd = end;
      }

      const sessions = await db
        .select()
        .from(voiceSessions)
        .where(
          filterStart && filterEnd
            ? and(
                eq(voiceSessions.businessId, businessId),
                gte(voiceSessions.startedAt, filterStart),
                lt(voiceSessions.startedAt, filterEnd),
              )
            : eq(voiceSessions.businessId, businessId),
        )
        .orderBy(desc(voiceSessions.startedAt))
        .limit(200);

      const sessionIds = sessions.map((session) => session.id);
      if (sessionIds.length === 0) return [];

      const [messages, sessionOrders] = await Promise.all([
        db
          .select()
          .from(transcriptMessages)
          .where(inArray(transcriptMessages.voiceSessionId, sessionIds))
          .orderBy(transcriptMessages.createdAt),
        db.select().from(orders).where(inArray(orders.voiceSessionId, sessionIds)),
      ]);

      const messagesBySessionId = new Map<string, ConversationMessageRow[]>();
      for (const message of messages) {
        const existing = messagesBySessionId.get(message.voiceSessionId) ?? [];
        existing.push(message);
        messagesBySessionId.set(message.voiceSessionId, existing);
      }

      const orderBySessionId = new Map<string, ConversationOrderRow>();
      for (const order of sessionOrders) {
        if (order.voiceSessionId && !orderBySessionId.has(order.voiceSessionId)) {
          orderBySessionId.set(order.voiceSessionId, order);
        }
      }

      return sessions.map((session) =>
        buildConversationDetail(
          session,
          messagesBySessionId.get(session.id) ?? [],
          orderBySessionId.get(session.id),
        ),
      );
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return reply.status((err as Error & { statusCode: number }).statusCode).send({
          detail: err.message,
        });
      }
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/conversations/:sessionId", async (request, reply) => {
    try {
      const { businessId, sessionId } = request.params as {
        businessId: string;
        sessionId: string;
      };
      await requireBusinessAccess(request, businessId);
      const session = await db.query.voiceSessions.findFirst({
        where: and(eq(voiceSessions.id, sessionId), eq(voiceSessions.businessId, businessId)),
      });
      if (!session) return reply.status(404).send({ detail: "Conversation not found" });

      const messages = await db
        .select()
        .from(transcriptMessages)
        .where(eq(transcriptMessages.voiceSessionId, sessionId))
        .orderBy(transcriptMessages.createdAt);

      const sessionOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.voiceSessionId, sessionId))
        .limit(1);

      return buildConversationDetail(session, messages, sessionOrders[0]);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/summary", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const summary = await fetchBusinessStatsSummary(businessId);

      let rules = summary.ai_rules;
      if (!rules) {
        [rules] = await db
          .insert(aiRules)
          .values({
            businessId,
            assistantName: "Lorescale",
            personality: defaultAssistantPersonality({
              businessName: business.name,
              language: "id",
              primaryUseCase: business.primaryUseCase,
              businessType: business.businessType,
              assistantName: "Lorescale",
            }),
            tone: "friendly",
          })
          .returning();
      }

      return {
        overview: summary.overview,
        daily: summary.daily,
        top_products: summary.top_products,
        ai_rules: aiRulesOut(rules!),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/overview", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return fetchStatsOverview(businessId);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/daily", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return fetchStatsDaily(businessId);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/top-products", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return fetchStatsTopProducts(businessId);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/appointments", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const { date } = request.query as { date?: string };
      return listAppointments(businessId, date);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/appointments/:appointmentId/cancel", async (request, reply) => {
    try {
      const { businessId, appointmentId } = request.params as {
        businessId: string;
        appointmentId: string;
      };
      await requireBusinessAccess(request, businessId);
      return cancelAppointment(businessId, appointmentId);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/schedule", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return listBusinessHours(businessId);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.put("/admin/businesses/:businessId/schedule", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body as { hours: BusinessHourInput[] };
      return saveBusinessHours(businessId, body.hours ?? []);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/vision-settings", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const settings = await getOrCreateVisionSettings(businessId);
      return visionSettingsOut(settings);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/vision-settings", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      await getOrCreateVisionSettings(businessId);
      const body = request.body as Record<string, unknown>;
      const updates: Partial<typeof visionSettings.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (body.camera_trigger_enabled !== undefined) {
        updates.cameraTriggerEnabled = Boolean(body.camera_trigger_enabled);
      }
      if (body.vision_source !== undefined) {
        updates.visionSource = normalizeVisionSource(body.vision_source);
      }
      if (body.greeting_trigger_mode !== undefined) {
        updates.greetingTriggerMode = normalizeGreetingTriggerMode(
          body.greeting_trigger_mode,
        );
      }
      if (body.greeting_delay_seconds !== undefined) {
        updates.greetingDelaySeconds = normalizeGreetingDelaySeconds(
          body.greeting_delay_seconds,
        );
      }
      if (body.detection_distance_m !== undefined) {
        updates.detectionDistanceM = normalizeDetectionDistanceM(body.detection_distance_m);
      }
      if (body.cooldown_seconds !== undefined) {
        updates.cooldownSeconds = normalizeCooldownSeconds(body.cooldown_seconds);
      }
      if (body.lost_timeout_seconds !== undefined) {
        updates.lostTimeoutSeconds = normalizeLostTimeoutSeconds(body.lost_timeout_seconds);
      }
      if (body.silence_timeout_seconds !== undefined) {
        updates.silenceTimeoutSeconds = normalizeSilenceTimeoutSeconds(
          body.silence_timeout_seconds,
        );
      }
      if (body.auto_goodbye_timeout_seconds !== undefined) {
        updates.autoGoodbyeTimeoutSeconds = normalizeAutoGoodbyeTimeoutSeconds(
          body.auto_goodbye_timeout_seconds,
        );
      }
      if (body.greeting_script !== undefined) {
        updates.greetingScript = normalizeVisionScript(
          body.greeting_script,
          DEFAULT_VISION_SETTINGS.greetingScript,
        );
      }
      if (body.goodbye_script !== undefined) {
        updates.goodbyeScript = normalizeVisionScript(
          body.goodbye_script,
          DEFAULT_VISION_SETTINGS.goodbyeScript,
        );
      }

      const [updated] = await db
        .update(visionSettings)
        .set(updates)
        .where(eq(visionSettings.businessId, businessId))
        .returning();

      await refreshHubSettings(business.slug);
      const hub = getVisionHub(business.slug);
      if (hub) {
        broadcastVisionConfig(hub);
      }
      return visionSettingsOut(updated!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/vision-metrics", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const { days } = request.query as { days?: string };
      const periodDays = days ? Math.max(1, Math.min(90, Number(days))) : 7;
      return getVisionMetrics(businessId, periodDays);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/transactions", async (request, reply) => {
    try {
      const user = await getCurrentUser(request);

      const [planRows, addonRows] = await Promise.all([
        db
          .select({
            id: subscriptionRequests.id,
            status: subscriptionRequests.status,
            createdAt: subscriptionRequests.createdAt,
            reviewedAt: subscriptionRequests.reviewedAt,
            notes: subscriptionRequests.notes,
            planName: plans.name,
            planCode: plans.code,
          })
          .from(subscriptionRequests)
          .innerJoin(plans, eq(plans.id, subscriptionRequests.requestedPlanId))
          .where(eq(subscriptionRequests.userId, user.id))
          .orderBy(desc(subscriptionRequests.createdAt))
          .limit(50),
        db
          .select({
            id: addonRequests.id,
            status: addonRequests.status,
            createdAt: addonRequests.createdAt,
            reviewedAt: addonRequests.reviewedAt,
            notes: addonRequests.notes,
            paymentProofUrl: addonRequests.paymentProofUrl,
            transactionCode: addonRequests.transactionCode,
            addonName: addons.name,
            addonCode: addons.code,
            priceDisplay: addons.priceDisplay,
            businessName: businesses.name,
            businessId: businesses.id,
          })
          .from(addonRequests)
          .innerJoin(addons, eq(addons.code, addonRequests.addonCode))
          .innerJoin(businesses, eq(businesses.id, addonRequests.businessId))
          .where(eq(addonRequests.userId, user.id))
          .orderBy(desc(addonRequests.createdAt))
          .limit(50),
      ]);

      const items = [
        ...planRows.map((row) => ({
          id: row.id,
          type: "subscription" as const,
          title: `${row.planName} plan`,
          subtitle: row.planCode,
          status: row.status,
          amount_label: null as string | null,
          workspace_name: null as string | null,
          payment_proof_url: null as string | null,
          transaction_code: null as string | null,
          notes: row.notes,
          created_at: row.createdAt.toISOString(),
          reviewed_at: row.reviewedAt?.toISOString() ?? null,
        })),
        ...addonRows.map((row) => ({
          id: row.id,
          type: "addon" as const,
          title: row.addonName,
          subtitle: row.addonCode,
          status: row.status,
          amount_label: amountLabelFromAddonNotes(row.notes),
          workspace_name: row.businessName,
          payment_proof_url: row.paymentProofUrl,
          transaction_code: row.transactionCode,
          notes: row.notes,
          created_at: row.createdAt.toISOString(),
          reviewed_at: row.reviewedAt?.toISOString() ?? null,
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));

      return { items };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/subscription/me", async (request, reply) => {
    try {
      const user = await getCurrentUser(request);
      return getEntitlementSnapshot(user.id);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/subscription/plans", async (request, reply) => {
    try {
      await getCurrentUser(request);
      const paid = await listPaidPlans();
      return paid.map((p) => ({
        code: p.code,
        name: p.name,
        workspace_limit: p.workspaceLimit,
      }));
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/subscription/request", async (request, reply) => {
    try {
      const user = await getCurrentUser(request);
      const body = request.body as { plan_code?: string };
      const planCode = body.plan_code?.trim().toLowerCase() ?? "";
      if (!planCode) {
        return reply.status(400).send({ detail: "plan_code is required" });
      }

      try {
        const { requestId, plan } = await createSubscriptionRequest(user.id, planCode);
        const entitlement = await getEntitlementSnapshot(user.id);
        return reply.status(201).send({
          id: requestId,
          requested_plan: { code: plan.code, name: plan.name, workspace_limit: plan.workspaceLimit },
          status: "pending",
          entitlement,
        });
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return reply.status((err as Error & { statusCode: number }).statusCode).send({
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/addons", async (request, reply) => {
    try {
      await getCurrentUser(request);
      const rows = await listAddons();
      return rows.map((a) => ({
        code: a.code,
        name: a.name,
        description: a.description,
        price_display: a.priceDisplay,
      }));
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/addons/:code", async (request, reply) => {
    try {
      const { businessId, code } = request.params as { businessId: string; code: string };
      await requireBusinessAccess(request, businessId);
      return getAddonStatusForBusiness(businessId, code);
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return reply.status((err as Error & { statusCode: number }).statusCode).send({
          detail: err.message,
        });
      }
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/addons/payment-proof", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const data = await request.file();
      if (!data) return reply.status(400).send({ detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return reply.status(400).send({
          detail: "Upload a PNG, JPG, WEBP, or GIF image of your payment proof.",
        });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return reply.status(400).send({ detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.status(400).send({ detail: "Payment proof must be 5 MB or smaller." });
      }

      const url = await uploadToStorage(
        "payment-proofs",
        `${businessId}/proof-${Date.now()}${extension}`,
        buffer,
        contentType,
      );
      return { url };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/addons/:code/request", async (request, reply) => {
    try {
      const user = await getCurrentUser(request);
      const { businessId, code } = request.params as { businessId: string; code: string };
      await requireBusinessAccess(request, businessId);
      const body = (request.body ?? {}) as {
        duration_months?: number;
        payment_method?: string;
        billing_name?: string;
        billing_email?: string;
        billing_phone?: string;
        company?: string;
        notes?: string;
        payment_proof_url?: string;
        transaction_code?: string;
        amount_display?: string;
        amount_idr?: number;
      };
      const noteParts = [
        body.amount_display
          ? `Amount: ${body.amount_display}`
          : body.amount_idr != null
            ? `Amount: Rp${Number(body.amount_idr).toLocaleString("id-ID")}`
            : null,
        body.duration_months ? `Duration: ${body.duration_months} month(s)` : null,
        body.payment_method ? `Payment method: ${body.payment_method}` : null,
        body.billing_name ? `Name: ${body.billing_name}` : null,
        body.billing_email ? `Email: ${body.billing_email}` : null,
        body.billing_phone ? `Phone: ${body.billing_phone}` : null,
        body.company ? `Company: ${body.company}` : null,
        body.notes ? `Note: ${body.notes}` : null,
        body.payment_proof_url ? `Payment proof: ${body.payment_proof_url}` : null,
      ].filter(Boolean);
      try {
        const { requestId, transactionCode, addon } = await createAddonRequest(
          user.id,
          businessId,
          code,
          noteParts.join("\n"),
          body.payment_proof_url?.trim() || null,
          body.transaction_code,
        );
        return reply.status(201).send({
          id: requestId,
          status: "pending",
          transaction_code: transactionCode,
          addon: {
            code: addon.code,
            name: addon.name,
            price_display: addon.priceDisplay,
          },
        });
      } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
          return reply.status((err as Error & { statusCode: number }).statusCode).send({
            detail: err.message,
          });
        }
        throw err;
      }
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/photo/settings", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const settings = await getOrCreatePhotoSettings(businessId);
      const status = await getAddonStatusForBusiness(businessId, SMART_PHOTO_MOMENT_CODE);
      return { ...photoSettingsOut(settings), subscription_status: status.subscription_status };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/photo/settings", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body as {
        enabled?: boolean;
        voice_prompt?: string;
        countdown_seconds?: number;
        qr_expiry_hours?: number;
        campaign_text?: string | null;
        auto_delete_days?: number;
      };
      const updated = await updatePhotoSettings(businessId, {
        enabled: body.enabled,
        voicePrompt: body.voice_prompt,
        countdownSeconds: body.countdown_seconds,
        qrExpiryHours: body.qr_expiry_hours,
        campaignText: body.campaign_text,
        autoDeleteDays: body.auto_delete_days,
      });
      return updated;
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return reply.status((err as Error & { statusCode: number }).statusCode).send({
          detail: err.message,
        });
      }
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/photo/branding/:kind", async (request, reply) => {
    try {
      const { businessId, kind } = request.params as { businessId: string; kind: string };
      if (kind !== "logo" && kind !== "frame") {
        return reply.status(400).send({ detail: "kind must be logo or frame" });
      }
      await requireBusinessAccess(request, businessId);
      const data = await request.file();
      if (!data) return reply.status(400).send({ detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return reply.status(400).send({
          detail: "Upload a PNG, JPG, WEBP, or GIF image.",
        });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return reply.status(400).send({ detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return reply.status(400).send({ detail: "Image must be 5 MB or smaller." });
      }

      const objectPath = `${businessId}/${kind}${extension}`;
      const url = await uploadToStorage(PHOTO_BRANDING_BUCKET, objectPath, buffer, contentType);
      const updated = await updatePhotoSettings(businessId, {
        ...(kind === "logo" ? { logoUrl: url } : { frameUrl: url }),
      });
      return updated;
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/photo/branding/:kind", async (request, reply) => {
    try {
      const { businessId, kind } = request.params as { businessId: string; kind: string };
      if (kind !== "logo" && kind !== "frame") {
        return reply.status(400).send({ detail: "kind must be logo or frame" });
      }
      await requireBusinessAccess(request, businessId);
      const updated = await updatePhotoSettings(businessId, {
        ...(kind === "logo" ? { logoUrl: null } : { frameUrl: null }),
      });
      return updated;
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/photo/gallery", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const query = request.query as Record<string, unknown>;
      const from = typeof query.from === "string" && query.from ? new Date(query.from) : null;
      const to = typeof query.to === "string" && query.to ? new Date(query.to) : null;
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
      const offset = Math.max(0, Number(query.offset) || 0);
      return listPhotoGallery({
        businessId,
        from: from && !Number.isNaN(from.getTime()) ? from : null,
        to: to && !Number.isNaN(to.getTime()) ? to : null,
        limit,
        offset,
      });
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/photo/gallery/:sessionId", async (request, reply) => {
    try {
      const { businessId, sessionId } = request.params as {
        businessId: string;
        sessionId: string;
      };
      await requireBusinessAccess(request, businessId);
      await deletePhotoSession(businessId, sessionId);
      return { ok: true };
    } catch (err) {
      if (err instanceof Error && "statusCode" in err) {
        return reply.status((err as Error & { statusCode: number }).statusCode).send({
          detail: err.message,
        });
      }
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/photo/analytics", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      return getPhotoAnalytics(businessId);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });
}
