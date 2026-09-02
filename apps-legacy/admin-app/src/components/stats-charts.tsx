import type { StatsDailyPoint, TopProductStat } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Orders</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </div>
          {!loading && data.length > 0 ? (
            <div className="flex gap-5 text-right text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total orders</p>
                <p className="mt-0.5 font-semibold tabular-nums">{totalOrders}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total revenue</p>
                <p className="mt-0.5 font-semibold tabular-nums text-primary">
                  {formatCurrency(totalRevenue)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-56 items-end gap-2">
            {Array.from({ length: 14 }).map((_, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full animate-pulse rounded-t-md bg-muted"
                  style={{ height: `${20 + (index % 5) * 12}%` }}
                />
                <div className="h-2 w-6 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">No order data yet.</p>
          </div>
        ) : (
          <div className="flex h-56 items-end gap-1.5 sm:gap-2">
            {data.map((point) => {
              const heightPercent = (point.orders / maxOrders) * 100;
              return (
                <div key={point.date} className="group flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex h-full w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-primary/90 transition-all duration-200 group-hover:bg-primary"
                      style={{
                        height: `${heightPercent}%`,
                        minHeight: point.orders > 0 ? "8px" : "2px",
                      }}
                      title={`${formatShortDate(point.date)}: ${point.orders} orders · ${formatCurrency(point.revenue)}`}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {point.date.slice(8)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TOP_PRODUCTS_DISPLAY_LIMIT = 4;

export function TopProductsPanel({
  products,
  loading,
  limit = TOP_PRODUCTS_DISPLAY_LIMIT,
}: {
  products: TopProductStat[];
  loading?: boolean;
  limit?: number;
}) {
  const visibleProducts = products.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top products</CardTitle>
        <CardDescription>Best sellers by revenue</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="h-3 w-5 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                </div>
                <div>
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-6 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">No product sales yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map((product, index) => (
              <div
                key={product.product_id}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-slate-300 hover:bg-slate-50/80"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium tabular-nums text-slate-400">
                    {index === 0 ? (
                      <>
                        #1{" "}
                        <span className="animate-trophy" aria-hidden="true">
                          🏆
                        </span>
                      </>
                    ) : (
                      `#${index + 1}`
                    )}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                    {product.quantity} sold
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {product.name}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-slate-900">
                    {formatCurrency(product.revenue)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
