"use client";

import {
  CameraIcon,
  CheckIcon,
  QrCodeIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/ui";
import { api, type AddonStatus } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const HIGHLIGHTS = ["Voice trigger", "Auto capture", "QR download"] as const;

export function AddOnsPageClient() {
  const { token, business } = useAuth();
  const [status, setStatus] = useState<AddonStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token || !business?.id) return;
      setLoading(true);
      setError(null);
      try {
        const data = await api.getAddonStatus(token, business.id);
        if (!cancelled) setStatus(data);
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

  const isActive = status?.subscription_status === "active";
  const isPending = Boolean(status?.pending_request);
  const priceLabel = (status?.addon.price_display ?? "Rp199.000/month").replace(
    /\/\s*month/i,
    "",
  );

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

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100 ring-1 ring-slate-200/80" />
        </div>
      ) : status ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Link
            href={adminPath(business?.slug ?? "", "/add-ons/smart-photo-moment")}
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
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#fff7ed_0%,transparent_55%),linear-gradient(160deg,#fffbeb_0%,#ffedd5_42%,#fed7aa_100%)]" />
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-[0.35]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 1px 1px, rgb(251 146 60 / 0.35) 1px, transparent 0)",
                    backgroundSize: "18px 18px",
                  }}
                />

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative h-[62%] w-[58%] rotate-[-4deg] rounded-2xl border border-white/70 bg-white/55 shadow-[0_18px_40px_-18px_rgba(154,52,18,0.45)] backdrop-blur-sm transition duration-300 group-hover:rotate-[-2deg] group-hover:scale-[1.02]">
                    <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-stone-200 via-orange-100 to-amber-200" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <CameraIcon className="size-9 text-orange-500/80" aria-hidden />
                    </div>
                    <div className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-lg bg-white/90 shadow-sm ring-1 ring-orange-200/70">
                      <QrCodeIcon className="size-4 text-slate-700" aria-hidden />
                    </div>
                  </div>
                  <div className="absolute right-[18%] top-[18%] flex size-8 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-orange-100">
                    <SparklesIcon className="size-4 text-orange-500" aria-hidden />
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
                {HIGHLIGHTS.map((label) => (
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
        </div>
      ) : null}
    </div>
  );
}
