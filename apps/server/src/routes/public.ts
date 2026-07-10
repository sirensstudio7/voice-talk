import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getBusinessCapabilities } from "@voicetalk/shared";
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
import {
  createAppointment,
  getAvailableSlots,
  listAppointments,
} from "../services/appointments.js";

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

    const capabilities = getBusinessCapabilities(business.primaryUseCase, business.businessType);
    if (!capabilities.ordering_enabled) {
      return reply.status(403).send({ detail: "Ordering is not enabled for this business." });
    }

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

    const capabilities = getBusinessCapabilities(tenant.primaryUseCase, tenant.businessType);
    const productList = capabilities.menu_enabled ? getActiveProducts(tenant) : [];
    return {
      business: tenant.name,
      slug: tenant.slug,
      tagline: tenant.tagline,
      business_type: tenant.businessType,
      assistant_name: resolveAssistantName(tenant.aiRules),
      avatar_url: tenant.aiRules?.avatarUrl || "",
      background_url: tenant.backgroundUrl || "",
      gradient_color: tenant.gradientColor || "",
      capabilities,
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

  app.get("/businesses/:slug/availability", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { product_id: productId, date } = request.query as {
      product_id?: string;
      date?: string;
    };
    const business = await getBusinessBySlug(slug);
    if (!business) return reply.status(404).send({ detail: "Business not found" });
    if (!productId || !date) {
      return reply.status(400).send({ detail: "product_id and date are required." });
    }

    try {
      const slots = await getAvailableSlots({
        businessId: business.id,
        productId,
        date,
      });
      return { slots };
    } catch (error) {
      return reply.status(400).send({
        detail: error instanceof Error ? error.message : "Could not load availability.",
      });
    }
  });

  app.post("/businesses/:slug/appointments", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = request.body as {
      product_id?: string;
      customer_name?: string;
      customer_phone?: string;
      starts_at?: string;
    };
    const business = await getBusinessBySlug(slug);
    if (!business) return reply.status(404).send({ detail: "Business not found" });

    const capabilities = getBusinessCapabilities(business.primaryUseCase, business.businessType);
    if (!capabilities.booking_enabled) {
      return reply.status(403).send({ detail: "Booking is not enabled for this business." });
    }

    try {
      const appointment = await createAppointment({
        businessId: business.id,
        productId: String(body.product_id ?? ""),
        customerName: String(body.customer_name ?? ""),
        customerPhone: String(body.customer_phone ?? ""),
        startsAt: String(body.starts_at ?? ""),
      });
      return reply.status(201).send(appointment);
    } catch (error) {
      return reply.status(400).send({
        detail: error instanceof Error ? error.message : "Could not create appointment.",
      });
    }
  });
}
