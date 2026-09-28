import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { getVoicePresetGeminiVoice } from "@voicetalk/shared";
import type { SocketBridge } from "../http/websocket.js";

import { db } from "../db/client.js";
import {
  aiRules,
  businesses,
  liveKnowledgeEntries,
  liveMessages,
  liveSessionProducts,
  liveSessions,
  orderItems,
  orders,
  platformSettings,
  products,
} from "../db/schema.js";
import {
  buildValidatedOrderSnapshot,
  OrderValidationError,
  persistConfirmedOrder,
} from "./order-persistence.js";
import { effectivePrice } from "./pricing.js";
import { hasActiveAddon, LIVE_CODE } from "./addon-entitlement.js";
import { hasServiceAccessForBusiness } from "./entitlement.js";
import { synthesizeSpeechWav } from "./presentation-ai.js";
import { speakWithGeminiLive, stopLiveHostVoice } from "./live-narrator.js";
import { resolveGeminiApiKeyForBusiness } from "./user-api-keys.js";

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

async function assertLiveAccess(businessId: string) {
  const [entitled, serviceOk] = await Promise.all([
    hasActiveAddon(businessId, LIVE_CODE),
    hasServiceAccessForBusiness(businessId),
  ]);
  if (!entitled || !serviceOk) {
    throw httpError("LORESCALE LIVE is not active for this workspace", 403);
  }
}

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "live";
}

export type LiveProductOut = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  image_url: string;
  description: string;
  live_only: boolean;
};

export type LiveCatalogProductOut = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  list_price: number;
  discount_percent: number;
  category: string;
  image_url: string;
  description: string;
  is_active: boolean;
  live_only: boolean;
};

export type LiveMessageOut = {
  id: string;
  role: string;
  display_name: string;
  body: string;
  product_id: string | null;
  created_at: string;
};

export type LiveKnowledgeOut = {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
};

export type LiveOrderItemOut = {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
};

export type LiveOrderOut = {
  id: string;
  status: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  items: LiveOrderItemOut[];
};

export type LiveSessionOut = {
  id: string;
  business_id: string;
  business_slug: string;
  business_name: string;
  title: string;
  slug: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  products: LiveProductOut[];
  viewer_count: number;
};

function productOut(row: typeof products.$inferSelect): LiveProductOut {
  return {
    id: row.id,
    product_id: row.productId,
    name: row.name,
    price: effectivePrice(row.price, row.discountPercent),
    image_url: row.imageUrl,
    description: row.description,
    live_only: row.liveOnly,
  };
}

function catalogOut(row: typeof products.$inferSelect): LiveCatalogProductOut {
  const listPrice = row.price;
  const discountPercent = row.discountPercent;
  return {
    id: row.id,
    product_id: row.productId,
    name: row.name,
    price: effectivePrice(listPrice, discountPercent),
    list_price: listPrice,
    discount_percent: discountPercent,
    category: row.category,
    image_url: row.imageUrl,
    description: row.description,
    is_active: row.isActive,
    live_only: row.liveOnly,
  };
}

function messageOut(row: typeof liveMessages.$inferSelect): LiveMessageOut {
  return {
    id: row.id,
    role: row.role,
    display_name: row.displayName,
    body: row.body,
    product_id: row.productId,
    created_at: row.createdAt.toISOString(),
  };
}

async function loadSessionProductRows(sessionId: string) {
  const links = await db
    .select()
    .from(liveSessionProducts)
    .where(eq(liveSessionProducts.sessionId, sessionId));
  if (!links.length) return [];
  const rows = await db
    .select()
    .from(products)
    .where(
      inArray(
        products.id,
        links.map((link) => link.productId),
      ),
    );
  return rows.filter((row) => row.liveOnly && row.isActive);
}

function liveOrderOut(
  order: typeof orders.$inferSelect,
  items: Array<typeof orderItems.$inferSelect>,
): LiveOrderOut {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    customer_name: order.customerName,
    customer_phone: order.customerPhone?.trim() || null,
    customer_address: order.customerAddress?.trim() || null,
    customer_notes: order.customerNotes?.trim() || null,
    created_at: order.createdAt.toISOString(),
    confirmed_at: order.confirmedAt?.toISOString() ?? null,
    items: items.map((item) => ({
      product_id: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: Math.round(item.price * item.quantity * 100) / 100,
    })),
  };
}

