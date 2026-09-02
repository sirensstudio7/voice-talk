"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/UiBlocks";
import { Button } from "@voicetalk/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voicetalk/ui";
import { api, type BusinessListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const WORKSPACE_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
] as const;

function statusDotClass(status: string) {
  if (status === "active") return "bg-emerald-500";
  if (status === "disabled") return "bg-red-500";
  return "bg-muted-foreground";
}

function StatusIndicator({ status, label }: { status: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(status))} />
      <span>{label}</span>
    </span>
  );
}

function WorkspaceStatusFilterSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const filterValue = value || "all";
  const selected =
    filterValue === "all"
      ? { value: "all", label: "All statuses" }
      : WORKSPACE_STATUS_OPTIONS.find((option) => option.value === filterValue);

  return (
    <Select
      value={filterValue}
      onValueChange={(next) => onChange(next === "all" ? "" : next)}
    >
      <SelectTrigger className="w-[132px]">
        <SelectValue placeholder="All statuses">
          {selected?.value === "all" ? (
            selected.label
          ) : selected ? (
            <StatusIndicator status={selected.value} label={selected.label} />
          ) : (
            "All statuses"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="all" textValue="All statuses">
          All statuses
        </SelectItem>
        {WORKSPACE_STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            <StatusIndicator status={option.value} label={option.label} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function BusinessesPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<BusinessListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const limit = 25;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listBusinesses(token, { page, limit, search, status });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspaces");
    }
  }, [token, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Workspaces"
        subtitle="All customer businesses on the platform."
        titleAction={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:max-w-sm"
          placeholder="Search name or slug"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <WorkspaceStatusFilterSelect
          value={status}
          onChange={(next) => {
            setPage(1);
            setStatus(next);
          }}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/businesses/${item.id}`} className="font-medium text-primary hover:underline">
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {item.owner_name || item.owner_email || "—"}
                </td>
                <td className="px-4 py-3 capitalize">{item.plan}</td>
                <td className="px-4 py-3 text-muted-foreground">{item.domain}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} · {total} total
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
            disabled={page * limit >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
