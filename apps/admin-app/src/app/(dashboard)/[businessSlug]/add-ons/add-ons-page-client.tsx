"use client";

import {
  CalendarDaysIcon,
  CameraIcon,
  CheckIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PresentationChartBarIcon,
  TrophyIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui";
import { peekAddonStatus, rememberAddonStatuses } from "@/lib/addon-status-cache";
import { api, type AddonStatus } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

type CardConfig = {
  code: string;
  href: string;
  highlights: string[];
  icon: "photo" | "spin" | "presenter" | "banner" | "language" | "live" | "booking";
};

type StatusFilter = "all" | "active" | "pending" | "available";

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "pending", label: "Pending" },
  { id: "available", label: "Available" },
];

function addonLifecycle(
  status: AddonStatus,
): Exclude<StatusFilter, "all"> {
  if (status.subscription_status === "active") return "active";
  if (status.pending_request) return "pending";
  return "available";
}

const CARD_ICONS = {
  photo: CameraIcon,
  spin: TrophyIcon,
  presenter: PresentationChartBarIcon,
  banner: MegaphoneIcon,
  language: GlobeAltIcon,
  live: VideoCameraIcon,
  booking: CalendarDaysIcon,
} as const;

const THUMB_STYLE = {
  photo: "bg-stone-100 text-stone-500",
  spin: "bg-orange-50 text-orange-500",
  presenter: "bg-slate-800 text-white",
  banner: "bg-orange-100 text-orange-600",
  language: "bg-slate-100 text-slate-500",
  live: "bg-neutral-900 text-white",
  booking: "bg-emerald-50 text-emerald-600",
} as const;

const CARDS: CardConfig[] = [
  {
    code: "smart_photo_moment",
    href: "/add-ons/smart-photo-moment",
    highlights: ["Voice trigger", "Auto capture", "QR download"],
    icon: "photo",
  },
  {
    code: "lucky_spin",
    href: "/add-ons/lucky-spin",
    highlights: ["Campaigns", "Prizes", "Vouchers"],
    icon: "spin",
  },
  {
    code: "ai_presenter",
    href: "/add-ons/ai-presenter",
    highlights: ["Deck upload", "AI narration", "Live sessions"],
    icon: "presenter",
  },
  {
    code: "campaign_banner",
    href: "/add-ons/campaign-banner",
    highlights: ["Auto-slide", "Schedule", "Click analytics"],
    icon: "banner",
  },
  {
    code: "language_pack",
    href: "/add-ons/language-pack",
    highlights: ["Russian", "Chinese", "Uzbek + more"],
    icon: "language",
  },
  {
    code: "live",
    href: "/add-ons/live",
    highlights: ["AI host", "Chat", "Your products"],
    icon: "live",
  },
  {
    code: "booking",
    href: "/add-ons/booking",
    highlights: ["Doctors", "Hours", "Voice book"],
    icon: "booking",
  },
];

function addonPriceParts(priceDisplay: string): { currency: string; amount: string } {
  const raw = (priceDisplay || "Rp199.000/month").replace(/\/\s*month/i, "").trim();
  const match = raw.match(/^([A-Za-z]+)\s*(.+)$/);
  if (match) return { currency: match[1], amount: match[2] };
  return { currency: "", amount: raw };
}

function AddonCard({
  status,
  config,
  slug,
}: {
  status: AddonStatus;
  config: CardConfig;
  slug: string;
}) {
  const isActive = status.subscription_status === "active";
  const isPending = Boolean(status.pending_request);
  const { currency, amount } = addonPriceParts(
    status.addon.price_display ?? "Rp199.000/month",
  );
  const Icon = CARD_ICONS[config.icon];

  return (
    <Link
      href={adminPath(slug, config.href)}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2",
        isActive
          ? "ring-2 ring-orange-300"
          : isPending
            ? "ring-2 ring-amber-300"
            : "ring-slate-200/80 hover:ring-slate-300",
      )}
    >
      <div className="px-1 pt-1">
        <div
          className={cn(
            "relative aspect-[5/4] overflow-hidden rounded-xl",
            THUMB_STYLE[config.icon],
          )}
        >
          <Icon className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2" aria-hidden />
          {isActive || isPending ? (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-sm">
              {isActive ? (
                <>
                  <CheckIcon className="size-3.5 text-orange-500" aria-hidden />
                  Active
                </>
              ) : (
                "Pending"
              )}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div>
          <h2 className="line-clamp-1 text-base font-semibold leading-tight tracking-tight text-slate-900">
            {status.addon.name}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-slate-500">
            {status.addon.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {config.highlights.map((label) => (
            <span
              key={label}
              className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80"
            >
              {label}
            </span>
          ))}
        </div>
        <p className="mt-auto flex items-baseline gap-1.5">
          {currency ? (
            <span className="text-sm font-medium text-slate-500">{currency}</span>
          ) : null}
          <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
            {amount}
          </span>
          <span className="text-sm text-slate-500">/ month</span>
        </p>
      </div>
    </Link>
  );
}

function cachedAddonStatuses(businessId: string): Record<string, AddonStatus> {
  const initial: Record<string, AddonStatus> = {};
  for (const card of CARDS) {
    const cached = peekAddonStatus(businessId, card.code);
    if (cached) initial[card.code] = cached;
  }
  return initial;
}

export function AddOnsPageClient() {
  const { token, business } = useAuth();
  const [statuses, setStatuses] = useState<Record<string, AddonStatus>>(() =>
    business?.id ? cachedAddonStatuses(business.id) : {},
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () => !(business?.id && CARDS.every((card) => peekAddonStatus(business.id, card.code))),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token || !business?.id) return;
      const cached = cachedAddonStatuses(business.id);
      if (Object.keys(cached).length > 0) {
        setStatuses(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const results = await api.listAddonStatuses(token, business.id);
        if (cancelled) return;
        rememberAddonStatuses(business.id, results);
        setStatuses(
          Object.fromEntries(results.map((status) => [status.addon.code, status])),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load add-ons");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, business?.id]);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return CARDS.filter((card) => {
      const status = statuses[card.code];
      if (!status) return false;

      if (statusFilter !== "all" && addonLifecycle(status) !== statusFilter) {
        return false;
      }

      if (!query) return true;
      const haystack = [
        status.addon.name,
        status.addon.description,
        ...card.highlights,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [statuses, search, statusFilter]);

  const filterCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: 0,
      active: 0,
      pending: 0,
      available: 0,
    };
    for (const card of CARDS) {
      const status = statuses[card.code];
      if (!status) continue;
      counts.all += 1;
      counts[addonLifecycle(status)] += 1;
    }
    return counts;
  }, [statuses]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add-ons"
        subtitle="Extend your kiosk with premium experiences."
      />

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!loading ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search add-ons…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatusFilter(item.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === item.id
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-100",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "ml-1.5 tabular-nums",
                    statusFilter === item.id ? "text-white/70" : "text-slate-400",
                  )}
                >
                  {filterCounts[item.id]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {CARDS.map((card) => (
            <div
              key={card.code}
              className="h-72 animate-pulse rounded-2xl bg-slate-100 ring-1 ring-slate-200/80"
            />
          ))}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center">
          <p className="text-base font-semibold text-slate-900">No matching add-ons</p>
          <p className="mt-2 text-sm text-slate-500">
            Try a different search term or clear your filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
            className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCards.map((card) => {
            const status = statuses[card.code];
            if (!status) return null;
            return (
              <AddonCard
                key={card.code}
                status={status}
                config={card}
                slug={business?.slug ?? ""}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
