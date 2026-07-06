"use client";

import { useEffect, useState } from "react";

import { DailyOrdersChart, TopProductsPanel } from "@/components/stats-charts";
import { PageHeader } from "@/components/ui";
import { api, type StatsDailyPoint, type TopProductStat } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function AnalyticsPageClient() {
  const { token, business } = useAuth();
  const [daily, setDaily] = useState<StatsDailyPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !business) return;

    setLoading(true);
    void Promise.all([
      api.statsDaily(token, business.id),
      api.statsTopProducts(token, business.id),
    ])
      .then(([dailyData, topData]) => {
        setDaily(dailyData);
        setTopProducts(topData);
      })
      .finally(() => setLoading(false));
  }, [token, business]);

  return (
    <>
      <PageHeader title="Analytics" subtitle="Orders over time and top products." />

      <div className="grid gap-6 xl:grid-cols-2">
        <DailyOrdersChart data={daily} loading={loading} />
        <TopProductsPanel products={topProducts} loading={loading} />
      </div>
    </>
  );
}