async function loadSessionProducts(sessionId: string): Promise<LiveProductOut[]> {
  const links = await db
    .select()
    .from(liveSessionProducts)
    .where(eq(liveSessionProducts.sessionId, sessionId));
  if (!links.length) return [];
  const rows = await db
    .select()
    .from(products)
    .where(
      inArray(
        products.id,
        links.map((link) => link.productId),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return links
    .map((link) => byId.get(link.productId))
    .filter((row): row is typeof products.$inferSelect => Boolean(row?.liveOnly))
    .map(productOut);
}

async function sessionOut(
  row: typeof liveSessions.$inferSelect,
  extra?: { businessSlug?: string; businessName?: string },
): Promise<LiveSessionOut> {
  const business =
    extra?.businessSlug && extra.businessName
      ? { slug: extra.businessSlug, name: extra.businessName }
      : await db.query.businesses.findFirst({ where: eq(businesses.id, row.businessId) });
  return {
    id: row.id,
    business_id: row.businessId,
    business_slug: business?.slug ?? extra?.businessSlug ?? "",
    business_name: business?.name ?? extra?.businessName ?? "",
    title: row.title,
    slug: row.slug,
    status: row.status,
    started_at: row.startedAt?.toISOString() ?? null,
    ended_at: row.endedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    products: await loadSessionProducts(row.id),
    viewer_count: liveRoomViewerCount(row.id),
  };
}

export async function listLiveSessions(businessId: string): Promise<LiveSessionOut[]> {
  await assertLiveAccess(businessId);
  const rows = await db
    .select()
    .from(liveSessions)
    .where(eq(liveSessions.businessId, businessId))
    .orderBy(desc(liveSessions.createdAt));
  return Promise.all(rows.map((row) => sessionOut(row)));
}

export async function createLiveSession(
  businessId: string,
  input: { title: string; product_ids?: string[] },
): Promise<LiveSessionOut> {
  await assertLiveAccess(businessId);
  const title = input.title.trim();
  if (!title) throw httpError("Title is required", 400);
  const slug = `${slugify(title)}-${randomUUID().slice(0, 6)}`;
  const [created] = await db
    .insert(liveSessions)
    .values({ businessId, title, slug, status: "draft" })
    .returning();
  if (input.product_ids?.length) {
    await setLiveSessionProducts(businessId, created!.id, input.product_ids);
  }
  return sessionOut(created!);
}

export async function getLiveSessionForBusiness(
  businessId: string,
  sessionId: string,
): Promise<LiveSessionOut> {
  await assertLiveAccess(businessId);
  const row = await db.query.liveSessions.findFirst({
    where: and(eq(liveSessions.id, sessionId), eq(liveSessions.businessId, businessId)),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  return sessionOut(row);
}

export async function getLiveSessionById(sessionId: string): Promise<LiveSessionOut> {
  const row = await db.query.liveSessions.findFirst({
    where: eq(liveSessions.id, sessionId),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  return sessionOut(row);
}

export async function getPublicLiveSession(sessionId: string): Promise<LiveSessionOut> {
  const row = await db.query.liveSessions.findFirst({
    where: eq(liveSessions.id, sessionId),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  const [entitled, serviceOk] = await Promise.all([
    hasActiveAddon(row.businessId, LIVE_CODE),
    hasServiceAccessForBusiness(row.businessId),
  ]);
  if (!entitled || !serviceOk) throw httpError("LIVE is not available", 403);
  if (row.status !== "live") throw httpError("This LIVE is not on air", 404);
  return sessionOut(row);
}

export async function listLiveSessionOrders(
  businessId: string,
  sessionId: string,
): Promise<LiveOrderOut[]> {
  await assertLiveAccess(businessId);
  const row = await db.query.liveSessions.findFirst({
    where: and(eq(liveSessions.id, sessionId), eq(liveSessions.businessId, businessId)),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.liveSessionId, sessionId))
    .orderBy(desc(orders.createdAt))
    .limit(200);
  if (!rows.length) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((order) => order.id),
      ),
    );
  const itemsByOrderId = new Map<string, Array<typeof orderItems.$inferSelect>>();
  for (const item of items) {
    const existing = itemsByOrderId.get(item.orderId) ?? [];
    existing.push(item);
    itemsByOrderId.set(item.orderId, existing);
  }
  return rows.map((order) => liveOrderOut(order, itemsByOrderId.get(order.id) ?? []));
}

export async function confirmLiveOrder(
  sessionId: string,
  input: {
    items: Array<{ product_id: string; quantity: number }>;
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
    customer_notes?: string;
  },
): Promise<LiveOrderOut> {
  const row = await db.query.liveSessions.findFirst({
    where: eq(liveSessions.id, sessionId),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  const [entitled, serviceOk] = await Promise.all([
    hasActiveAddon(row.businessId, LIVE_CODE),
    hasServiceAccessForBusiness(row.businessId),
  ]);
  if (!entitled || !serviceOk) throw httpError("LIVE is not available", 403);
  const catalog = await loadSessionProductRows(sessionId);
  if (!catalog.length) throw httpError("This LIVE has no products to sell", 400);
  const customerName = (input.customer_name ?? "").trim().slice(0, 80);
  const customerPhone = (input.customer_phone ?? "").trim().slice(0, 50);
  const customerAddress = (input.customer_address ?? "").trim().slice(0, 500);
  const customerNotes = (input.customer_notes ?? "").trim().slice(0, 500);
  if (!customerName) throw httpError("Name is required", 400);
  if (!customerPhone) throw httpError("Phone is required", 400);
  if (!customerAddress) throw httpError("Address is required", 400);
  try {
    const snapshot = buildValidatedOrderSnapshot(
      catalog,
      (input.items ?? []).map((item) => ({
        productId: String(item.product_id ?? ""),
        quantity: Number(item.quantity),
      })),
    );
    snapshot.customer_name = customerName;
    snapshot.customer_phone = customerPhone;
    snapshot.customer_address = customerAddress;
    snapshot.customer_notes = customerNotes;
    const saved = await persistConfirmedOrder(row.businessId, null, snapshot, {
      liveSessionId: sessionId,
    });
    return liveOrderOut(saved, saved.items);
  } catch (err) {
    if (err instanceof OrderValidationError) throw httpError(err.detail, 400);
    throw err;
  }
}

export async function setLiveSessionProducts(
  businessId: string,
  sessionId: string,
  productIds: string[],
): Promise<LiveSessionOut> {
  await assertLiveAccess(businessId);
  const row = await db.query.liveSessions.findFirst({
    where: and(eq(liveSessions.id, sessionId), eq(liveSessions.businessId, businessId)),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  const unique = [...new Set(productIds.filter(Boolean))];
  let allowed: string[] = [];
  if (unique.length) {
    const owned = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.businessId, businessId),
          eq(products.liveOnly, true),
          inArray(products.id, unique),
        ),
      );
    const allowedSet = new Set(owned.map((row) => row.id));
    allowed = unique.filter((id) => allowedSet.has(id));
  }
  await db.delete(liveSessionProducts).where(eq(liveSessionProducts.sessionId, sessionId));
  if (allowed.length) {
    await db.insert(liveSessionProducts).values(
      allowed.map((productId) => ({ sessionId, productId })),
    );
  }
  return sessionOut(row);
}

export async function listLiveProductCatalog(businessId: string): Promise<LiveCatalogProductOut[]> {
  await assertLiveAccess(businessId);
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.businessId, businessId),
        eq(products.liveOnly, true),
        eq(products.isActive, true),
      ),
    )
    .orderBy(products.sortOrder, products.name);
  return rows.map(catalogOut);
}

export async function createLiveDedicatedProduct(
  businessId: string,
  sessionId: string,
  input: {
    name: string;
    price: number;
    product_id?: string;
    discount_percent?: number;
    category?: string;
    description?: string;
    image_url?: string;
  },
): Promise<LiveSessionOut> {
  await assertLiveAccess(businessId);
  const row = await db.query.liveSessions.findFirst({
    where: and(eq(liveSessions.id, sessionId), eq(liveSessions.businessId, businessId)),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  const name = input.name.trim();
  const price = Number(input.price);
  const discountPercent = Number(input.discount_percent ?? 0);
  const category = (input.category ?? "").trim().slice(0, 100) || "Apparel";
  if (!name) throw httpError("Product name is required", 400);
  if (!Number.isFinite(price) || price < 0) throw httpError("Price must be 0 or greater", 400);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw httpError("Discount must be between 0 and 100", 400);
  }
  const requestedId = slugify(input.product_id || name);
  const productId = (input.product_id ?? "").trim()
    ? requestedId
    : `live-${requestedId}-${randomUUID().slice(0, 6)}`;
  const existing = await db.query.products.findFirst({
    where: and(eq(products.businessId, businessId), eq(products.productId, productId)),
  });
  if (existing) throw httpError("Product ID is already in use", 400);
  const [created] = await db
    .insert(products)
    .values({
      businessId,
      productId,
      name,
      price,
      discountPercent,
      category,
      description: (input.description ?? "").trim(),
      imageUrl: (input.image_url ?? "").trim(),
      isActive: true,
      liveOnly: true,
    })
    .returning();
  if (!created) throw httpError("Failed to create LIVE product", 500);
  const links = await db
    .select()
    .from(liveSessionProducts)
    .where(eq(liveSessionProducts.sessionId, sessionId));
  await setLiveSessionProducts(businessId, sessionId, [
    ...links.map((link) => link.productId),
    created.id,
  ]);
  return getLiveSessionForBusiness(businessId, sessionId);
}

async function requireLiveDedicatedProduct(businessId: string, productRowId: string) {
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, productRowId), eq(products.businessId, businessId)),
  });
  if (!product?.liveOnly) throw httpError("LIVE product not found", 404);
  return product;
}

export async function updateLiveDedicatedProduct(
  businessId: string,
  productRowId: string,
  input: {
    name: string;
    price: number;
    product_id?: string;
    discount_percent?: number;
    category?: string;
    description?: string;
    image_url?: string;
  },
): Promise<LiveCatalogProductOut> {
  await assertLiveAccess(businessId);
  const current = await requireLiveDedicatedProduct(businessId, productRowId);
  const name = input.name.trim();
  const price = Number(input.price);
  const discountPercent = Number(input.discount_percent ?? 0);
  const category = (input.category ?? "").trim().slice(0, 100) || current.category;
  if (!name) throw httpError("Product name is required", 400);
  if (!Number.isFinite(price) || price < 0) throw httpError("Price must be 0 or greater", 400);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw httpError("Discount must be between 0 and 100", 400);
  }
  const productId = slugify(input.product_id || name);
  if (!productId) throw httpError("Product ID is required", 400);
  if (productId !== current.productId) {
    const existing = await db.query.products.findFirst({
      where: and(eq(products.businessId, businessId), eq(products.productId, productId)),
    });
    if (existing) throw httpError("Product ID is already in use", 400);
  }
  const [updated] = await db
    .update(products)
    .set({
      productId,
      name,
      price,
      discountPercent,
      category,
      description: (input.description ?? "").trim(),
      imageUrl: (input.image_url ?? "").trim(),
    })
    .where(eq(products.id, productRowId))
    .returning();
  if (!updated) throw httpError("Failed to update LIVE product", 500);
  return catalogOut(updated);
}

