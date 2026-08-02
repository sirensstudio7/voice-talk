"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRightIcon,
} from "@heroicons/react/24/outline";

import { DailyOrdersChart, TopProductsPanel } from "@/components/stats-charts";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader, StatCard, StatCardGrid } from "@/components/ui";
import {
  api,
  type AiRules,
  type StatsDailyPoint,
  type StatsOverview,
  type TopProductStat,
} from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
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
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!token || !business) {
      setStatsLoading(false);
      return;
    }

    let cancelled = false;
    setStatsLoading(true);
    setStats(null);
    setDaily([]);
    setTopProducts([]);
    setAiRules(null);

    void api
      .statsSummary(token, business.id)
      .then((summary) => {
        if (cancelled) return;
        setStats(summary.overview);
        setDaily(summary.daily);
        setTopProducts(summary.top_products);
        setAiRules(summary.ai_rules);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, business]);

  const showEmptyState = !statsLoading && isWorkspaceEmpty(stats, daily);
  const orderingEnabled = business?.capabilities?.ordering_enabled ?? true;
  const bookingEnabled = business?.capabilities?.booking_enabled ?? false;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={business ? `Managing ${business.name}` : "Select a business"}
      />

      <SubscriptionBanner />

      {showEmptyState && business ? (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Welcome to {business.name}</CardTitle>
            <CardDescription className="mx-auto max-w-lg text-balance">
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
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-3 sm:flex-row sm:justify-center">
            {orderingEnabled ? (
              <Button asChild>
                <Link href={adminPath(business.slug, "/menu")}>Add your menu</Link>
              </Button>
            ) : bookingEnabled ? (
              <>
                <Button asChild>
                  <Link href={adminPath(business.slug, "/menu")}>Add treatments</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href={adminPath(business.slug, "/schedule")}>Set schedule</Link>
                </Button>
              </>
            ) : (
              <Button asChild>
                <Link href={adminPath(business.slug, "/knowledge")}>Add knowledge entries</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={customerAppUrl(business.slug)} target="_blank" rel="noopener noreferrer">
                Preview customer page
                <ArrowUpRightIcon />
              </a>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          <StatCardGrid
            className={
              orderingEnabled
                ? "@5xl/main:grid-cols-3 @7xl/main:grid-cols-6"
                : bookingEnabled
                  ? "@5xl/main:grid-cols-3"
                  : "@5xl/main:grid-cols-2"
            }
          >
            <StatCard
              label="Sessions today"
              value={statsLoading ? "…" : String(stats?.sessions_today ?? 0)}
            />
            {orderingEnabled ? (
              <>
                <StatCard
                  label="Orders today"
                  value={statsLoading ? "…" : String(stats?.orders_today ?? 0)}
                />
                <StatCard
                  label="Revenue today"
                  value={statsLoading ? "…" : formatCurrency(stats?.revenue_today ?? 0)}
                />
                <StatCard
                  label="Avg order value"
                  value={statsLoading ? "…" : formatCurrency(stats?.avg_order_value ?? 0)}
                />
              </>
            ) : null}
            <StatCard
              label="Avg call duration"
              value={statsLoading ? "…" : formatDuration(stats?.avg_call_duration_seconds)}
            />
            <StatCard
              label="Active sessions"
              value={statsLoading ? "…" : String(stats?.active_sessions ?? 0)}
            />
          </StatCardGrid>

          {orderingEnabled ? (
            <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-2">
              <DailyOrdersChart data={daily} loading={statsLoading} />
              <TopProductsPanel products={topProducts} loading={statsLoading} />
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
