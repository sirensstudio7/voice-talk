import type { ReactNode } from "react";

import {
  AdminMenuMockup,
  AdminOverviewMockup,
  AdminRulesMockup,
} from "@/components/landing/admin-dashboard-previews";
import { cn } from '@voicetalk/ui';

export { AdminMenuMockup, AdminOverviewMockup, AdminRulesMockup };

export function BrowserChrome({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5",
        compact && "rounded-xl shadow-xl",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3",
          compact && "px-3 py-2",
        )}
      >
        <div className="flex gap-1.5">
          <span className={cn("rounded-full bg-red-400", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
          <span className={cn("rounded-full bg-amber-400", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
          <span className={cn("rounded-full bg-emerald-400", compact ? "h-2 w-2" : "h-2.5 w-2.5")} />
        </div>
        <div
          className={cn(
            "mx-auto rounded-md bg-white px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200",
            compact && "px-2 py-0.5 text-[10px]",
          )}
        >
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

export function CustomerVoiceMockup() {
  return (
    <div className="relative aspect-[16/10] bg-gradient-to-b from-slate-100 to-slate-200">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          Lorescale · Live
        </div>
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          Basket · 2
        </div>
      </div>

      <div className="absolute inset-x-0 top-1/4 flex justify-center">
        <div className="h-40 w-28 rounded-full bg-gradient-to-b from-orange-100 to-slate-200 shadow-inner ring-4 ring-white/60" />
      </div>

      <div className="absolute bottom-24 left-4 max-w-[11rem] rounded-2xl bg-white/95 p-3 shadow-lg backdrop-blur-sm">
        <p className="text-[10px] font-medium uppercase tracking-wide text-orange-500">Lorescale</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-700">
          Hi! What can I get started for you today?
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-100 via-slate-100/80 to-transparent px-4 pb-4 pt-16">
        <div className="mx-auto flex max-w-xs items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white shadow-sm ring-1 ring-slate-200" />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 shadow-lg shadow-orange-500/30">
            <div className="h-5 w-5 rounded-sm bg-white/90" />
          </div>
          <div className="h-10 w-10 rounded-full bg-white shadow-sm ring-1 ring-slate-200" />
        </div>
      </div>
    </div>
  );
}

export function CustomerMenuMockup() {
  const items = [
    { name: "Iced Latte", price: "Rp 45.000", tag: "Popular" },
    { name: "Croissant", price: "Rp 28.000" },
    { name: "Flat White", price: "Rp 42.000" },
    { name: "Avocado Toast", price: "Rp 65.000" },
  ];

  return (
    <div className="relative aspect-[16/10] bg-gradient-to-b from-slate-100 to-slate-200">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          Menu
        </div>
        <div className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
          Basket · 2
        </div>
      </div>

      <div className="absolute inset-x-4 top-14 grid grid-cols-2 gap-2 sm:inset-x-8">
        {items.map((item) => (
          <div
            key={item.name}
            className="rounded-xl border border-white/80 bg-white/95 p-2.5 shadow-sm backdrop-blur-sm"
          >
            <div className="mb-2 aspect-[4/3] rounded-lg bg-gradient-to-br from-orange-100 to-slate-100" />
            <div className="flex items-start justify-between gap-1">
              <div>
                <p className="text-[11px] font-semibold text-slate-900">{item.name}</p>
                <p className="text-[10px] text-slate-500">{item.price}</p>
              </div>
              {item.tag ? (
                <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-medium text-orange-600">
                  {item.tag}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm">
        <p className="text-[10px] font-medium uppercase tracking-wide text-orange-500">You</p>
        <p className="mt-1 text-xs text-slate-700">Add an iced latte and a croissant, please.</p>
      </div>
    </div>
  );
}

export function CustomerCheckoutMockup() {
  return (
    <div className="relative aspect-[16/10] bg-gradient-to-b from-slate-100 to-slate-200">
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          Checkout
        </div>
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          Order #1042
        </div>
      </div>

      <div className="absolute inset-x-6 top-16 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
        <p className="text-xs font-semibold text-slate-900">Your order</p>
        <div className="mt-3 space-y-2">
          {[
            ["Iced Latte", "Rp 45.000"],
            ["Croissant", "Rp 28.000"],
          ].map(([name, price]) => (
            <div key={name} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-700">{name}</span>
              <span className="font-medium text-slate-900">{price}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="font-semibold text-orange-600">Rp 73.000</span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-slate-100 via-slate-100/95 to-transparent px-6 pb-6 pt-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className={`h-3 w-3 rounded-sm ${i % 3 === 0 ? "bg-slate-900" : "bg-slate-200"}`} />
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-slate-700">Scan to pay with QR</p>
        <div className="mt-3 rounded-full bg-orange-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-orange-500/25">
          I&apos;ve paid
        </div>
      </div>
    </div>
  );
}

export type ProductShowcaseSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
  browserTitle: string;
  mockup: ReactNode;
};

export const PRODUCT_SHOWCASE_SLIDES: ProductShowcaseSlide[] = [
  {
    id: "customer-voice",
    eyebrow: "Customer app",
    title: "Natural voice ordering",
    description: "Customers hold the mic and talk to your AI cashier — no app download required.",
    details: [
      "Works in any mobile browser — no install or account needed",
      "Live avatar greets guests and guides them through the order",
      "Voice transcript appears on screen so customers can follow along",
      "Mic, menu, and basket controls stay within thumb reach on kiosk",
    ],
    browserTitle: "display.lorescale.com/your-store",
    mockup: <CustomerVoiceMockup />,
  },
  {
    id: "customer-menu",
    eyebrow: "Customer app",
    title: "Voice + visual menu",
    description: "Browse items on screen while ordering by voice. Basket updates in real time.",
    details: [
      "Menu cards show photos, prices, and popular-item badges",
      "Customers can tap items or speak — both paths update the basket",
      "Basket count stays visible so guests always know what's added",
      "Voice replies confirm each item before moving to checkout",
    ],
    browserTitle: "display.lorescale.com/your-store",
    mockup: <CustomerMenuMockup />,
  },
  {
    id: "customer-checkout",
    eyebrow: "Customer app",
    title: "QR checkout in-browser",
    description: "Confirm the order, scan your payment QR, and tap I've paid — all in one flow.",
    details: [
      "Order summary lists every line item with running total",
      "QR code renders in-page for bank or e-wallet payment",
      "Guests tap I've paid when done — staff see the order instantly",
      "Order number appears on screen for pickup or counter handoff",
    ],
    browserTitle: "display.lorescale.com/your-store",
    mockup: <CustomerCheckoutMockup />,
  },
  {
    id: "admin-overview",
    eyebrow: "Admin dashboard",
    title: "Analytics at a glance",
    description: "Track sessions, orders, revenue, and trends from a single overview screen.",
    details: [
      "KPI cards for sessions, orders, revenue, and average order value",
      "Weekly trend chart highlights busy days and peak hours",
      "Filter by date range to compare weeks or campaigns",
      "Export-ready data for reporting and franchise roll-ups",
    ],
    browserTitle: "admin.lore.app",
    mockup: <AdminOverviewMockup />,
  },
  {
    id: "admin-menu",
    eyebrow: "Admin dashboard",
    title: "Menu management",
    description: "Add items, set prices, and toggle availability without touching code.",
    details: [
      "Organize items by category with photo, price, and description",
      "Search and filter products across categories in one view",
      "Add seasonal specials without redeploying the customer app",
      "Edit or remove items — changes sync to kiosks instantly",
    ],
    browserTitle: "admin.lore.app/menu",
    mockup: <AdminMenuMockup />,
  },
  {
    id: "admin-rules",
    eyebrow: "Admin dashboard",
    title: "AI rules & knowledge",
    description: "Train upsells, tone, and store policies so Lore sounds like your brand.",
    details: [
      "Set personality, behavior rules, and tool instructions in plain language",
      "Preview the full system prompt your assistant receives",
      "Choose language, tone, and avatar — see a live 3D preview",
      "Changes apply to every kiosk on the next customer session",
    ],
    browserTitle: "admin.lore.app/ai-rules",
    mockup: <AdminRulesMockup />,
  },
];