export async function deleteLiveDedicatedProduct(
  businessId: string,
  productRowId: string,
): Promise<void> {
  await assertLiveAccess(businessId);
  await requireLiveDedicatedProduct(businessId, productRowId);
  await db.delete(products).where(eq(products.id, productRowId));
}

export async function startLiveSession(
  businessId: string,
  sessionId: string,
): Promise<LiveSessionOut> {
  await assertLiveAccess(businessId);
  const row = await db.query.liveSessions.findFirst({
    where: and(eq(liveSessions.id, sessionId), eq(liveSessions.businessId, businessId)),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  const restarting = row.status === "ended";
  const [updated] = await db
    .update(liveSessions)
    .set({
      status: "live",
      startedAt: restarting ? new Date() : (row.startedAt ?? new Date()),
      endedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(liveSessions.id, sessionId))
    .returning();
  const out = await sessionOut(updated!);
  resetHostNarration(sessionId);
  stopLiveHostVoice(sessionId);
  broadcastLive(sessionId, { type: "session.status", status: "live" });
  syncLiveHostLoop(sessionId);
  return out;
}

export async function endLiveSession(
  businessId: string,
  sessionId: string,
): Promise<LiveSessionOut> {
  await assertLiveAccess(businessId);
  const row = await db.query.liveSessions.findFirst({
    where: and(eq(liveSessions.id, sessionId), eq(liveSessions.businessId, businessId)),
  });
  if (!row) throw httpError("LIVE session not found", 404);
  const [updated] = await db
    .update(liveSessions)
    .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(liveSessions.id, sessionId))
    .returning();
  const out = await sessionOut(updated!);
  stopLiveHostLoop(sessionId);
  stopLiveHostVoice(sessionId);
  resetHostNarration(sessionId);
  broadcastLive(sessionId, { type: "session.status", status: "ended" });
  return out;
}

function knowledgeOut(row: typeof liveKnowledgeEntries.$inferSelect): LiveKnowledgeOut {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
  };
}

async function loadLiveKnowledge(sessionId: string): Promise<LiveKnowledgeOut[]> {
  const rows = await db
    .select()
    .from(liveKnowledgeEntries)
    .where(eq(liveKnowledgeEntries.sessionId, sessionId))
    .orderBy(asc(liveKnowledgeEntries.sortOrder), asc(liveKnowledgeEntries.createdAt))
    .limit(24);
  return rows.map(knowledgeOut);
}

function liveFacts(notes: LiveKnowledgeOut[]) {
  return notes
    .map((note) => `${note.title || "Note"}: ${note.content}`)
    .join("\n");
}

export async function listLiveKnowledge(
  businessId: string,
  sessionId: string,
): Promise<LiveKnowledgeOut[]> {
  await getLiveSessionForBusiness(businessId, sessionId);
  return loadLiveKnowledge(sessionId);
}

export async function createLiveKnowledge(
  businessId: string,
  sessionId: string,
  input: { title?: string; content: string },
): Promise<LiveKnowledgeOut> {
  await getLiveSessionForBusiness(businessId, sessionId);
  const content = input.content.trim();
  if (!content) throw httpError("Talking point is required", 400);
  const existing = await loadLiveKnowledge(sessionId);
  if (existing.length >= 24) throw httpError("Maximum 24 talking points per LIVE", 400);
  const [created] = await db
    .insert(liveKnowledgeEntries)
    .values({
      sessionId,
      title: (input.title ?? "").trim().slice(0, 160),
      content: content.slice(0, 2000),
      sortOrder: existing.length,
    })
    .returning();
  return knowledgeOut(created!);
}

export async function updateLiveKnowledge(
  businessId: string,
  sessionId: string,
  entryId: string,
  input: { title?: string; content?: string },
): Promise<LiveKnowledgeOut> {
  await getLiveSessionForBusiness(businessId, sessionId);
  const row = await db.query.liveKnowledgeEntries.findFirst({
    where: and(eq(liveKnowledgeEntries.id, entryId), eq(liveKnowledgeEntries.sessionId, sessionId)),
  });
  if (!row) throw httpError("Talking point not found", 404);
  const [updated] = await db
    .update(liveKnowledgeEntries)
    .set({
      title: input.title !== undefined ? input.title.trim().slice(0, 160) : row.title,
      content: input.content !== undefined ? input.content.trim().slice(0, 2000) : row.content,
      updatedAt: new Date(),
    })
    .where(eq(liveKnowledgeEntries.id, entryId))
    .returning();
  return knowledgeOut(updated!);
}

export async function deleteLiveKnowledge(
  businessId: string,
  sessionId: string,
  entryId: string,
): Promise<void> {
  await getLiveSessionForBusiness(businessId, sessionId);
  await db
    .delete(liveKnowledgeEntries)
    .where(and(eq(liveKnowledgeEntries.id, entryId), eq(liveKnowledgeEntries.sessionId, sessionId)));
}

export async function listLiveMessages(sessionId: string): Promise<LiveMessageOut[]> {
  const rows = await db
    .select()
    .from(liveMessages)
    .where(eq(liveMessages.sessionId, sessionId))
    .orderBy(asc(liveMessages.createdAt))
    .limit(200);
  return rows.map(messageOut);
}

export async function postLiveMessage(input: {
  sessionId: string;
  role: "viewer" | "host" | "ai" | "system";
  displayName: string;
  body: string;
  productId?: string | null;
}): Promise<LiveMessageOut> {
  const body = input.body.trim().slice(0, 500);
  if (!body) throw httpError("Message is required", 400);
  const [created] = await db
    .insert(liveMessages)
    .values({
      sessionId: input.sessionId,
      role: input.role,
      displayName: input.displayName.trim().slice(0, 80) || "Guest",
      body,
      productId: input.productId ?? null,
    })
    .returning();
  const out = messageOut(created!);
  broadcastLive(input.sessionId, { type: "chat.message", message: out });
  return out;
}

const lastAiAt = new Map<string, number>();
const lastChatReplyAt = new Map<string, number>();
const answeringChat = new Set<string>();
const CHAT_PITCH_PAUSE_MS = 45_000;

function isChatAck(text: string) {
  return /^(ok+|oke+|okay|thanks|thx|ty|lol|haha|sip|mantap|nice|cool|👍|🙏)+[!.,\s]*$/i.test(
    text.trim(),
  );
}

const LIVE_TEXT_MODELS = [
  process.env.GEMINI_TEXT_MODEL,
  "gemini-3.6-flash",
  "gemini-3.1-flash",
  "gemini-2.5-flash",
].filter((model, index, all): model is string => {
    if (!model) return false;
    return !/live-preview/i.test(model) && all.indexOf(model) === index;
  });

let textQuotaUntil = 0;
let ttsQuotaUntil = 0;

function isQuotaError(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const status = Number((err as { status?: number }).status);
  const message = err instanceof Error ? err.message : String(err);
  return status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message);
}

