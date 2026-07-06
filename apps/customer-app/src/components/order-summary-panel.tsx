"use client";

import { ChevronRight, ShoppingBag } from "lucide-react";

import { useSessionStore } from "@/store/session-store";
import { formatCurrency } from "@voicetalk/shared";

export function OrderSummaryPanel() {
  const { order } = useSessionStore();

  if (order.items.length === 0) return null;

  return (
    <div className="mx-4 mb-2">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <ShoppingBag className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Live Order
          </p>
          <p className="truncate text-sm font-bold text-slate-900">
            {order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
          </p>
          <p className="text-xs font-medium text-slate-600">
            {formatCurrency(order.total)} · {order.status}
          </p>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
      </div>
    </div>
  );
}
