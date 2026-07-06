"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Receipt, User } from "lucide-react";

import { PageHeader, StatCard } from "@/components/ui";
import { DateFilter } from "@/components/date-filter";
import { api, type Order } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatFilterDateLabel, parseApiDate } from "@/lib/dates";
import { formatCurrency } from "@voicetalk/shared";

function formatOrderTime(iso: string) {
  return parseApiDate(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatItemSummary(items: Order["items"]) {
  return items
    .map((item) => (item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name))
    .join(", ");
}

function formatOrderTimestamp(iso: string) {
  const date = parseApiDate(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return `Today · ${time}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday · ${time}`;
  }

  const dayDate = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${dayDate} · ${time}`;
}

function formatRelative(iso: string, now = Date.now()) {
  const diffMin = Math.floor((now - parseApiDate(iso).getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "1d ago";
  if (diffDay < 7) return `${diffDay}d ago`;
  return null;
}

function useNowTickMs(orders: Order[]) {
  const hasRecentOrder = orders.some((order) => {
    const ageMs = Date.now() - parseApiDate(order.created_at).getTime();
    return ageMs < 60 * 60 * 1000;
  });
  return hasRecentOrder ? 15_000 : 60_000;
}

function useNow(tickMs: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  return now;
}

function formatDateLabel(iso: string) {
  const date = parseApiDate(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function groupOrdersByDate(orders: Order[]) {
  const sorted = [...orders].sort(
    (a, b) => parseApiDate(b.created_at).getTime() - parseApiDate(a.created_at).getTime(),
  );

  const groups = new Map<string, Order[]>();
  for (const order of sorted) {
    const key = parseApiDate(order.created_at).toDateString();
    const existing = groups.get(key) ?? [];
    existing.push(order);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([, groupOrders]) => ({
    label: formatDateLabel(groupOrders[0].created_at),
    orders: groupOrders,
    revenue: groupOrders.reduce((sum, order) => sum + order.total, 0),
  }));
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    open: "bg-amber-50 text-amber-700 ring-amber-600/20",
    cancelled: "bg-red-50 text-red-700 ring-red-600/20",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${
        styles[status.toLowerCase()] ?? "bg-slate-100 text-slate-600 ring-slate-500/10"
      }`}
    >
      {status}
    </span>
  );
}

function OrderRow({
  order,
  expanded,
  now,
  onToggle,
}: {
  order: Order;
  expanded: boolean;
  now: number;
  onToggle: () => void;
}) {
  const relative = formatRelative(order.created_at, now);
  const customerName = order.customer_name?.trim();
  const itemSummary = formatItemSummary(order.items);

  return (
    <article
      className={`rounded-xl border bg-white shadow-sm transition-all ${
        expanded
          ? "border-slate-300 shadow-md ring-1 ring-slate-200/80"
          : "border-slate-200 hover:border-slate-300 hover:shadow"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full px-4 py-4 text-left sm:px-5"
      >
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            {customerName ? (
              <p className="truncate text-base font-semibold text-slate-900">{customerName}</p>
            ) : (
              <p className="truncate text-base font-semibold text-amber-700">No customer name</p>
            )}

            <p className="mt-1 truncate text-sm text-slate-600">{itemSummary}</p>

            <p className="mt-1.5 text-xs text-slate-400">
              {formatOrderTime(order.created_at)}
              {relative ? ` · ${relative}` : null}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <p className="text-xl font-bold tabular-nums text-slate-900">{formatCurrency(order.total)}</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              <ChevronDown
                className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                aria-hidden
              />
            </div>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
          <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Receipt className="h-3 w-3" />
            Order details
          </div>
          <ul className="divide-y divide-slate-200/80 overflow-hidden rounded-lg border border-slate-200/80 bg-white">
            {order.items.map((item) => (
              <li
                key={`${order.id}-${item.product_id}`}
                className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {item.quantity > 1 ? `${item.quantity}× ` : null}
                    {item.name}
                  </p>
                  {item.quantity > 1 ? (
                    <p className="text-xs text-slate-400">{formatCurrency(item.price)} each</p>
                  ) : null}
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {formatCurrency(item.subtotal)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-200/80 pt-3 text-sm">
            <div className="min-w-0 text-slate-600">
              {customerName ? (
                <p className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  <span>
                    Customer: <span className="font-medium text-slate-900">{customerName}</span>
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-amber-700">
                  <User className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                  Name not collected
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                {formatOrderTimestamp(order.created_at)}
                {relative ? ` · ${relative}` : null}
              </p>
            </div>
            <p className="shrink-0 text-base font-bold tabular-nums text-slate-900">
              {formatCurrency(order.total)}
            </p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function OrdersPageClient() {
  const { token, business } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const nowTickMs = useNowTickMs(orders);
  const now = useNow(nowTickMs);

  useEffect(() => {
    if (!token || !business) return;

    const loadOrders = () =>
      api.listOrders(token, business.id, selectedDate ?? undefined).then((data) => {
        setOrders(data);
        setExpandedIds((current) => {
          const next = new Set<string>();
          for (const id of current) {
            if (data.some((order) => order.id === id)) next.add(id);
          }
          return next;
        });
      });

    void loadOrders();
    const interval = window.setInterval(() => {
      void api.listOrders(token, business.id, selectedDate ?? undefined).then(setOrders);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [token, business, selectedDate]);

  const groups = useMemo(() => groupOrdersByDate(orders), [orders]);

  const stats = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + order.total, 0);
    const avg = orders.length > 0 ? revenue / orders.length : 0;
    return { count: orders.length, revenue, avg };
  }, [orders]);

  const subtitle = useMemo(() => {
    if (orders.length === 0) {
      return selectedDate
        ? `No orders on ${formatFilterDateLabel(selectedDate)}.`
        : "Confirmed voice orders and history.";
    }

    const countLabel = `${orders.length} voice ${orders.length === 1 ? "order" : "orders"}`;
    if (selectedDate) {
      return `${countLabel} on ${formatFilterDateLabel(selectedDate)} · refreshes every 10s`;
    }
    return `${countLabel} · refreshes every 10s`;
  }, [orders.length, selectedDate]);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={subtitle}
        action={<DateFilter id="orders-date-filter" value={selectedDate} onChange={setSelectedDate} />}
      />

      {orders.length > 0 ? (
        <div className="mb-6 grid gap-[16px] sm:grid-cols-3">
          <StatCard label="Total orders" value={String(stats.count)} />
          <StatCard label="Total revenue" value={formatCurrency(stats.revenue)} />
          <StatCard label="Average order" value={formatCurrency(stats.avg)} />
        </div>
      ) : null}

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <Receipt className="h-7 w-7" />
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {selectedDate ? "No orders on this date" : "No orders yet"}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            {selectedDate
              ? `There are no confirmed orders for ${formatFilterDateLabel(selectedDate)}. Try another date or view all dates.`
              : "When a customer confirms their order through Eva, it will show up here automatically."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-900">{group.label}</h2>
                <p className="text-xs text-slate-500">
                  {group.orders.length} {group.orders.length === 1 ? "order" : "orders"} ·{" "}
                  {formatCurrency(group.revenue)}
                </p>
              </div>

              <div className="space-y-3">
                {group.orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    now={now}
                    expanded={expandedIds.has(order.id)}
                    onToggle={() =>
                      setExpandedIds((current) => {
                        const next = new Set(current);
                        if (next.has(order.id)) next.delete(order.id);
                        else next.add(order.id);
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