function matchProductFromText(products: LiveProductOut[], text: string) {
  const q = text.toLowerCase();
  const exact = products.find((product) => q.includes(product.name.toLowerCase()));
  if (exact) return exact;
  let best: LiveProductOut | null = null;
  let bestHits = 0;
  for (const product of products) {
    const tokens = product.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2);
    const hits = tokens.filter((token) => q.includes(token)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = product;
    }
  }
  return bestHits > 0 ? best : null;
}

async function loadRecentChat(sessionId: string, limit = 16) {
  const rows = await db
    .select({
      role: liveMessages.role,
      displayName: liveMessages.displayName,
      body: liveMessages.body,
      productId: liveMessages.productId,
    })
    .from(liveMessages)
    .where(eq(liveMessages.sessionId, sessionId))
    .orderBy(desc(liveMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

type LiveChatRow = {
  role: string;
  displayName: string;
  body: string;
  productId?: string | null;
};

function taggedProductFromChat(session: LiveSessionOut, recent: LiveChatRow[]) {
  const latest = [...recent].reverse().find((row) => row.role === "viewer" || row.role === "host");
  if (!latest?.productId) return null;
  return session.products.find((product) => product.id === latest.productId) ?? null;
}

function formatChatTranscript(rows: LiveChatRow[]) {
  return rows
    .map((row) => `${row.displayName || row.role}: ${row.body}`)
    .join("\n");
}

function fallbackLiveReply(
  session: LiveSessionOut,
  latest: string,
  recent: LiveChatRow[] = [],
): { text: string; productId: string | null } {
  const historyText = `${latest}\n${recent
    .filter((row) => row.role !== "ai")
    .map((row) => row.body)
    .join("\n")}`;
  const mentioned =
    taggedProductFromChat(session, recent) ?? matchProductFromText(session.products, historyText);
  const askingPrice = /harga|price|berapa|how much|rp\b/i.test(latest);
  const askingWhat =
    /jual apa|apa aja|what do you sell|what('s| is) on|catalog|ada apa|produk apa/i.test(latest);
  const catalogLine = session.products.length
    ? session.products
        .map((product) => `${product.name} (${formatLivePrice(product.price)})`)
        .join(", ")
    : "";
  if (askingPrice && mentioned) {
    return {
      text: `${mentioned.name} is ${formatLivePrice(mentioned.price)}. Tap Buy Now to order.`,
      productId: mentioned.id,
    };
  }
  if (askingPrice && catalogLine) {
    return {
      text: `Which product? On this LIVE: ${catalogLine}.`,
      productId: null,
    };
  }
  if (askingWhat && catalogLine) {
    return {
      text: `On this LIVE we are selling ${catalogLine}. Ask me the price of one.`,
      productId: null,
    };
  }
  const askingAbout = /tell me about|more about/i.test(latest);
  if (askingAbout && mentioned) {
    const what = mentioned.description.trim() || "on the show now";
    return {
      text: `${mentioned.name} — ${what}. ${formatLivePrice(mentioned.price)}. Tap Buy Now if you want it.`,
      productId: mentioned.id,
    };
  }
  if (mentioned) {
    const what = mentioned.description.trim();
    if (what) {
      return {
        text: `You asked: "${latest.slice(0, 120)}". ${mentioned.name} — ${what}. ${formatLivePrice(mentioned.price)}. That's all the listing says.`,
        productId: mentioned.id,
      };
    }
    return {
      text: `You asked: "${latest.slice(0, 120)}". ${mentioned.name} is ${formatLivePrice(mentioned.price)}. I don't have more details than the LIVE listing.`,
      productId: mentioned.id,
    };
  }
  if (catalogLine) {
    return {
      text: `That is not on this LIVE. We have ${catalogLine}.`,
      productId: null,
    };
  }
  return {
    text: "I can only sell the products on this LIVE. Tell me which one you want.",
    productId: null,
  };
}

async function generateLiveReply(
  session: LiveSessionOut,
  latest: string,
): Promise<{ text: string; productId: string | null } | null> {
  const recent = await loadRecentChat(session.id);
  const transcript = formatChatTranscript(recent);
  const tagged = taggedProductFromChat(session, recent);
  const apiKey = await resolveGeminiApiKeyForBusiness(session.business_id);
  if (!apiKey) return fallbackLiveReply(session, latest, recent);
  const rules = await db.query.aiRules.findFirst({
    where: eq(aiRules.businessId, session.business_id),
  });
  const notes = await loadLiveKnowledge(session.id);
  const catalog = session.products
    .map((p) => `- ${p.name} (${formatLivePrice(p.price)}): ${p.description || "no description"}`)
    .join("\n");
  const facts = liveFacts(notes);
  const client = new GoogleGenAI({ apiKey });
  const prompt = `You are ${rules?.assistantName || "Alex"}, the AI host of a LIVE shopping show.
Answer the live chat. Do not hallucinate.

Latest message you must answer: ${JSON.stringify(latest)}
${tagged ? `Viewer tapped Add to live chat for this product — pitch it from the listing only: ${tagged.name}` : ""}

Live chat transcript (read this — this is what people actually said):
${transcript || "(empty)"}

Only these products exist. Never invent others:
${catalog || "(no products on the show)"}

Promo notes — mention ONLY if the viewer asked about that promo:
${facts || "(none)"}

Rules:
- Read the transcript. Answer the latest chat line in the same language. Do not ignore it.
- If they ask price, give the listed price for that product.
- If they ask what you sell, list the products on the show.
- If they ask a product question (who can use it, ingredients, color, etc.), answer only from that product's listed description. If the listing does not say, say you do not have that detail — do not invent.
- If a product is not on the list, say it is not on this LIVE.
- 1-3 short sentences. No welcome speech. No unrelated flash-deal pitch.`;
  if (Date.now() < textQuotaUntil) return fallbackLiveReply(session, latest, recent);
  try {
    let text = "";
    for (const model of LIVE_TEXT_MODELS) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: [{ parts: [{ text: prompt }] }],
        });
        text = response.text?.trim() ?? "";
        if (text) break;
      } catch (err) {
        if (isQuotaError(err)) {
          textQuotaUntil = Date.now() + 60_000;
          console.warn("[live] Gemini text quota hit, using catalog fallback");
          break;
        }
        console.warn("[live] Gemini host reply failed", model, err);
      }
    }
    if (!text) return fallbackLiveReply(session, latest, recent);
    const mentioned =
      tagged ??
      matchProductFromText(session.products, `${latest} ${text}`) ??
      session.products.find((p) => text.toLowerCase().includes(p.name.toLowerCase())) ??
      null;
    return { text: text.slice(0, 400), productId: mentioned?.id ?? null };
  } catch (err) {
    if (isQuotaError(err)) textQuotaUntil = Date.now() + 60_000;
    console.warn("[live] Gemini host reply failed, using catalog fallback", err);
    return fallbackLiveReply(session, latest, recent);
  }
}

