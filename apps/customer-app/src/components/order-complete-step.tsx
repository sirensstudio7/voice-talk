"use client";

import { CheckCircle2 } from "lucide-react";

import type { OrderState } from "@/types/voice";
import { formatCurrency } from "@voicetalk/shared";

interface OrderCompleteStepProps {
  order: OrderState;
  onNewOrder: () => void;
}

export function OrderCompleteStep({ order, onNewOrder }: OrderCompleteStepProps) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
        <CheckCircle2 className="h-9 w-9" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-slate-900">Thanks for your order!</h3>
        <p className="mt-1 text-sm text-slate-500">
          Payment received. Keep the payment receipt on your phone for your records.
        </p>
      </div>

      <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order recap</p>
        {order.customer_name ? (
          <p className="mt-3 text-sm font-semibold text-slate-900">
            Customer: <span className="font-normal text-slate-700">{order.customer_name}</span>
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {order.items.map((item) => (
            <li key={item.product_id} className="flex justify-between text-sm">
              <span className="text-slate-700">
                {item.quantity}× {item.name}
              </span>
              <span className="font-semibold text-slate-900">{formatCurrency(item.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm font-medium text-slate-600">Total paid</span>
          <span className="text-lg font-bold text-slate-900">{formatCurrency(order.total)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onNewOrder}
        className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white transition hover:bg-orange-600 active:scale-[0.98]"
      >
        Start new order
      </button>
    </div>
  );
}
