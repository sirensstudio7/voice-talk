"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UsersTable } from "@/components/users-table";
import { api, type PlatformUser } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { deferEffectRun } from "@/lib/defer-effect-run";

const USER_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
] as const;

function statusDotClass(status: string) {
  if (status === "active") return "bg-emerald-500";
  if (status === "pending") return "bg-sky-500";
  if (status === "suspended") return "bg-red-500";
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

function UserStatusFilterSelect({
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
      : USER_STATUS_OPTIONS.find((option) => option.value === filterValue);

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
        {USER_STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            <StatusIndicator status={option.value} label={option.label} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function UsersPage() {
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const [items, setItems] = useState<PlatformUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(() => searchParams.get("status") ?? "");
  const [error, setError] = useState<string | null>(null);
  const limit = 10;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listUsers(token, { page, limit, search, status });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }, [token, page, search, status]);

  useEffect(() => {
    deferEffectRun(load);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        subtitle="All registered customer accounts."
        titleAction={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs sm:max-w-sm">
          <input
            className={cn(
              "w-full rounded-md border border-input bg-background py-2 pl-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
              search ? "pr-10" : "pr-3",
            )}
            placeholder="Search name or email"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          {search ? (
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => {
                setPage(1);
                setSearch("");
              }}
              aria-label="Clear search"
            >
              <XMarkIcon className="size-4" />
            </button>
          ) : null}
        </div>
        <UserStatusFilterSelect
          value={status}
          onChange={(next) => {
            setPage(1);
            setStatus(next);
          }}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <UsersTable
        users={items}
        token={token}
        showApprovalActions
        onUserUpdated={load}
      />

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