async function liveTtsModels() {
  const row = await db.query.platformSettings.findFirst({
    where: eq(platformSettings.key, "default_tts_model"),
  });
  return [
    row?.value?.trim(),
    process.env.GEMINI_TTS_MODEL,
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
  ].filter((model, index, all): model is string => Boolean(model) && all.indexOf(model) === index);
}

const ttsCache = new Map<string, { buffer: Buffer; durationSeconds: number }>();

async function tryLiveTts(session: LiveSessionOut, text: string) {
  const rules = await db.query.aiRules.findFirst({
    where: eq(aiRules.businessId, session.business_id),
  });
  const voice = getVoicePresetGeminiVoice(rules?.voicePreset, rules?.voiceGender);
  const cacheKey = `${voice}::${text}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) return cached;
  if (Date.now() < ttsQuotaUntil) return null;
  const apiKey = await resolveGeminiApiKeyForBusiness(session.business_id);
  if (!apiKey) return null;
  for (const model of await liveTtsModels()) {
    try {
      const tts = await synthesizeSpeechWav(text, voice, model, apiKey);
      if (!tts) continue;
      if (ttsCache.size > 24) ttsCache.clear();
      ttsCache.set(cacheKey, tts);
      return tts;
    } catch (err) {
      if (isQuotaError(err)) {
        ttsQuotaUntil = Date.now() + 60_000;
        return null;
      }
      console.warn("[live] TTS failed", model, err);
    }
  }
  return null;
}

async function speakLiveLine(session: LiveSessionOut, text: string) {
  const line = text.trim();
  if (!line) return;
  try {
    const rules = await db.query.aiRules.findFirst({
      where: eq(aiRules.businessId, session.business_id),
    });
    const voiced = await speakWithGeminiLive({
      sessionId: session.id,
      apiKey: await resolveGeminiApiKeyForBusiness(session.business_id),
      text: line,
      voiceName: getVoicePresetGeminiVoice(rules?.voicePreset, rules?.voiceGender),
      assistantName: rules?.assistantName || "Alex",
      onPcm: (pcm) => broadcastLiveBinary(session.id, pcm),
    });
    if (voiced) return;
  } catch (err) {
    console.warn("[live] Gemini Live voice failed", err);
  }
  try {
    const tts = await tryLiveTts(session, line);
    if (tts) {
      broadcastLive(session.id, {
        type: "ai.audio",
        wav_base64: tts.buffer.toString("base64"),
        duration_seconds: tts.durationSeconds,
      });
      return;
    }
  } catch (err) {
    if (isQuotaError(err)) ttsQuotaUntil = Date.now() + 60_000;
    console.warn("[live] TTS failed", err);
  }
  broadcastLive(session.id, { type: "ai.speak", text: line });
}

async function publishAiLine(
  session: LiveSessionOut,
  reply: { text: string; productId: string | null },
) {
  lastAiAt.set(session.id, Date.now());
  await postLiveMessage({
    sessionId: session.id,
    role: "ai",
    displayName: "AI Host",
    body: reply.text,
    productId: reply.productId,
  });
  if (reply.productId) {
    const product = session.products.find((p) => p.id === reply.productId);
    if (product) broadcastLive(session.id, { type: "product.show", product });
  }
  void speakLiveLine(session, reply.text);
}

const HOST_INTERVAL_MS = 40_000;
const hostTicks = new Map<string, ReturnType<typeof setInterval>>();
const hostCursor = new Map<string, number>();
const hostWelcomed = new Set<string>();

function resetHostNarration(sessionId: string) {
  hostWelcomed.delete(sessionId);
  hostCursor.delete(sessionId);
  lastChatReplyAt.delete(sessionId);
  answeringChat.delete(sessionId);
}

function stopLiveHostLoop(sessionId: string) {
  const timer = hostTicks.get(sessionId);
  if (timer) clearInterval(timer);
  hostTicks.delete(sessionId);
  stopLiveHostVoice(sessionId);
}

function startLiveHostLoop(sessionId: string) {
  if (hostTicks.has(sessionId)) return;
  void maybeLiveHostLine(sessionId, hostWelcomed.has(sessionId) ? "tick" : "welcome").catch(
    (err) => console.warn("[live] host line failed", err),
  );
  hostTicks.set(
    sessionId,
    setInterval(() => {
      void maybeLiveHostLine(sessionId, "tick").catch((err) =>
        console.warn("[live] host tick failed", err),
      );
    }, HOST_INTERVAL_MS),
  );
}

export function syncLiveHostLoop(sessionId: string) {
  if (liveRoomViewerCount(sessionId) > 0) startLiveHostLoop(sessionId);
  else stopLiveHostLoop(sessionId);
}

function formatLivePrice(price: number) {
  return `Rp${price.toLocaleString("id-ID")}`;
}

function featuredProduct(session: LiveSessionOut, index: number) {
  if (!session.products.length) return null;
  return session.products[index % session.products.length] ?? null;
}

function productPitch(
  session: LiveSessionOut,
  product: LiveProductOut,
  kind: "welcome" | "tick",
): string {
  const what = product.description.trim() || "on the show now";
  const price = formatLivePrice(product.price);
  if (kind === "welcome") {
    const others = session.products.filter((item) => item.id !== product.id).map((item) => item.name);
    const also = others.length ? ` Also on the show: ${others.join(", ")}.` : "";
    return `${product.name} — ${what}. ${price}. Tap Buy Now.${also}`.slice(0, 280);
  }
  return `${product.name} is ${price}. ${what}. Tap Buy Now if you want it.`.slice(0, 280);
}

function fallbackHostLine(
  session: LiveSessionOut,
  kind: "welcome" | "tick",
  index: number,
): { text: string; productId: string | null } {
  const product = featuredProduct(session, index);
  if (product) {
    return { text: productPitch(session, product, kind), productId: product.id };
  }
  return {
    text: kind === "welcome" ? `We're live with ${session.title}.` : "Drop a question in chat if you want a price.",
    productId: null,
  };
}

