"use client";

import {
  CameraIcon,
  CheckIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PresentationChartBarIcon,
  QrCodeIcon,
  SparklesIcon,
  TrophyIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui";
import { peekAddonStatus, rememberAddonStatus } from "@/lib/addon-status-cache";
import { api, type AddonStatus } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

type CardConfig = {
  code: string;
  href: string;
  highlights: string[];
  icon: "photo" | "spin" | "presenter" | "banner" | "language" | "live";
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
];

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
  const priceLabel = (status.addon.price_display ?? "Rp199.000/month").replace(
    /\/\s*month/i,
    "",
  );

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
        <div className="relative aspect-[5/4] w-full overflow-hidden rounded-xl bg-slate-100">
          <div
            className={cn(
              "absolute inset-0",
              config.icon === "photo"
                ? "bg-[radial-gradient(ellipse_at_30%_20%,#fff7ed_0%,transparent_55%),linear-gradient(160deg,#fffbeb_0%,#ffedd5_42%,#fed7aa_100%)]"
                : config.icon === "presenter"
                  ? "bg-[radial-gradient(ellipse_at_40%_15%,#f5f3ff_0%,transparent_55%),linear-gradient(160deg,#ede9fe_0%,#ddd6fe_42%,#c4b5fd_100%)]"
                  : config.icon === "banner"
                    ? "bg-[radial-gradient(ellipse_at_35%_20%,#fff1f2_0%,transparent_55%),linear-gradient(160deg,#ffe4e6_0%,#fecdd3_42%,#fda4af_100%)]"
                    : config.icon === "language"
                      ? "bg-[radial-gradient(ellipse_at_30%_15%,#ecfeff_0%,transparent_55%),linear-gradient(160deg,#cffafe_0%,#a5f3fc_42%,#67e8f9_100%)]"
                    : config.icon === "live"
                      ? "bg-[radial-gradient(ellipse_at_25%_20%,#fef2f2_0%,transparent_55%),linear-gradient(160deg,#fee2e2_0%,#fecaca_42%,#f87171_100%)]"
                    : "bg-[radial-gradient(ellipse_at_70%_20%,#eef2ff_0%,transparent_55%),linear-gradient(160deg,#e0e7ff_0%,#c7d2fe_42%,#a5b4fc_100%)]",
            )}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative flex h-[62%] w-[58%] items-center justify-center rounded-2xl border border-white/70 bg-white/55 shadow-lg backdrop-blur-sm transition group-hover:scale-[1.02]">
              {config.icon === "photo" ? (
                <CameraIcon className="size-9 text-orange-500/80" aria-hidden />
              ) : config.icon === "presenter" ? (
                <PresentationChartBarIcon className="size-9 text-violet-600/80" aria-hidden />
              ) : config.icon === "banner" ? (
                <MegaphoneIcon className="size-9 text-rose-500/80" aria-hidden />
              ) : config.icon === "language" ? (
                <GlobeAltIcon className="size-9 text-cyan-600/80" aria-hidden />
              ) : config.icon === "live" ? (
                <VideoCameraIcon className="size-9 text-red-500/80" aria-hidden />
              ) : (
                <TrophyIcon className="size-9 text-indigo-500/80" aria-hidden />
              )}
              <div className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-lg bg-white/90 shadow-sm ring-1 ring-slate-200/70">
                {config.icon === "photo" ? (
                  <QrCodeIcon className="size-4 text-slate-700" aria-hidden />
                ) : (
                  <SparklesIcon
                    className={cn(
                      "size-4",
                      config.icon === "presenter"
                        ? "text-violet-600"
                        : config.icon === "banner"
                          ? "text-rose-600"
                          : config.icon === "language"
                            ? "text-cyan-600"
                            : config.icon === "live"
                              ? "text-red-600"
                          : "text-indigo-600",
                    )}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          </div>
          {(isActive || isPending) && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-white/40 bg-white/95 px-2 py-0.5 text-[11px] font-medium text-slate-900 shadow-sm backdrop-blur">
              {isActive ? (
                <>
                  <CheckIcon className="size-3.5 text-orange-500" aria-hidden />
                  Active
                </>
              ) : (
                "Pending"
              )}
            </span>
          )}
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
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Per workspace
            </p>
            <p className="truncate text-sm font-semibold tabular-nums text-slate-900">
              {priceLabel}
              <span className="ml-0.5 font-normal text-slate-500">/mo</span>
            </p>
          </div>
          <span className="shrink-0 text-sm font-medium text-orange-600 transition group-hover:text-orange-700">
            View details
          </span>
        </div>
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
      const hasCompleteCache = CARDS.every((card) => cached[card.code]);
      if (hasCompleteCache) {
        setStatuses(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const results = await Promise.all(
          CARDS.map(async (card) => {
            const data = await api.getAddonStatus(token, business.id, card.code);
            return [card.code, data] as const;
          }),
        );
        if (!cancelled) {
          for (const [code, data] of results) {
            rememberAddonStatus(business.id, code, data);
          }
          setStatuses(Object.fromEntries(results));
        }
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
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100 ring-1 ring-slate-200/80" />
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100 ring-1 ring-slate-200/80" />
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100 ring-1 ring-slate-200/80" />
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
