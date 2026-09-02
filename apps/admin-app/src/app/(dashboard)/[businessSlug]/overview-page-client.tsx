"use client";

import Link from "next/link";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";

// Note: assuming these are copied over or exist.
import { DailyOrdersChart, TopProductsPanel } from "@/components/stats-charts";
import { SubscriptionBanner } from "@/components/subscription-banner";

import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  PageHeader,
  StatCard,
  StatCardGrid,
} from "@voicetalk/ui";
import { useStatsSummaryQuery } from "@voicetalk/api-client";
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

function isWorkspaceEmpty(stats: any, daily: any[]) {
  if (!stats) return false;
  const hasActivity =
    stats.sessions_today > 0 ||
    stats.orders_today > 0 ||
    stats.revenue_today > 0 ||
    stats.active_sessions > 0 ||
    (daily && daily.some((point) => point.orders > 0 || point.revenue > 0));
  return !hasActivity;
}

export function OverviewPageClient() {
  const { business } = useAuth();

  const { data, isLoading } = useStatsSummaryQuery(business?.id ?? "", {
    enabled: !!business?.id,
  });

  const stats = data?.overview ?? null;
  const daily = data?.daily ?? [];
  const topProducts = data?.top_products ?? [];
  const aiRules = data?.ai_rules ?? null;

  const showEmptyState = !isLoading && isWorkspaceEmpty(stats, daily);
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
              value={isLoading ? "…" : String(stats?.sessions_today ?? 0)}
            />
            {orderingEnabled ? (
              <>
                <StatCard
                  label="Orders today"
                  value={isLoading ? "…" : String(stats?.orders_today ?? 0)}
            />
                <StatCard
                  label="Revenue today"
                  value={isLoading ? "…" : formatCurrency(stats?.revenue_today ?? 0)}
                />
                <StatCard
                  label="Avg order value"
                  value={isLoading ? "…" : formatCurrency(stats?.avg_order_value ?? 0)}
                />
              </>
            ) : null}
            <StatCard
              label="Avg call duration"
              value={isLoading ? "…" : formatDuration(stats?.avg_call_duration_seconds)}
            />
            <StatCard
              label="Active sessions"
              value={isLoading ? "…" : String(stats?.active_sessions ?? 0)}
            />
          </StatCardGrid>

          {orderingEnabled ? (
            <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-2">
              <DailyOrdersChart data={daily} loading={isLoading} />
              <TopProductsPanel products={topProducts} loading={isLoading} />
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