async function recentHostLines(sessionId: string, startedAt: Date | null): Promise<string[]> {
  const rows = await db
    .select({ body: liveMessages.body, createdAt: liveMessages.createdAt })
    .from(liveMessages)
    .where(and(eq(liveMessages.sessionId, sessionId), eq(liveMessages.role, "ai")))
    .orderBy(desc(liveMessages.createdAt))
    .limit(8);
  return rows
    .filter((row) => !startedAt || row.createdAt >= startedAt)
    .map((row) => row.body)
    .reverse();
}

async function generateLiveHostLine(
  session: LiveSessionOut,
  kind: "welcome" | "tick",
  startedAt: Date | null,
): Promise<{ text: string; productId: string | null } | null> {
  const notes = await loadLiveKnowledge(session.id);
  const index = hostCursor.get(session.id) ?? 0;
  hostCursor.set(session.id, index + 1);
  const apiKey = await resolveGeminiApiKeyForBusiness(session.business_id);
  if (!apiKey) return fallbackHostLine(session, kind, index);
  const rules = await db.query.aiRules.findFirst({
    where: eq(aiRules.businessId, session.business_id),
  });
  const catalog = session.products
    .map((p) => `- ${p.name} (${formatLivePrice(p.price)}): ${p.description || "no description"}`)
    .join("\n");
  const feature = featuredProduct(session, index);
  const recent = await recentHostLines(session.id, startedAt);
  const facts = liveFacts(notes);
  const client = new GoogleGenAI({ apiKey });
  const prompt = `You are ${rules?.assistantName || "Alex"}, hosting a LIVE shopping show "${session.title}" for ${session.business_name}.
Your job is to sell the products on the show. 1-2 short sentences. Energetic, not spammy.

${
  kind === "welcome"
    ? "First line of this airing: skip a long welcome. Briefly say you're live, then explain what you are selling — product name, what it is, price."
    : "Do NOT welcome viewers. Do NOT say 'welcome to the flash sale'. Pitch the featured product as if you are holding it up on camera."
}
Feature this product this turn: ${
    feature
      ? `${feature.name} (${formatLivePrice(feature.price)}) — ${feature.description || "no description"}`
      : "(no product — invite them to watch)"
  }
Products on the show:
${catalog || "(none)"}
Optional promo notes (use at most a short clause, never as the whole line, never if already said recently):
${facts || "(none)"}
Recent host lines — do not repeat or paraphrase them:
${recent.length ? recent.map((line) => `- ${line}`).join("\n") : "(none)"}
Name the product exactly as listed.`;
  if (Date.now() < textQuotaUntil) return fallbackHostLine(session, kind, index);
  try {
    let text = "";
    for (const model of LIVE_TEXT_MODELS) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: [{ parts: [{ text: prompt }] }],
        });
        text = response.text?.trim() ?? "";
        if (text) break;
      } catch (err) {
        if (isQuotaError(err)) {
          textQuotaUntil = Date.now() + 60_000;
          console.warn("[live] Gemini host line quota hit, using product pitch fallback");
          break;
        }
        console.warn("[live] Gemini host line failed", model, err);
      }
    }
    if (!text) return fallbackHostLine(session, kind, index);
    const mentioned =
      session.products.find((p) => text.toLowerCase().includes(p.name.toLowerCase())) ??
      feature ??
      null;
    return { text: text.slice(0, 400), productId: mentioned?.id ?? null };
  } catch (err) {
    if (isQuotaError(err)) textQuotaUntil = Date.now() + 60_000;
    console.warn("[live] Gemini host line failed, using product pitch fallback", err);
    return fallbackHostLine(session, kind, index);
  }
}

