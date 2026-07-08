import type { StatsDailyPoint, TopProductStat } from "@/lib/api";
import { formatCurrency } from "@/lib/currency";

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DailyOrdersChart({
  data,
  loading,
}: {
  data: StatsDailyPoint[];
  loading?: boolean;
}) {
  const totalOrders = data.reduce((sum, point) => sum + point.orders, 0);
  const totalRevenue = data.reduce((sum, point) => sum + point.revenue, 0);
  const maxOrders = Math.max(...data.map((point) => point.orders), 1);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Orders</h2>
          <p className="mt-0.5 text-sm text-slate-500">Last 14 days</p>
        </div>
        {!loading && data.length > 0 ? (
          <div className="flex gap-5 text-right text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total orders</p>
              <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{totalOrders}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total revenue</p>
              <p className="mt-0.5 font-semibold tabular-nums text-orange-600">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-6 flex h-56 items-end gap-2">
          {Array.from({ length: 14 }).map((_, index) => (
            <div key={index} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full animate-pulse rounded-t-lg bg-slate-100"
                style={{ height: `${20 + (index % 5) * 12}%` }}
              />
              <div className="h-2 w-6 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="mt-8 flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
          <p className="text-sm text-slate-500">No order data yet.</p>
        </div>
      ) : (
        <div className="mt-6 flex h-56 items-end gap-1.5 sm:gap-2">
          {data.map((point) => {
            const heightPercent = (point.orders / maxOrders) * 100;
            return (
              <div key={point.date} className="group flex flex-1 flex-col items-center gap-2">
                <div className="relative flex h-full w-full items-end">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-orange-500 to-orange-400 shadow-sm transition-all duration-200 group-hover:from-orange-600 group-hover:to-orange-500"
                    style={{
                      height: `${heightPercent}%`,
                      minHeight: point.orders > 0 ? "8px" : "2px",
                    }}
                    title={`${formatShortDate(point.date)}: ${point.orders} orders · ${formatCurrency(point.revenue)}`}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-slate-400">{point.date.slice(8)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function TopProductsPanel({
  products,
  loading,
  limit,
}: {
  products: TopProductStat[];
  loading?: boolean;
  limit?: number;
}) {
  const maxRevenue = Math.max(...products.map((product) => product.revenue), 1);
  const visibleProducts = limit ? products.slice(0, limit) : products;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">Top products</h2>
      <p className="mt-0.5 text-sm text-slate-500">Best sellers by revenue</p>

      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-xl bg-slate-50 px-4 py-3">
              <div className="h-4 w-1/2 rounded bg-slate-200" />
              <div className="mt-2 h-2 w-full rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="mt-6 flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
          <p className="text-sm text-slate-500">No product sales yet.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {visibleProducts.map((product, index) => (
            <div
              key={product.product_id}
              className="rounded-xl border border-transparent bg-slate-50/80 px-4 py-3 transition-colors hover:border-slate-200 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{product.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{product.quantity} sold</p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-orange-600">
                  {formatCurrency(product.revenue)}
                </p>
              </div>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500"
                  style={{ width: `${(product.revenue / maxRevenue) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
