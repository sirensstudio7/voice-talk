"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

import { DailyOrdersChart, TopProductsPanel } from "@/components/stats-charts";
import { PageHeader, StatCard } from "@/components/ui";
import {
  api,
  type AiRules,
  type StatsDailyPoint,
  type StatsOverview,
  type TopProductStat,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { customerAppUrl } from "@/lib/customer-app";
import { formatCurrency } from "@/lib/currency";

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function isWorkspaceEmpty(stats: StatsOverview | null, daily: StatsDailyPoint[]) {
  if (!stats) return false;
  const hasActivity =
    stats.sessions_today > 0 ||
    stats.orders_today > 0 ||
    stats.revenue_today > 0 ||
    stats.active_sessions > 0 ||
    daily.some((point) => point.orders > 0 || point.revenue > 0);
  return !hasActivity;
}

export function OverviewPageClient() {
  const { token, business } = useAuth();
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [daily, setDaily] = useState<StatsDailyPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductStat[]>([]);
  const [aiRules, setAiRules] = useState<AiRules | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !business) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void Promise.all([
      api.statsOverview(token, business.id),
      api.statsDaily(token, business.id),
      api.statsTopProducts(token, business.id),
      api.getAiRules(token, business.id),
    ])
      .then(([overview, dailyData, topData, rules]) => {
        setStats(overview);
        setDaily(dailyData);
        setTopProducts(topData);
        setAiRules(rules);
      })
      .finally(() => setLoading(false));
  }, [token, business]);

  const showEmptyState = !loading && isWorkspaceEmpty(stats, daily);
  const orderingEnabled = business?.capabilities?.ordering_enabled ?? true;
  const bookingEnabled = business?.capabilities?.booking_enabled ?? false;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={business ? `Managing ${business.name}` : "Select a business"}
      />

      {showEmptyState && business ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
          <div className="mx-auto max-w-lg text-center">
            <p className="text-3xl">👋</p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
              Welcome to {business.name}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Your workspace is ready.
              {orderingEnabled
                ? aiRules?.language === "en"
                  ? " Your AI cashier is ready to take orders in English."
                  : " AI cashier kamu siap menerima pesanan dalam Bahasa Indonesia."
                : bookingEnabled
                  ? aiRules?.language === "en"
                    ? " Your AI receptionist is ready to book appointments in English."
                    : " Resepsionis AI kamu siap membuat janji temu dalam Bahasa Indonesia."
                  : aiRules?.language === "en"
                    ? " Your AI assistant is ready to answer customer questions."
                    : " Asisten AI kamu siap menjawab pertanyaan pelanggan."}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {orderingEnabled ? (
                <Link
                  href="/menu"
                  className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-600"
                >
                  Add your menu
                </Link>
              ) : bookingEnabled ? (
                <>
                  <Link
                    href="/menu"
                    className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-600"
                  >
                    Add treatments
                  </Link>
                  <Link
                    href="/schedule"
                    className="inline-flex min-w-[180px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Set schedule
                  </Link>
                </>
              ) : (
                <Link
                  href="/knowledge"
                  className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/20 transition hover:bg-orange-600"
                >
                  Add knowledge entries
                </Link>
              )}
              <a
                href={customerAppUrl(business.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Preview customer page
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`grid gap-[16px] md:grid-cols-2 ${orderingEnabled ? "xl:grid-cols-3 2xl:grid-cols-6" : bookingEnabled ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}
          >
            <StatCard label="Sessions today" value={String(stats?.sessions_today ?? 0)} />
            {orderingEnabled ? (
              <>
                <StatCard label="Orders today" value={String(stats?.orders_today ?? 0)} />
                <StatCard label="Revenue today" value={formatCurrency(stats?.revenue_today ?? 0)} />
                <StatCard label="Avg order value" value={formatCurrency(stats?.avg_order_value ?? 0)} />
              </>
            ) : null}
            <StatCard
              label="Avg call duration"
              value={formatDuration(stats?.avg_call_duration_seconds)}
              hint="All-time average"
            />
            <StatCard
              label="Active sessions"
              value={String(stats?.active_sessions ?? 0)}
              hint="Live voice sessions"
            />
          </div>

          {orderingEnabled ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <DailyOrdersChart data={daily} loading={loading} />
              <TopProductsPanel products={topProducts} loading={loading} limit={5} />
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