async function latestUnansweredChat(sessionId: string): Promise<string | null> {
  const rows = await db
    .select({ role: liveMessages.role, body: liveMessages.body })
    .from(liveMessages)
    .where(eq(liveMessages.sessionId, sessionId))
    .orderBy(desc(liveMessages.createdAt))
    .limit(12);
  for (const row of rows) {
    if (row.role === "ai") return null;
    if (row.role === "viewer" || row.role === "host") {
      const body = row.body.trim();
      if (body.length >= 2 && !isChatAck(body)) return body;
    }
  }
  return null;
}

export async function maybeLiveHostLine(sessionId: string, kind: "welcome" | "tick") {
  try {
    const row = await db.query.liveSessions.findFirst({
      where: eq(liveSessions.id, sessionId),
    });
    if (row?.status !== "live") {
      stopLiveHostLoop(sessionId);
      return;
    }
    if (liveRoomViewerCount(sessionId) < 1) {
      stopLiveHostLoop(sessionId);
      return;
    }
    if (answeringChat.has(sessionId)) return;
    const unanswered = await latestUnansweredChat(sessionId);
    if (unanswered) {
      const before = lastAiAt.get(sessionId) ?? 0;
      await maybeLiveAiReply(sessionId, unanswered);
      if ((lastAiAt.get(sessionId) ?? 0) !== before) return;
    }
    const now = Date.now();
    const last = lastAiAt.get(sessionId) ?? 0;
    if (now - last < 20_000) return;
    const lastChat = lastChatReplyAt.get(sessionId) ?? 0;
    if (kind === "tick" && now - lastChat < CHAT_PITCH_PAUSE_MS) return;
    let nextKind = kind;
    if (nextKind === "welcome" && hostWelcomed.has(sessionId)) nextKind = "tick";
    if (nextKind === "welcome") {
      const spoken = await recentHostLines(sessionId, row.startedAt);
      if (spoken.length) {
        hostWelcomed.add(sessionId);
        nextKind = "tick";
      }
    }
    const session = await sessionOut(row);
    const chatBefore = lastChatReplyAt.get(sessionId) ?? 0;
    const reply = await generateLiveHostLine(session, nextKind, row.startedAt);
    if (!reply) return;
    if (answeringChat.has(sessionId)) return;
    if ((lastChatReplyAt.get(sessionId) ?? 0) !== chatBefore) return;
    const stillUnanswered = await latestUnansweredChat(sessionId);
    if (stillUnanswered) {
      const before = lastAiAt.get(sessionId) ?? 0;
      await maybeLiveAiReply(sessionId, stillUnanswered);
      if ((lastAiAt.get(sessionId) ?? 0) !== before) return;
    }
    hostWelcomed.add(sessionId);
    await publishAiLine(session, reply);
  } catch (err) {
    console.warn("[live] host line failed", err);
  }
}

