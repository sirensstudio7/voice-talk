import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  businessOut,
  createAccessToken,
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
  businesses,
  businessMembers,
  knowledgeEntries,
  orderItems,
  orders,
  products,
  transcriptMessages,
  users,
  voiceSessions,
} from "../db/schema.js";
import { buildSystemInstruction } from "../services/config-builder.js";
import {
  buildOnboardingAiRules,
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
import { serializeUtcDatetime } from "../services/pricing.js";
import { getBusinessWithRelations } from "../services/tenant.js";
import {
  ALLOWED_IMAGE_TYPES,
  deleteFromStorage,
  MAX_UPLOAD_BYTES,
  uploadToStorage,
} from "../storage/index.js";
import { orderToOut } from "./public.js";

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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
  return { id: e.id, category: e.category, content: e.content, sort_order: e.sortOrder };
}

function aiRulesOut(r: typeof aiRules.$inferSelect) {
  return {
    id: r.id,
    assistant_name: r.assistantName,
    avatar_url: r.avatarUrl || "",
    personality: r.personality,
    tone: r.tone,
    language: r.language,
    behavioral_rules: r.behavioralRules,
    tool_instructions: r.toolInstructions,
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

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/admin/auth/login", async (request, reply) => {
    const body = request.body as { email: string; password: string };
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email.toLowerCase().trim()),
    });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.status(401).send({ detail: "Invalid credentials" });
    }
    return {
      access_token: createAccessToken(user.id),
      token_type: "bearer",
      user: userOut(user),
    };
  });

  app.post("/admin/auth/signup", async (request, reply) => {
    const body = request.body as { email?: string; password?: string; name?: string };
    const email = body.email?.toLowerCase().trim() ?? "";
    const password = body.password ?? "";

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
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        name,
      })
      .returning();

    return reply.status(201).send({
      access_token: createAccessToken(user!.id),
      token_type: "bearer",
      user: userOut(user!),
    });
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
      const user = await getCurrentUser(request);
      const rows = await db
        .select({ business: businesses })
        .from(businesses)
        .innerJoin(businessMembers, eq(businessMembers.businessId, businesses.id))
        .where(eq(businessMembers.userId, user.id))
        .orderBy(businesses.name);
      return rows.map((r) => businessOut(r.business));
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
        personality: `Kamu adalah kasir AI yang ramah di ${body.name}. Selalu berbicara dalam Bahasa Indonesia.`,
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
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/appearance", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      const body = request.body as { gradient_color?: string | null };
      let gradientColor = business.gradientColor;
      if (body.gradient_color !== undefined) {
        gradientColor = normalizeGradientColor(body.gradient_color);
      }
      const [updated] = await db
        .update(businesses)
        .set({ gradientColor })
        .where(eq(businesses.id, business.id))
        .returning();
      return {
        background_url: updated!.backgroundUrl || "",
        gradient_color: updated!.gradientColor || "",
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
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/appearance/background", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      const business = await requireBusinessAccess(request, businessId);
      await deleteFromStorage("backgrounds", business.id);
      await db.update(businesses).set({ backgroundUrl: "" }).where(eq(businesses.id, business.id));
      return { background_url: "", gradient_color: business.gradientColor || "" };
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
            personality: `Kamu adalah kasir AI yang ramah di ${business.name}. Selalu berbicara dalam Bahasa Indonesia.`,
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
            personality: `Kamu adalah kasir AI yang ramah di ${business.name}. Selalu berbicara dalam Bahasa Indonesia.`,
            tone: "friendly",
          })
          .returning();
      }
      const body = request.body as Record<string, unknown>;
      const updates: Partial<typeof aiRules.$inferInsert> = {};
      if (body.assistant_name !== undefined) updates.assistantName = String(body.assistant_name);
      if (body.personality !== undefined) updates.personality = String(body.personality);
      if (body.tone !== undefined) updates.tone = String(body.tone);
      if (body.language !== undefined) updates.language = String(body.language);
      if (body.behavioral_rules !== undefined) updates.behavioralRules = String(body.behavioral_rules);
      if (body.tool_instructions !== undefined) updates.toolInstructions = String(body.tool_instructions);

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
            personality: `Kamu adalah kasir AI yang ramah di ${business.name}. Selalu berbicara dalam Bahasa Indonesia.`,
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

      const result = [];
      for (const order of rows) {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        result.push(orderToOut({ ...order, items }));
      }
      return result;
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
        .where(eq(voiceSessions.businessId, businessId))
        .orderBy(desc(voiceSessions.startedAt))
        .limit(200);

      if (filterStart && filterEnd) {
        sessions = sessions.filter(
          (s) => s.startedAt >= filterStart! && s.startedAt < filterEnd!,
        );
      }

      const sessionIds = sessions.map((s) => s.id);
      const messageCounts = new Map<string, number>();
      if (sessionIds.length) {
        const counts = await db
          .select({
            voiceSessionId: transcriptMessages.voiceSessionId,
            count: count(),
          })
          .from(transcriptMessages)
          .where(inArray(transcriptMessages.voiceSessionId, sessionIds))
          .groupBy(transcriptMessages.voiceSessionId);
        for (const row of counts) {
          messageCounts.set(row.voiceSessionId, Number(row.count));
        }
      }

      const result = [];
      for (const session of sessions) {
        const sessionOrders = await db
          .select()
          .from(orders)
          .where(eq(orders.voiceSessionId, session.id))
          .limit(1);
        const order = sessionOrders[0];
        const duration =
          session.endedAt != null
            ? Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
            : null;
        result.push({
          id: session.id,
          status: session.status,
          started_at: serializeUtcDatetime(session.startedAt),
          ended_at: session.endedAt ? serializeUtcDatetime(session.endedAt) : null,
          duration_seconds: duration,
          message_count: messageCounts.get(session.id) ?? 0,
          order_id: order?.id ?? null,
          order_total: order?.total ?? null,
        });
      }
      return result;
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
      const order = sessionOrders[0];
      const duration =
        session.endedAt != null
          ? Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
          : null;

      return {
        id: session.id,
        status: session.status,
        started_at: serializeUtcDatetime(session.startedAt),
        ended_at: session.endedAt ? serializeUtcDatetime(session.endedAt) : null,
        duration_seconds: duration,
        message_count: messages.length,
        order_id: order?.id ?? null,
        order_total: order?.total ?? null,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          created_at: serializeUtcDatetime(m.createdAt),
        })),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/overview", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const [sessionsTodayRow] = await db
        .select({ value: count() })
        .from(voiceSessions)
        .where(and(eq(voiceSessions.businessId, businessId), gte(voiceSessions.startedAt, today)));

      const [activeSessionsRow] = await db
        .select({ value: count() })
        .from(voiceSessions)
        .where(and(eq(voiceSessions.businessId, businessId), eq(voiceSessions.status, "active")));

      const confirmedToday = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            eq(orders.status, "confirmed"),
            gte(orders.confirmedAt, today),
          ),
        );

      const ordersToday = confirmedToday.length;
      const revenueToday = confirmedToday.reduce((sum, o) => sum + o.total, 0);
      const avgOrderValue = ordersToday ? revenueToday / ordersToday : 0;

      const endedSessions = await db
        .select()
        .from(voiceSessions)
        .where(
          and(
            eq(voiceSessions.businessId, businessId),
            eq(voiceSessions.status, "ended"),
            sql`${voiceSessions.endedAt} IS NOT NULL`,
          ),
        );

      const durations = endedSessions
        .filter((s) => s.endedAt)
        .map((s) => (s.endedAt!.getTime() - s.startedAt.getTime()) / 1000);
      const avgCallDuration = durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;

      return {
        sessions_today: Number(sessionsTodayRow?.value ?? 0),
        orders_today: ordersToday,
        revenue_today: Math.round(revenueToday * 100) / 100,
        avg_order_value: Math.round(avgOrderValue * 100) / 100,
        active_sessions: Number(activeSessionsRow?.value ?? 0),
        avg_call_duration_seconds:
          avgCallDuration != null ? Math.round(avgCallDuration * 10) / 10 : null,
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/daily", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - 13);

      const confirmedOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.businessId, businessId),
            eq(orders.status, "confirmed"),
            gte(orders.confirmedAt, start),
          ),
        );

      const buckets: Record<string, { date: string; orders: number; revenue: number }> = {};
      for (let i = 0; i < 14; i++) {
        const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        const key = day.toISOString().slice(0, 10);
        buckets[key] = { date: key, orders: 0, revenue: 0 };
      }

      for (const order of confirmedOrders) {
        if (!order.confirmedAt) continue;
        const day = order.confirmedAt.toISOString().slice(0, 10);
        if (!buckets[day]) continue;
        buckets[day].orders += 1;
        buckets[day].revenue = Math.round((buckets[day].revenue + order.total) * 100) / 100;
      }

      return Object.values(buckets);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/stats/top-products", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);

      const rows = await db
        .select({
          productId: orderItems.productId,
          name: orderItems.name,
          qty: sql<number>`sum(${orderItems.quantity})`,
          rev: sql<number>`sum(${orderItems.price} * ${orderItems.quantity})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orders.businessId, businessId), eq(orders.status, "confirmed")))
        .groupBy(orderItems.productId, orderItems.name)
        .orderBy(sql`sum(${orderItems.quantity}) desc`)
        .limit(10);

      return rows.map((row) => ({
        product_id: row.productId,
        name: row.name,
        quantity: Number(row.qty ?? 0),
        revenue: Math.round(Number(row.rev ?? 0) * 100) / 100,
      }));
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
}
