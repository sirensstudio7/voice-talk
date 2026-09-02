"use client";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  Bars3Icon,
  BookOpenIcon,
  BuildingOffice2Icon,
  CameraIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleOvalLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CommandLineIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  QrCodeIcon,
  QueueListIcon,
  ReceiptPercentIcon,
  SparklesIcon,
  Squares2X2Icon,
  SwatchIcon,
  TrashIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

import { cn } from '@voicetalk/ui';
import { formatCurrency } from "@voicetalk/shared";

const CANVAS_W = 1280;
const CANVAS_H = 800;

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Overview", icon: Squares2X2Icon },
      { href: "/analytics", label: "Analytics", icon: ChartBarIcon },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/menu", label: "Menu", icon: QueueListIcon },
      { href: "/orders", label: "Orders", icon: ReceiptPercentIcon },
      { href: "/payment", label: "Payment QR", icon: QrCodeIcon },
    ],
  },
  {
    label: "AI Assistant",
    items: [
      { href: "/knowledge", label: "AI Knowledge", icon: BookOpenIcon },
      { href: "/ai-rules", label: "AI Rules", icon: SparklesIcon },
      { href: "/vision-settings", label: "Vision Settings", icon: CameraIcon },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/conversations", label: "Conversations", icon: ChatBubbleLeftRightIcon },
      { href: "/appearance", label: "Appearance", icon: SwatchIcon },
    ],
  },
];

