import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { resolve } from "node:path";
import { db, closeDb } from "../src/db/client.js";
import {
  businesses,
  orderItems,
  orders,
  products,
  transcriptMessages,
  voiceSessions,
} from "../src/db/schema.js";
import { PRODUCTS } from "../src/seed-data.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), "../../.env.local"), override: true });
config();

const CUSTOMER_NAMES = [
  "Rina",
  "Budi",
  "Siti",
  "Agus",
  "Dewi",
  "Fajar",
  "Maya",
  "Hendra",
  "Putri",
  "Andi",
  "Lestari",
  "Rizky",
];

const USER_LINES = [
  "Halo, saya mau pesan latte.",
  "Bisa tambah croissant?",
  "Satu cappuccino dingin ya.",
  "Berapa totalnya?",
  "Nama saya {name}.",
];

const ASSISTANT_LINES = [
  "Selamat datang di Sunrise Coffee! Mau pesan apa hari ini?",
  "Baik, latte sudah ditambahkan.",
  "Tentu, croissant butter sudah masuk pesanan.",
  "Total pesanan Anda Rp {total}.",
  "Terima kasih, {name}. Pesanan sedang diproses.",
];

type ProductRow = typeof products.$inferSelect;

async function syncProductPrices(businessId: string) {
  const catalog = await db.query.products.findMany({
    where: eq(products.businessId, businessId),
  });
  const priceByProductId = new Map(PRODUCTS.map((item) => [item.id, item.price]));

  for (const item of catalog) {
    const expectedPrice = priceByProductId.get(item.productId);
    if (expectedPrice != null && item.price !== expectedPrice) {
      await db
        .update(products)
        .set({ price: expectedPrice })
        .where(eq(products.id, item.id));
    }
  }
}

function startOfUtcDay(date = new Date()): Date {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function pickProducts(catalog: ProductRow[], count: number): ProductRow[] {
  const shuffled = [...catalog].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

async function clearAnalytics(businessId: string) {
  const businessOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.businessId, businessId));
  const orderIds = businessOrders.map((row) => row.id);

  if (orderIds.length > 0) {
    await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
  }
  await db.delete(orders).where(eq(orders.businessId, businessId));

  const sessions = await db
    .select({ id: voiceSessions.id })
    .from(voiceSessions)
    .where(eq(voiceSessions.businessId, businessId));
  const sessionIds = sessions.map((row) => row.id);

  if (sessionIds.length > 0) {
    await db.delete(transcriptMessages).where(inArray(transcriptMessages.voiceSessionId, sessionIds));
  }
  await db.delete(voiceSessions).where(eq(voiceSessions.businessId, businessId));
}

