"use client";

import { useCallback, useEffect, useState } from "react";

import { SlideOver } from "@/components/SlideOver";
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
import { api, type SubscriptionItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const textareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const PLAN_OPTIONS = [
  {
    value: "starter",
    label: "Starter",
    description: "1 workspace — essential limits for new accounts.",
  },
  {
    value: "growth",
    label: "Growth",
    description: "5 workspaces — higher usage and support priority.",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    description: "10 workspaces — custom limits, SLA, and dedicated support.",
  },
] as const;

const BILLING_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

const STATUS_OPTIONS = [
  { value: "active", label: "Active", hint: "Subscription is in good standing." },
  { value: "past_due", label: "Past due", hint: "Payment overdue — follow up manually." },
  { value: "cancelled", label: "Cancelled", hint: "Workspace access may be restricted." },
  { value: "trialing", label: "Trialing", hint: "Trial period before billing starts." },
] as const;

function statusDotClass(status: string) {
  if (status === "active") return "bg-emerald-500";
  if (status === "cancelled") return "bg-red-500";
  if (status === "past_due") return "bg-amber-500";
  if (status === "trialing") return "bg-sky-500";
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

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PlanSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = PLAN_OPTIONS.find((option) => option.value === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a plan">
          {selected?.label ?? "Select a plan"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PLAN_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            <span className="flex flex-col gap-0.5 py-0.5">
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BillingCyclePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-1">
      {BILLING_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              selected
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = STATUS_OPTIONS.find((option) => option.value === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select status">
          {selected ? (
            <StatusIndicator status={selected.value} label={selected.label} />
          ) : (
            "Select status"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            <span className="flex flex-col gap-0.5 py-0.5">
              <StatusIndicator status={option.value} label={option.label} />
              <span className="pl-4 text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusFilterSelect({
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
      : STATUS_OPTIONS.find((option) => option.value === filterValue);

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
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            <StatusIndicator status={option.value} label={option.label} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function SubscriptionsPage() {
  const { token, admin } = useAuth();
  const canWrite = admin?.role === "super" || admin?.role === "finance";
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<SubscriptionItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const limit = 25;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listSubscriptions(token, { page, limit, search, status });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
    }
  }, [token, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!token || !editing) return;
    setSaving(true);
    try {
      await api.updateSubscription(token, editing.id, {
        plan_name: editing.plan_name,
        billing_cycle: editing.billing_cycle,
        status: editing.status,
        notes: editing.notes,
        start_date: editing.start_date,
        end_date: editing.end_date,
      });
      setMessage("Subscription updated.");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update subscription");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Subscriptions"
        subtitle="Manual plan and payment status management (no Stripe in Phase 1)."
        titleAction={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm sm:max-w-sm"
          placeholder="Search workspace or plan"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <StatusFilterSelect
          value={status}
          onChange={(next) => {
            setPage(1);
            setStatus(next);
          }}
        />
      </div>

      {message ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Cycle</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              {canWrite ? <th className="px-4 py-3 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{item.business_name}</td>
                <td className="px-4 py-3 capitalize">{item.plan_name}</td>
                <td className="px-4 py-3 capitalize">{item.billing_cycle}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(item.updated_at).toLocaleString()}
                </td>
                {canWrite ? (
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...item })}>
                      Edit
                    </Button>
                  </td>
                ) : null}
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

      <SlideOver
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit subscription"
        description={editing?.business_name}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || !editing}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-5">
            <FormField label="Plan">
              <PlanSelect
                value={editing.plan_name}
                onChange={(plan_name) => setEditing({ ...editing, plan_name })}
              />
            </FormField>
            <FormField label="Billing cycle">
              <BillingCyclePicker
                value={editing.billing_cycle}
                onChange={(billing_cycle) => setEditing({ ...editing, billing_cycle })}
              />
            </FormField>
            <FormField label="Status">
              <StatusSelect
                value={editing.status}
                onChange={(status) => setEditing({ ...editing, status })}
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                className={`${textareaClass} min-h-28 resize-y`}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                placeholder="Internal billing notes…"
              />
            </FormField>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