function AdminPreviewScaler({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateScale = () => {
      const width = node.getBoundingClientRect().width;
      if (width > 0) setScale(width / CANVAS_W);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-white"
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PreviewStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-[#e2e8f0] bg-white py-3">
      <div className="px-4">
        <p className="text-sm capitalize text-[#64748b]">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-[#0f172a]">{value}</p>
      </div>
    </div>
  );
}

function PreviewPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">{title}</h1>
        <p className="text-sm text-[#64748b]">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function AdminPreviewShell({
  activePath,
  breadcrumb,
  children,
}: {
  activePath: string;
  breadcrumb?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full bg-white text-[#0f172a]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[#e2e8f0] bg-[#fafafa]">
        <div className="p-2">
          <div className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-[#f97316] text-white">
              <BuildingOffice2Icon className="size-4" />
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Demo Café</span>
              <span className="truncate text-xs text-[#0f172a]/70">Your neighborhood cafe</span>
            </div>
            <ChevronDownIcon className="ml-auto size-4 shrink-0 text-[#0f172a]/70" />
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-2 pb-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2 py-1.5 text-xs font-medium text-[#0f172a]/70">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = activePath === href;
                  return (
                    <div
                      key={href}
                      className={cn(
                        "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-sm transition-colors",
                        active
                          ? "bg-[#f1f5f9] font-medium text-[#0f172a]"
                          : "text-[#0f172a] hover:bg-[#f1f5f9]",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <p className="px-2 py-1.5 text-xs font-medium text-[#0f172a]/70">Quick links</p>
            <div className="flex items-center gap-2 rounded-md p-2 text-sm text-[#0f172a]">
              <ArrowTopRightOnSquareIcon className="size-4 shrink-0" />
              <span className="truncate">Customer app</span>
            </div>
            <div className="flex items-center gap-2 rounded-md p-2 text-sm text-[#0f172a]">
              <MagnifyingGlassIcon className="size-4 shrink-0" />
              <span className="truncate">Search</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#e2e8f0] bg-white px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Bars3Icon className="size-4 text-[#64748b]" />
            <div className="mr-2 hidden h-4 w-px bg-[#e2e8f0] sm:block" />
            <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-[#64748b]">
              <span>Dashboard</span>
              {breadcrumb ? (
                <>
                  <ChevronRightIcon className="size-3.5" />
                  <span className="font-normal text-[#0f172a]">{breadcrumb}</span>
                </>
              ) : null}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-green-100 bg-green-50/80 px-3 py-1.5 text-xs font-medium text-green-600">
              <span className="size-1.5 shrink-0 rounded-full bg-green-400" />
              AI Online
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-medium text-[#0f172a]">
              <ArrowTopRightOnSquareIcon className="size-3.5" />
              Customer app
            </div>
            <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-500 text-xs font-semibold text-white">
              DC
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col gap-4 overflow-hidden px-6 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function OverviewPreviewContent() {
  const chart = [28, 42, 35, 58, 44, 72, 51, 66, 48, 74, 61, 80, 55, 68];
  const topProducts = [
    { name: "Iced Latte", qty: 42, revenue: 1_890_000 },
    { name: "Croissant", qty: 31, revenue: 868_000 },
    { name: "Flat White", qty: 24, revenue: 1_080_000 },
    { name: "Avocado Toast", qty: 18, revenue: 1_170_000 },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PreviewPageHeader title="Overview" subtitle="Managing Demo Café" />

      <div className="grid shrink-0 grid-cols-3 gap-3">
        {[
          ["Sessions today", "24"],
          ["Orders today", "18"],
          ["Revenue today", formatCurrency(810_000)],
          ["Avg order value", formatCurrency(45_000)],
          ["Avg call duration", "2m 14s"],
          ["Active sessions", "3"],
        ].map(([label, value]) => (
          <PreviewStatCard key={label} label={label} value={value} />
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <div className="flex min-h-0 flex-col rounded-xl border border-[#e2e8f0] bg-white py-4">
          <div className="shrink-0 px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold leading-none text-[#0f172a]">Orders</p>
                <p className="mt-1.5 text-sm text-[#64748b]">Last 14 days</p>
              </div>
              <div className="flex gap-5 text-right text-sm">
                <div>
                  <p className="text-xs font-medium text-[#64748b]">Total orders</p>
                  <p className="mt-0.5 font-semibold tabular-nums">186</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#64748b]">Total revenue</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-[#f97316]">
                    {formatCurrency(12_400_000)}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 min-h-0 flex-1 px-5">
            <div className="flex h-full min-h-[120px] items-end gap-1">
              {chart.map((height, index) => (
                <div key={index} className="flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex h-full w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-[#f97316]/90"
                      style={{ height: `${height}%`, minHeight: "6px" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border border-[#e2e8f0] bg-white py-4">
          <div className="shrink-0 px-5">
            <p className="font-semibold leading-none text-[#0f172a]">Top products</p>
            <p className="mt-1.5 text-sm text-[#64748b]">Best sellers by revenue</p>
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-hidden px-5">
            <div className="grid h-full grid-cols-2 gap-2">
            {topProducts.map((product, index) => (
              <div
                key={product.name}
                className="flex flex-col justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium tabular-nums text-[#64748b]">
                    {index === 0 ? "#1 🏆" : `#${index + 1}`}
                  </span>
                  <span className="rounded-full border border-[#e2e8f0] bg-[#f1f5f9] px-2 py-0.5 text-xs font-medium tabular-nums text-[#64748b]">
                    {product.qty} sold
                  </span>
                </div>
                <div>
                  <p className="truncate text-sm font-medium text-[#0f172a]">{product.name}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-[#0f172a]">
                    {formatCurrency(product.revenue)}
                  </p>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuProductCard({
  name,
  description,
  price,
  emoji,
}: {
  name: string;
  description: string;
  price: string;
  emoji: string;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80">
      <div className="px-1 pt-1">
        <div className="relative aspect-[7/6] w-full overflow-hidden rounded-xl bg-slate-100">
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 text-4xl">
            {emoji}
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-h-0 flex-1">
          <p className="line-clamp-1 text-base font-semibold leading-tight tracking-tight text-slate-900">
            {name}
          </p>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-slate-500">{description}</p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
          <p className="text-base font-bold tabular-nums tracking-tight text-slate-900">{price}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">
              <PencilIcon className="size-3.5" />
            </div>
            <div className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">
              <TrashIcon className="size-3.5" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function MenuPreviewContent() {
  const products = [
    { name: "Iced Latte", description: "Espresso over ice with milk", price: formatCurrency(45_000), emoji: "☕" },
    { name: "Flat White", description: "Velvety microfoam espresso", price: formatCurrency(42_000), emoji: "☕" },
    { name: "Croissant", description: "Buttery, flaky pastry", price: formatCurrency(28_000), emoji: "🥐" },
    { name: "Avocado Toast", description: "Sourdough, avocado, chili flakes", price: formatCurrency(65_000), emoji: "🥑" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <PreviewPageHeader
        title="Menu"
        subtitle="4 products across 2 categories"
        action={
          <div className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white">
            <PlusIcon className="size-4" />
            Add product
          </div>
        }
      />

      <div className="grid shrink-0 grid-cols-2 gap-3">
        <PreviewStatCard label="Total products" value="4" />
        <PreviewStatCard label="Categories" value="2" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-slate-50 p-4">
        <div className="relative mb-4 w-full max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <div className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-400">
            Search products…
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {["All", "Coffee", "Pastry"].map((cat, i) => (
            <span
              key={cat}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                i === 0
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200/80",
              )}
            >
              {cat}
            </span>
          ))}
        </div>

        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Coffee</h3>
          <div className="grid grid-cols-2 gap-3">
            {products.slice(0, 2).map((product) => (
              <MenuProductCard key={product.name} {...product} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RuleSectionPreview({
  label,
  description,
  icon: Icon,
  value,
}: {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <section className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700">
        {value}
      </div>
    </section>
  );
}

function AiRulesPreviewContent() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <PreviewPageHeader
        title="AI Rules"
        subtitle="Control your assistant's personality, behavior, and tool usage."
      />

      <section className="shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Start from a template</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {["Casual Barista", "Professional", "Warm Host"].map((label, i) => (
              <div
                key={label}
                className={cn(
                  "rounded-xl border px-3 py-2",
                  i === 0
                    ? "border-orange-300 bg-orange-50 ring-2 ring-orange-500/20"
                    : "border-slate-200 bg-white",
                )}
              >
                <div className="flex items-center gap-2">
                  <UserCircleIcon className={cn("size-4", i === 0 ? "text-orange-500" : "text-slate-400")} />
                  <p className="truncate text-xs font-semibold text-slate-900">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative h-24">
          <div className="absolute inset-x-0 top-1 flex justify-center">
            <div className="h-20 w-14 rounded-full bg-gradient-to-b from-orange-100 to-slate-200" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-5 pb-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Live preview</p>
              <p className="text-xl font-semibold text-slate-900">Lore</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-3 overflow-hidden">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="grid shrink-0 grid-cols-2 gap-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <GlobeAltIcon className="size-4 text-orange-500" />
                <p className="text-sm font-semibold text-slate-900">Language</p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900">
                Bahasa Indonesia
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <ChatBubbleOvalLeftIcon className="size-4 text-orange-500" />
                <p className="text-sm font-semibold text-slate-900">Tone</p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900">
                Friendly
              </div>
            </section>
          </div>

          <RuleSectionPreview
            label="Personality"
            description="Your assistant's voice, tone, and character when talking to customers."
            icon={SparklesIcon}
            value="Warm and friendly barista who greets every guest with enthusiasm."
          />
          <RuleSectionPreview
            label="Behavior rules"
            description="Guidelines for how your assistant should act during conversations."
            icon={ChatBubbleOvalLeftIcon}
            value="Suggest a pastry with any coffee order. Offer oat milk as an alternative."
          />
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-200 px-4 py-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-slate-100">
              <CommandLineIcon className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Prompt preview</p>
              <p className="text-xs text-slate-500">42 lines · saved state</p>
            </div>
          </div>
          <pre className="min-h-0 flex-1 overflow-hidden bg-slate-950 p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-100">
            {`You are Lore, the AI cashier for Demo Café.

Personality:
Warm and friendly barista…

Behavior:
- Upsell pastry with coffee
- Offer oat milk alternative

Tool instructions:
Confirm each item before adding to basket.`}
          </pre>
        </div>
      </div>
    </div>
  );
}

function wrapPreview(activePath: string, breadcrumb: string | undefined, content: ReactNode) {
  return (
    <AdminPreviewScaler>
      <AdminPreviewShell activePath={activePath} breadcrumb={breadcrumb}>
        {content}
      </AdminPreviewShell>
    </AdminPreviewScaler>
  );
}

export function AdminOverviewMockup() {
  return wrapPreview("/", undefined, <OverviewPreviewContent />);
}

export function AdminMenuMockup() {
  return wrapPreview("/menu", "Menu", <MenuPreviewContent />);
}

export function AdminRulesMockup() {
  return wrapPreview("/ai-rules", "AI Rules", <AiRulesPreviewContent />);
}