async function seedDemoAnalytics() {
  const force = process.argv.includes("--force");
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.slug, "sunrise-coffee"),
  });

  if (!business) {
    console.error("Business sunrise-coffee not found. Run npm run seed:db first.");
    process.exit(1);
  }

  await syncProductPrices(business.id);

  let catalog = await db.query.products.findMany({
    where: eq(products.businessId, business.id),
  });

  const [existingOrders] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.businessId, business.id));

  if (Number(existingOrders?.count ?? 0) > 0 && !force) {
    console.log("Analytics data already exists. Use --force to replace.");
    await closeDb();
    return;
  }

  if (catalog.length === 0) {
    console.error("No products found. Run npm run seed:db first.");
    process.exit(1);
  }

  if (force) {
    await clearAnalytics(business.id);
    console.log("Cleared existing analytics for sunrise-coffee.");
  }

  const today = startOfUtcDay();
  let sessionCount = 0;
  let orderCount = 0;

  // Spread activity across the last 14 days; heavier on recent days.
  for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
    const dayStart = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const weight = dayOffset === 0 ? 1.4 : dayOffset <= 3 ? 1.2 : dayOffset <= 7 ? 1 : 0.7;
    const sessionsToday = Math.max(1, Math.round((2 + Math.random() * 2) * weight));
    const ordersToday = Math.max(dayOffset <= 2 ? 1 : 0, Math.round((1 + Math.random() * 2) * weight));

    for (let s = 0; s < sessionsToday; s += 1) {
      const startedAt = addMinutes(dayStart, 8 * 60 + s * 37 + Math.floor(Math.random() * 20));
      const durationMin = 2 + Math.floor(Math.random() * 6);
      const endedAt = addMinutes(startedAt, durationMin);
      const isActive = dayOffset === 0 && s === 0 && Math.random() > 0.6;
      const sessionId = randomUUID();

      await db.insert(voiceSessions).values({
        id: sessionId,
        businessId: business.id,
        status: isActive ? "active" : "ended",
        endReason: isActive ? null : pick(["completed", "idle_timeout", "customer_left"]),
        startedAt,
        endedAt: isActive ? null : endedAt,
      });
      sessionCount += 1;

      const customerName = pick(CUSTOMER_NAMES);
      const lines = [
        { role: "assistant", text: ASSISTANT_LINES[0]! },
        { role: "user", text: pick(USER_LINES) },
        { role: "assistant", text: pick(ASSISTANT_LINES.slice(1)) },
      ];

      for (const [index, line] of lines.entries()) {
        await db.insert(transcriptMessages).values({
          voiceSessionId: sessionId,
          role: line.role,
          text: line.text.replace("{name}", customerName),
          createdAt: addMinutes(startedAt, index + 1),
        });
      }
    }

    for (let o = 0; o < ordersToday; o += 1) {
      const confirmedAt = addMinutes(dayStart, 9 * 60 + o * 48 + Math.floor(Math.random() * 30));
      const sessionId = randomUUID();
      const customerName = pick(CUSTOMER_NAMES);
      const lineItems = pickProducts(catalog, 1 + Math.floor(Math.random() * 3)).map((item) => ({
        item,
        quantity: 1 + Math.floor(Math.random() * 2),
      }));
      const total = lineItems.reduce((sum, row) => sum + row.item.price * row.quantity, 0);
      const orderId = randomUUID();

      await db.insert(voiceSessions).values({
        id: sessionId,
        businessId: business.id,
        status: "ended",
        endReason: "completed",
        startedAt: addMinutes(confirmedAt, -durationMinutes(total)),
        endedAt: confirmedAt,
      });
      sessionCount += 1;

      await db.insert(orders).values({
        id: orderId,
        businessId: business.id,
        voiceSessionId: sessionId,
        status: "confirmed",
        total: Math.round(total * 100) / 100,
        customerName,
        createdAt: addMinutes(confirmedAt, -5),
        confirmedAt,
      });
      orderCount += 1;

      for (const row of lineItems) {
        await db.insert(orderItems).values({
          orderId,
          productId: row.item.productId,
          name: row.item.name,
          price: row.item.price,
          quantity: row.quantity,
        });
      }

      await db.insert(transcriptMessages).values([
        {
          voiceSessionId: sessionId,
          role: "assistant",
          text: ASSISTANT_LINES[0]!,
          createdAt: addMinutes(confirmedAt, -4),
        },
        {
          voiceSessionId: sessionId,
          role: "user",
          text: `Saya pesan ${lineItems.map((row) => row.item.name).join(" dan ")}.`,
          createdAt: addMinutes(confirmedAt, -3),
        },
        {
          voiceSessionId: sessionId,
          role: "assistant",
          text: ASSISTANT_LINES[4]!.replace("{name}", customerName).replace(
            "{total}",
            total.toLocaleString("id-ID"),
          ),
          createdAt: addMinutes(confirmedAt, -2),
        },
      ]);
    }
  }

  console.log(`Seeded demo analytics for ${business.name}:`);
  console.log(`  ${sessionCount} voice sessions`);
  console.log(`  ${orderCount} confirmed orders`);
  console.log("Refresh the admin dashboard to see charts populated.");

  await closeDb();
}

function durationMinutes(orderTotal: number): number {
  return Math.min(12, Math.max(3, Math.round(orderTotal / 25_000) + 3));
}

seedDemoAnalytics().catch((err) => {
  console.error(err);
  process.exit(1);
});
