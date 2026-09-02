import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { aiRules, orderItems, orders, voiceSessions } from "../db/schema.js";

export type StatsOverviewResult = {
  sessions_today: number;
  orders_today: number;
  revenue_today: number;
  avg_order_value: number;
  active_sessions: number;
  avg_call_duration_seconds: number | null;
};

export type StatsDailyPoint = {
  date: string;
  orders: number;
  revenue: number;
};

export type TopProductStat = {
  product_id: string;
  name: string;
  quantity: number;
  revenue: number;
};

function startOfUtcDay(date = new Date()): Date {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

export async function fetchStatsOverview(businessId: string): Promise<StatsOverviewResult> {
  const today = startOfUtcDay();

  const [
    [sessionsTodayRow],
    [activeSessionsRow],
    [ordersAggRow],
    [avgDurationRow],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(voiceSessions)
      .where(and(eq(voiceSessions.businessId, businessId), gte(voiceSessions.startedAt, today))),
    db
      .select({ value: count() })
      .from(voiceSessions)
      .where(and(eq(voiceSessions.businessId, businessId), eq(voiceSessions.status, "active"))),
    db
      .select({
        ordersToday: count(),
        revenueToday: sql<number>`coalesce(sum(${orders.total}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.businessId, businessId),
          eq(orders.status, "confirmed"),
          gte(orders.confirmedAt, today),
        ),
      ),
    db
      .select({
        avgSeconds: sql<number | null>`avg(extract(epoch from (${voiceSessions.endedAt} - ${voiceSessions.startedAt})))`,
      })
      .from(voiceSessions)
      .where(
        and(
          eq(voiceSessions.businessId, businessId),
          eq(voiceSessions.status, "ended"),
          sql`${voiceSessions.endedAt} IS NOT NULL`,
        ),
      ),
  ]);

  const ordersToday = Number(ordersAggRow?.ordersToday ?? 0);
  const revenueToday = Number(ordersAggRow?.revenueToday ?? 0);
  const avgOrderValue = ordersToday ? revenueToday / ordersToday : 0;
  const avgDuration = avgDurationRow?.avgSeconds;

  return {
    sessions_today: Number(sessionsTodayRow?.value ?? 0),
    orders_today: ordersToday,
    revenue_today: Math.round(revenueToday * 100) / 100,
    avg_order_value: Math.round(avgOrderValue * 100) / 100,
    active_sessions: Number(activeSessionsRow?.value ?? 0),
    avg_call_duration_seconds:
      avgDuration != null ? Math.round(Number(avgDuration) * 10) / 10 : null,
  };
}

export async function fetchStatsDaily(businessId: string): Promise<StatsDailyPoint[]> {
  const start = startOfUtcDay();
  start.setUTCDate(start.getUTCDate() - 13);

  const rows = await db
    .select({
      date: sql<string>`to_char(${orders.confirmedAt}, 'YYYY-MM-DD')`,
      orders: count(),
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.status, "confirmed"),
        gte(orders.confirmedAt, start),
      ),
    )
    .groupBy(sql`to_char(${orders.confirmedAt}, 'YYYY-MM-DD')`);

  const buckets: Record<string, StatsDailyPoint> = {};
  for (let i = 0; i < 14; i++) {
    const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    buckets[key] = { date: key, orders: 0, revenue: 0 };
  }

  for (const row of rows) {
    if (!buckets[row.date]) continue;
    buckets[row.date].orders = Number(row.orders ?? 0);
    buckets[row.date].revenue = Math.round(Number(row.revenue ?? 0) * 100) / 100;
  }

  return Object.values(buckets);
}

export async function fetchStatsTopProducts(businessId: string): Promise<TopProductStat[]> {
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
}

export async function fetchBusinessStatsSummary(businessId: string) {
  const [overview, daily, top_products, rules] = await Promise.all([
    fetchStatsOverview(businessId),
    fetchStatsDaily(businessId),
    fetchStatsTopProducts(businessId),
    db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) }),
  ]);

  return { overview, daily, top_products, ai_rules: rules };
}
