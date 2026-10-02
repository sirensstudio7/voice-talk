"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageHeader, StatCard, StatCardGrid } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import { UsersTable } from "@/components/users-table";
import { api, type DashboardResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { deferEffectRun } from "@/lib/defer-effect-run";

export default function DashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.dashboard(token, {
        page,
        limit: 15,
        search,
        status,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [token, page, search, status]);

  useEffect(() => {
    deferEffectRun(load);
    const id = setInterval(() => void load(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const metrics = data?.metrics;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        subtitle="Platform health and registered customer accounts."
        titleAction={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <StatCardGrid className="@xl/main:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-7">
        <StatCard label="Total users" value={String(metrics?.total_users ?? "—")} />
        <StatCard label="Active users (30d)" value={String(metrics?.active_users_30d ?? "—")} />
        <StatCard
          label="Pending approval"
          value={String(metrics?.pending_users ?? "—")}
          className={metrics?.pending_users ? "border-sky-200 bg-sky-50/40" : undefined}
        />
        <StatCard label="Workspaces" value={String(metrics?.total_workspaces ?? "—")} />
        <StatCard label="Active subscriptions" value={String(metrics?.active_subscriptions ?? "—")} />
        <StatCard
          label="Manual MRR"
          value={metrics ? `$${metrics.manual_mrr.toLocaleString()}` : "—"}
        />
        <StatCard
          label="Voice minutes (month)"
          value={
            metrics
              ? metrics.voice_minutes_this_month.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })
              : "—"
          }
        />
      </StatCardGrid>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Registered users</h3>
            <p className="text-sm text-muted-foreground">
              Everyone who signed up for a LORESCALE customer account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/users" className="text-sm font-medium text-primary hover:underline">
              View all users
            </Link>
            {(metrics?.pending_users ?? 0) > 0 ? (
              <Link
                href="/users?status=pending"
                className="text-sm font-medium text-sky-700 hover:underline"
              >
                Review {metrics?.pending_users} pending
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading && !data ? (
          <p className="text-sm text-muted-foreground">Loading users…</p>
        ) : (
          <UsersTable
            users={data?.users.items ?? []}
            token={token}
            showApprovalActions
            onUserUpdated={load}
          />
        )}

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data?.users.page ?? page} · {data?.users.total ?? 0} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data || page * data.users.limit >= data.users.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold tracking-tight">Recent signups</h3>
        <UsersTable
          users={data?.recent_signups ?? []}
          token={token}
          showApprovalActions
          onUserUpdated={load}
        />
      </section>
    </div>
  );
}