export async function maybeLiveAiReply(sessionId: string, viewerText: string) {
  const text = viewerText.trim();
  if (text.length < 2 || isChatAck(text)) return;
  if (answeringChat.has(sessionId)) return;
  answeringChat.add(sessionId);
  try {
    const row = await db.query.liveSessions.findFirst({
      where: eq(liveSessions.id, sessionId),
    });
    if (row?.status !== "live") return;
    const session = await sessionOut(row);
    const reply = await generateLiveReply(session, text);
    if (!reply) return;
    await publishAiLine(session, reply);
    lastChatReplyAt.set(sessionId, Date.now());
  } catch (err) {
    console.warn("[live] AI reply failed", err);
  } finally {
    answeringChat.delete(sessionId);
  }
}

type LiveSocket = { ws: SocketBridge; role: "host" | "viewer" };
const rooms = new Map<string, Set<LiveSocket>>();

export function joinLiveRoom(sessionId: string, role: "host" | "viewer", ws: SocketBridge) {
  let room = rooms.get(sessionId);
  if (!room) {
    room = new Set();
    rooms.set(sessionId, room);
  }
  const client: LiveSocket = { ws, role };
  room.add(client);
  broadcastLive(sessionId, { type: "viewer.count", count: liveRoomViewerCount(sessionId) });
  syncLiveHostLoop(sessionId);
  ws.on("close", () => {
    room?.delete(client);
    broadcastLive(sessionId, { type: "viewer.count", count: liveRoomViewerCount(sessionId) });
    syncLiveHostLoop(sessionId);
  });
  return client;
}

export function liveRoomViewerCount(sessionId: string) {
  const room = rooms.get(sessionId);
  if (!room) return 0;
  return [...room].filter((c) => c.role === "viewer").length;
}

export function broadcastLive(sessionId: string, payload: Record<string, unknown>) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const data = JSON.stringify(payload);
  for (const client of room) {
    if (client.ws.readyState === 1) client.ws.send(data);
  }
}

export function broadcastLiveBinary(sessionId: string, pcm: Buffer) {
  const room = rooms.get(sessionId);
  if (!room || pcm.length < 2) return;
  for (const client of room) {
    if (client.ws.readyState === 1) client.ws.send(pcm);
  }
}
