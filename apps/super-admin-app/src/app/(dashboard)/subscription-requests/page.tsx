"use client";

import { useCallback, useEffect, useState } from "react";

import { SlideOver } from "@/components/slide-over";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type SubscriptionRequestDetail, type SubscriptionRequestItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

const DURATION_OPTIONS = [
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "custom", label: "Custom end date" },
] as const;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function SubscriptionRequestsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<SubscriptionRequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SubscriptionRequestDetail | null>(null);
  const [planCode, setPlanCode] = useState("");
  const [duration, setDuration] = useState("12");
  const [customEndsAt, setCustomEndsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listSubscriptionRequests(token, {
        page,
        limit: 25,
        status: status || undefined,
        search: search || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [token, page, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    if (!token) return;
    setError(null);
    try {
      const data = await api.getSubscriptionRequest(token, id);
      setDetail(data);
      setPlanCode(data.requested_plan.code);
      setDuration("12");
      setCustomEndsAt("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load request");
    }
  }

  async function activate() {
    if (!token || !detail) return;
    setActing(true);
    setError(null);
    try {
      await api.activateSubscriptionRequest(token, detail.id, {
        plan_code: planCode,
        duration_months: duration === "custom" ? undefined : Number(duration),
        custom_ends_at: duration === "custom" && customEndsAt ? customEndsAt : undefined,
        notes,
      });
      setDetail(null);
      window.dispatchEvent(new Event("platform-subscription-requests-changed"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setActing(false);
    }
  }

  async function reject() {
    if (!token || !detail) return;
    setActing(true);
    setError(null);
    try {
      await api.rejectSubscriptionRequest(token, detail.id, notes);
      setDetail(null);
      window.dispatchEvent(new Event("platform-subscription-requests-changed"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <>
      <PageHeader
        title="Subscription requests"
        subtitle="Review customer plan selections and activate packages after offline payment."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Search customer…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Select
          value={status || "all"}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v === "all" ? "" : v);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Requested plan</th>
              <th className="px-4 py-3 font-medium">Trial expiry</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No subscription requests found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{item.customer.name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.customer.email}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">{item.requested_plan.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(item.trial_ends_at)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(item.created_at)}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => void openDetail(item.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages} · {total} total
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <SlideOver
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Subscription request"
        description={detail?.customer.email}
        footer={
          detail?.status === "pending" ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                disabled={acting}
                variant="outline"
                className="text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={() => void reject()}
              >
                Reject
              </Button>
              <Button className="sm:min-w-40" disabled={acting} onClick={() => void activate()}>
                {acting ? "Working…" : "Activate plan"}
              </Button>
            </div>
          ) : (
            <div className="flex w-full justify-end">
              <Button variant="outline" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          )
        }
      >
        {detail ? (
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold tracking-tight">
                    {detail.customer.name || "Unnamed customer"}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {detail.customer.email}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.customer.phone || "No phone on file"}
                  </p>
                </div>
                <StatusBadge status={detail.status} />
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Request
              </h4>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">Requested plan</dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    {detail.requested_plan.name}
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    {detail.requested_plan.workspace_limit} workspaces
                  </dd>
                </div>
                <div className="rounded-lg border border-border px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">Submitted</dt>
                  <dd className="mt-0.5 text-sm font-medium">{formatDate(detail.created_at)}</dd>
                </div>
              </dl>
            </section>

            <section className="space-y-3">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Current entitlement
              </h4>
              <dl className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium">
                    {detail.entitlement.plan_name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {detail.entitlement.status}
                    </span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Workspaces</dt>
                  <dd className="font-medium tabular-nums">
                    {detail.entitlement.workspace_count} / {detail.entitlement.workspace_limit}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Trial</dt>
                  <dd className="max-w-[60%] text-right text-xs leading-relaxed text-foreground">
                    {formatDate(detail.entitlement.trial_started_at)}
                    <span className="text-muted-foreground"> → </span>
                    {formatDate(detail.entitlement.trial_ends_at)}
                  </dd>
                </div>
              </dl>
            </section>

            {detail.status === "pending" ? (
              <section className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Activation
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Confirm the plan and period after offline payment is verified.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Plan to activate</label>
                  <Select value={planCode} onValueChange={setPlanCode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {detail.available_plans.map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.name} ({p.workspace_limit} workspaces)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Duration</label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {duration === "custom" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Ends at</label>
                    <input
                      type="datetime-local"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={customEndsAt}
                      onChange={(e) => setCustomEndsAt(e.target.value)}
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Internal notes</label>
                  <textarea
                    className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Payment reference, invoice #, bank transfer note…"
                  />
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                This request was already <span className="font-medium text-foreground">{detail.status}</span>.
                {detail.notes ? (
                  <p className="mt-2 text-foreground">
                    <span className="text-muted-foreground">Notes: </span>
                    {detail.notes}
                  </p>
                ) : null}
              </section>
            )}
          </div>
        ) : null}
      </SlideOver>
    </>
  );
}
