import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  orderItems,
  orders,
  transcriptMessages,
  voiceSessions,
  type Product,
} from "../db/schema.js";
import { effectivePrice } from "./pricing.js";

export class OrderValidationError extends Error {
  constructor(public detail: string) {
    super(detail);
  }
}

export async function createVoiceSession(businessId: string) {
  const [session] = await db
    .insert(voiceSessions)
    .values({ businessId, status: "active" })
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
  await db.insert(transcriptMessages).values({
    voiceSessionId: sessionId,
    role,
    text: trimmed,
  });
}

export async function endVoiceSession(sessionId: string): Promise<void> {
  await db
    .update(voiceSessions)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(voiceSessions.id, sessionId));
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
) {
  const customerName = orderSnapshot.customer_name;
  const [order] = await db
    .insert(orders)
    .values({
      businessId,
      voiceSessionId: voiceSessionId ?? undefined,
      status: "confirmed",
      total: Number(orderSnapshot.total ?? 0),
      customerName:
        customerName != null && String(customerName).trim()
          ? String(customerName).trim()
          : undefined,
      confirmedAt: new Date(),
    })
    .returning();

  for (const item of (orderSnapshot.items as Array<Record<string, unknown>>) ?? []) {
    await db.insert(orderItems).values({
      orderId: order!.id,
      productId: String(item.product_id),
      name: String(item.name),
      price: Number(item.price),
      quantity: Number(item.quantity),
    });
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order!.id));
  return { ...order!, items };
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
