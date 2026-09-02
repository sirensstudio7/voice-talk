"use client";

import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

import { DailyOrdersChart, TopProductsPanel } from "@/components/stats-charts";
import { PageHeader } from "@voicetalk/ui";
import { Button } from "@voicetalk/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@voicetalk/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createHttpClient } from '@voicetalk/api-client';
//, type StatsDailyPoint, type TopProductStat } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { exportAnalyticsCsv, exportAnalyticsXls } from "@/lib/export-analytics";

export function AnalyticsPageClient() {
  const { token, business } = useAuth();
  const [daily, setDaily] = useState<StatsDailyPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !business) return;

    setLoading(true);
    void api
      .statsSummary(token, business.id)
      .then((summary) => {
        setDaily(summary.daily);
        setTopProducts(summary.top_products);
      })
      .finally(() => setLoading(false));
  }, [token, business]);

  const exportData = business
    ? {
        businessSlug: business.slug,
        daily,
        topProducts,
      }
    : null;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Orders over time and top products."
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={loading || !exportData}>
                <ArrowDownTrayIcon />
                Export
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  if (!exportData) return;
                  exportAnalyticsCsv(exportData);
                }}
              >
                <TableCellsIcon />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  if (!exportData) return;
                  exportAnalyticsXls(exportData);
                }}
              >
                <TableCellsIcon />
                Export Excel (.xls)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-2">
        <DailyOrdersChart data={daily} loading={loading} />
        <TopProductsPanel products={topProducts} loading={loading} />
      </div>
    </>
  );
}
