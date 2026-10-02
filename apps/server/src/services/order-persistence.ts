import { mergeTranscriptChunk } from "@voicetalk/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { postgresErrorCode } from "../db/errors.js";
import {
  orderItems,
  orders,
  transcriptMessages,
  voiceSessions,
  type Product,
} from "../db/schema.js";
import { effectivePrice } from "./pricing.js";

/** Client idempotency key shape accepted for order confirmation (TKT-018). */
const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;

export function normalizeClientRequestId(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return CLIENT_REQUEST_ID_RE.test(raw) ? raw : null;
}

export class OrderValidationError extends Error {
  constructor(public detail: string) {
    super(detail);
  }
}

export async function createVoiceSession(
  businessId: string,
  kioskDisplayId?: string | null,
) {
  const [session] = await db
    .insert(voiceSessions)
    .values({
      businessId,
      status: "active",
      ...(kioskDisplayId ? { kioskDisplayId } : {}),
    })
    .returning();
  return session!;
}

export async function saveTranscriptMessage(
  sessionId: string,
  role: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const [last] = await db
    .select()
    .from(transcriptMessages)
    .where(eq(transcriptMessages.voiceSessionId, sessionId))
    .orderBy(desc(transcriptMessages.createdAt))
    .limit(1);

  if (last?.role === role) {
    const merged = mergeTranscriptChunk(last.text, trimmed);
    if (merged === last.text) return;
    await db
      .update(transcriptMessages)
      .set({ text: merged })
      .where(eq(transcriptMessages.id, last.id));
    return;
  }

  await db.insert(transcriptMessages).values({
    voiceSessionId: sessionId,
    role,
    text: trimmed,
  });
}

export async function endVoiceSession(
  sessionId: string,
  endReason?: string | null,
): Promise<void> {
  await db
    .update(voiceSessions)
    .set({
      status: "ended",
      endedAt: new Date(),
      ...(endReason ? { endReason } : {}),
    })
    .where(and(eq(voiceSessions.id, sessionId), isNull(voiceSessions.endedAt)));
}

export function buildValidatedOrderSnapshot(
  productList: Product[],
  items: Array<{ productId: string; quantity: number }>,
): Record<string, unknown> {
  const productMap = new Map(productList.map((p) => [p.productId, p]));
  const validatedItems: Array<Record<string, unknown>> = [];

  for (const { productId, quantity } of items) {
    const product = productMap.get(productId);
    if (!product) throw new OrderValidationError(`Product '${productId}' not found.`);

    const price = effectivePrice(product.price, product.discountPercent);
    validatedItems.push({
      product_id: product.productId,
      name: product.name,
      price,
      quantity,
      subtotal: Math.round(price * quantity * 100) / 100,
    });
  }

  if (!validatedItems.length) {
    throw new OrderValidationError("Cannot confirm an empty order.");
  }

  const total = Math.round(
    validatedItems.reduce((sum, item) => sum + Number(item.subtotal), 0) * 100,
  ) / 100;

  return { status: "confirmed", items: validatedItems, total };
}

export async function persistConfirmedOrder(
  businessId: string,
  voiceSessionId: string | null,
  orderSnapshot: Record<string, unknown>,
  extras?: { liveSessionId?: string | null; clientRequestId?: string | null },
) {
  const clientRequestId = normalizeClientRequestId(extras?.clientRequestId);

  // Replay of an already-confirmed request returns the original order.
  if (clientRequestId) {
    const existing = await findOrderByClientRequest(businessId, clientRequestId);
    if (existing) {
      return { ...existing, items: await listOrderItems(existing.id), replayed: true };
    }
  }

  const customerName = orderSnapshot.customer_name;
  const customerPhone = String(orderSnapshot.customer_phone ?? "").trim().slice(0, 50);
  const customerAddress = String(orderSnapshot.customer_address ?? "").trim().slice(0, 500);
  const customerNotes = String(orderSnapshot.customer_notes ?? "").trim().slice(0, 500);

  try {
    // Order + items commit together so a retry never sees a half-written order.
    return await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          businessId,
          voiceSessionId: voiceSessionId ?? undefined,
          liveSessionId: extras?.liveSessionId ?? undefined,
          clientRequestId: clientRequestId ?? undefined,
          status: "confirmed",
          total: Number(orderSnapshot.total ?? 0),
          customerName:
            customerName != null && String(customerName).trim()
              ? String(customerName).trim()
              : undefined,
          customerPhone,
          customerAddress,
          customerNotes,
          confirmedAt: new Date(),
        })
        .returning();

      for (const item of (orderSnapshot.items as Array<Record<string, unknown>>) ?? []) {
        await tx.insert(orderItems).values({
          orderId: order!.id,
          productId: String(item.product_id),
          name: String(item.name),
          price: Number(item.price),
          quantity: Number(item.quantity),
        });
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order!.id));
      return { ...order!, items, replayed: false };
    });
  } catch (error) {
    // Concurrent confirm with the same key: the loser reads the winner's order.
    if (clientRequestId && postgresErrorCode(error) === "23505") {
      const existing = await findOrderByClientRequest(businessId, clientRequestId);
      if (existing) {
        return { ...existing, items: await listOrderItems(existing.id), replayed: true };
      }
    }
    throw error;
  }
}

async function findOrderByClientRequest(businessId: string, clientRequestId: string) {
  return db.query.orders.findFirst({
    where: and(eq(orders.businessId, businessId), eq(orders.clientRequestId, clientRequestId)),
  });
}

async function listOrderItems(orderId: string) {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

export async function updateOrderCustomerName(
  voiceSessionId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const order = await db.query.orders.findFirst({
    where: (o, { and, eq: eqFn }) =>
      and(eqFn(o.voiceSessionId, voiceSessionId), eqFn(o.status, "confirmed")),
    orderBy: desc(orders.confirmedAt),
  });
  if (!order) return;

  await db.update(orders).set({ customerName: trimmed }).where(eq(orders.id, order.id));
}
