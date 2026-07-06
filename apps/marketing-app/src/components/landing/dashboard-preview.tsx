import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ExternalLink,
  ImageIcon,
  LayoutGrid,
  List,
  LogOut,
  MessageSquare,
  QrCode,
  Receipt,
  Search,
  Sparkles,
  Store,
} from "lucide-react";

import { formatCurrency } from "@voicetalk/shared";

const NAV: Array<{
  label: string;
  icon: (typeof LayoutGrid);
  active?: boolean;
}> = [
  { label: "Overview", icon: LayoutGrid, active: true },
  { label: "Menu", icon: List },
  { label: "AI Knowledge", icon: BookOpen },
  { label: "AI Rules", icon: Sparkles },
  { label: "Orders", icon: Receipt },
  { label: "Conversations", icon: MessageSquare },
  { label: "Payment QR", icon: QrCode },
  { label: "Appearance", icon: ImageIcon },
  { label: "Analytics", icon: BarChart3 },
];

const STATS: Array<{ label: string; value: string; hint?: string }> = [
  { label: "Sessions today", value: "24" },
  { label: "Orders today", value: "18" },
  { label: "Revenue today", value: formatCurrency(1_280_000) },
  { label: "Avg order value", value: formatCurrency(71_000) },
  { label: "Avg call duration", value: "2m 14s", hint: "All-time average" },
  { label: "Active sessions", value: "3", hint: "Live voice sessions" },
];

const CHART = [28, 42, 35, 58, 44, 72, 51, 66, 48, 74, 61, 80, 55, 68];

const TOP_PRODUCTS = [
  { name: "Iced Latte", orders: 42, revenue: 1_890_000 },
  { name: "Croissant", orders: 31, revenue: 868_000 },
  { name: "Flat White", orders: 24, revenue: 1_080_000 },
  { name: "Avocado Toast", orders: 18, revenue: 1_170_000 },
  { name: "Cold Brew", orders: 15, revenue: 600_000 },
] as const;

function NavItem({
  label,
  icon: Icon,
  active,
}: {
  label: string;
  icon: (typeof LayoutGrid);
  active?: boolean;
}) {
  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-[10px] px-2 py-1 ${
          active ? "bg-gray-100 text-gray-950" : "text-gray-600"
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center sm:h-10 sm:w-10">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <p className="truncate text-xs font-medium sm:text-sm">{label}</p>
      </div>
    </li>
  );
}

export function DashboardPreview() {
  return (
    <div
      className="flex min-h-[420px] bg-slate-50 sm:min-h-[520px] lg:min-h-[580px]"
      aria-label="EVA Admin dashboard preview"
      role="img"
    >
      <aside className="hidden w-44 shrink-0 border-r border-gray-200 bg-white/90 backdrop-blur-md sm:block lg:w-56">
        <div className="flex h-12 items-center px-4 lg:h-14">
          <span className="text-base font-bold tracking-tight text-orange-500 lg:text-lg">EVA Admin</span>
        </div>

        <div className="px-3">
          <div className="flex items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-2 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-100">
              <Store className="h-3.5 w-3.5 text-gray-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-950 lg:text-sm">Sunrise Coffee</p>
              <p className="truncate text-[10px] text-gray-500">Your neighborhood cafe</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          </div>
        </div>

        <ul className="mt-3 flex flex-col gap-0.5 px-2 pb-3 lg:px-3">
          {NAV.map(({ label, icon, active }) => (
            <NavItem key={label} label={label} icon={icon} active={active} />
          ))}
        </ul>

        <div className="mt-auto border-t border-gray-100 px-2 py-3 lg:px-3">
          <div className="flex items-center gap-2 rounded-[10px] px-2 py-1 text-gray-600">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center lg:h-10 lg:w-10">
              <LogOut className="h-4 w-4 lg:h-5 lg:w-5" />
            </div>
            <p className="text-xs font-medium lg:text-sm">Log out</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white/90 px-4 backdrop-blur-md lg:h-14 lg:px-8">
          <div className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500 md:flex lg:w-52">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span>Search</span>
          </div>

          <div className="ml-auto flex items-center gap-2 lg:gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-700 lg:text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              AI Online
            </div>
            <div className="hidden items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-medium text-gray-700 sm:inline-flex lg:text-xs">
              <ExternalLink className="h-3 w-3 shrink-0" />
              Customer app
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200">
              SC
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <div className="mb-4 lg:mb-6">
            <h1 className="text-lg font-bold text-slate-900 lg:text-2xl">Overview</h1>
            <p className="mt-0.5 text-xs text-slate-500 lg:text-sm">Managing Sunrise Coffee</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3 2xl:grid-cols-6">
            {STATS.map(({ label, value, hint }) => (
              <div
                key={label}
                className="flex min-h-[5.5rem] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:min-h-[7.875rem] sm:p-4 lg:p-5"
              >
                <p className="text-[10px] text-slate-500 sm:text-sm">{label}</p>
                <div className="mt-auto">
                  <p className="text-xl font-bold text-slate-900 sm:text-3xl">{value}</p>
                  {hint ? <p className="mt-0.5 text-[10px] text-slate-400 sm:text-xs">{hint}</p> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:mt-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 lg:text-lg">Orders</h2>
                  <p className="mt-0.5 text-[10px] text-slate-500 sm:text-sm">Last 14 days</p>
                </div>
                <div className="flex gap-3 text-right text-[10px] sm:text-sm">
                  <div>
                    <p className="text-slate-400">Total orders</p>
                    <p className="font-semibold tabular-nums text-slate-900">186</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Total revenue</p>
                    <p className="font-semibold tabular-nums text-orange-600">{formatCurrency(14_725_000)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex h-28 items-end gap-1 sm:h-40 sm:gap-1.5">
                {CHART.map((height, index) => (
                  <div key={index} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-orange-500 to-orange-400"
                      style={{ height: `${height}%` }}
                    />
                    <span className="hidden text-[9px] text-slate-400 sm:inline">{index + 1}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 lg:text-lg">Top products</h2>
                <p className="mt-0.5 text-[10px] text-slate-500 sm:text-sm">By order count</p>
              </div>

              <ul className="mt-4 space-y-2.5">
                {TOP_PRODUCTS.map((product, index) => (
                  <li key={product.name} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[10px] font-semibold text-orange-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-900 sm:text-sm">{product.name}</p>
                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        {product.orders} orders · {formatCurrency(product.revenue)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
