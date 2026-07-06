"use client";

import { useEffect, useState } from "react";

import { DailyOrdersChart, TopProductsPanel } from "@/components/stats-charts";
import { PageHeader, StatCard } from "@/components/ui";
import { api, type StatsDailyPoint, type StatsOverview, type TopProductStat } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@voicetalk/shared";

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function OverviewPageClient() {
  const { token, business } = useAuth();
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [daily, setDaily] = useState<StatsDailyPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductStat[]>([]);
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
    ])
      .then(([overview, dailyData, topData]) => {
        setStats(overview);
        setDaily(dailyData);
        setTopProducts(topData);
      })
      .finally(() => setLoading(false));
  }, [token, business]);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={business ? `Managing ${business.name}` : "Select a business"}
      />

      <div className="grid gap-[16px] md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Sessions today" value={String(stats?.sessions_today ?? 0)} />
        <StatCard label="Orders today" value={String(stats?.orders_today ?? 0)} />
        <StatCard label="Revenue today" value={formatCurrency(stats?.revenue_today ?? 0)} />
        <StatCard label="Avg order value" value={formatCurrency(stats?.avg_order_value ?? 0)} />
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

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <DailyOrdersChart data={daily} loading={loading} />
        <TopProductsPanel products={topProducts} loading={loading} limit={5} />
      </div>
    </>
  );
}
