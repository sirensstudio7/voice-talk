import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { orderItems } from "../db/schema.js";
import { env } from "../env.js";
import {
  buildValidatedOrderSnapshot,
  OrderValidationError,
  persistConfirmedOrder,
} from "../services/order-persistence.js";
import { effectivePrice, serializeUtcDatetime } from "../services/pricing.js";
import {
  getActiveProducts,
  resolveAssistantName,
} from "../services/config-builder.js";
import { getBusinessBySlug, mapBusinessRow } from "../services/tenant.js";

function orderToOut(order: {
  id: string;
  status: string;
  total: number;
  customerName: string | null;
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

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/businesses/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const business = await getBusinessBySlug(slug);
    if (!business) return reply.status(404).send({ detail: "Business not found" });
    return mapBusinessRow(business);
  });

  app.get("/businesses/:slug/payment", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const business = await getBusinessBySlug(slug);
    if (!business) return reply.status(404).send({ detail: "Business not found" });
    return { payment_qr_url: business.paymentQrUrl || "" };
  });

  app.post("/businesses/:slug/orders/confirm", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = request.body as { items: Array<{ product_id: string; quantity: number }> };
    const business = await getBusinessBySlug(slug);
    if (!business) return reply.status(404).send({ detail: "Business not found" });

    try {
      const snapshot = buildValidatedOrderSnapshot(
        getActiveProducts(business),
        body.items.map((i) => ({ productId: i.product_id, quantity: i.quantity })),
      );
      const order = await persistConfirmedOrder(business.id, null, snapshot);
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      return orderToOut({ ...order, items });
    } catch (exc) {
      if (exc instanceof OrderValidationError) {
        return reply.status(400).send({ detail: exc.detail });
      }
      throw exc;
    }
  });

  app.get("/menu", async (request, reply) => {
    const query = request.query as { business?: string };
    const slug = query.business || env.DEFAULT_BUSINESS_SLUG;
    const tenant = await getBusinessBySlug(slug);
    if (!tenant) return reply.status(404).send({ detail: "Business not found" });

    const productList = getActiveProducts(tenant);
    return {
      business: tenant.name,
      slug: tenant.slug,
      tagline: tenant.tagline,
      assistant_name: resolveAssistantName(tenant.aiRules),
      background_url: tenant.backgroundUrl || "",
      gradient_color: tenant.gradientColor || "",
      products: productList.map((p) => ({
        id: p.productId,
        name: p.name,
        price: effectivePrice(p.price, p.discountPercent),
        original_price: p.discountPercent > 0 ? p.price : null,
        discount_percent: p.discountPercent,
        category: p.category,
        description: p.description,
        image_url: p.imageUrl,
      })),
    };
  });
}
