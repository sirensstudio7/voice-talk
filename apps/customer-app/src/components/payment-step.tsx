"use client";

import { CheckCircle2, Clock, QrCode, Smartphone } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { usePaymentQr } from "@/hooks/use-payment-qr";
import type { OrderState } from "@/types/voice";
import { formatCurrency } from "@voicetalk/shared";

interface PaymentStepProps {
  order: OrderState;
  onPaid: () => void;
  onExpired?: () => void;
}

const PAYMENT_TIMEOUT_SEC = 120;

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

const STEPS = [
  {
    icon: QrCode,
    title: "Scan the QR code",
    detail: "Open your banking app and scan the code below.",
  },
  {
    icon: Smartphone,
    title: "Complete payment on your phone",
    detail: "Confirm the amount — your app will send you a payment receipt or bill.",
  },
  {
    icon: CheckCircle2,
    title: "Tap I've paid",
    detail: "Once you see the payment confirmation on your phone, tap the button below.",
  },
] as const;

export function PaymentStep({ order, onPaid, onExpired }: PaymentStepProps) {
  const { paymentQrUrl, loading } = usePaymentQr();
  const [secondsLeft, setSecondsLeft] = useState(PAYMENT_TIMEOUT_SEC);
  const expired = secondsLeft <= 0;

  useEffect(() => {
    const deadline = Date.now() + PAYMENT_TIMEOUT_SEC * 1000;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        onExpired?.();
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [onExpired]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Order summary
        </p>
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
          <span className="text-sm font-medium text-slate-600">Total to pay</span>
          <span className="text-xl font-bold text-slate-900">{formatCurrency(order.total)}</span>
        </div>
      </div>

      <ol className="space-y-3">
        {STEPS.map(({ icon: Icon, title, detail }, index) => (
          <li
            key={title}
            className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Icon className="h-4 w-4 text-orange-500" />
                {title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center">
        {loading ? (
          <div className="flex h-52 w-52 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
          </div>
        ) : paymentQrUrl ? (
          <div className="relative h-52 w-52 rounded-xl bg-white p-3 shadow-inner">
            <Image
              src={paymentQrUrl}
              alt="Payment QR code"
              fill
              unoptimized
              className="object-contain p-2"
            />
          </div>
        ) : (
          <div className="flex h-52 w-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4">
            <QrCode className="mb-2 h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">Payment QR not set up</p>
            <p className="mt-1 text-xs text-slate-500">Ask staff to configure payment in the dashboard.</p>
          </div>
        )}

        <div
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums ${
            expired
              ? "bg-red-50 text-red-700"
              : secondsLeft <= 30
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-700"
          }`}
        >
          <Clock className="h-4 w-4 shrink-0" />
          {expired ? "Payment time expired" : `Complete payment within ${formatCountdown(secondsLeft)}`}
        </div>

        <p className="mt-3 text-sm font-semibold text-slate-900">
          Pay {formatCurrency(order.total)} via QRIS or your banking app
        </p>
      </div>

      <button
        type="button"
        onClick={onPaid}
        disabled={expired}
        className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white transition hover:bg-orange-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300"
      >
        I&apos;ve paid — I received my payment bill
      </button>
    </div>
  );
}
