"use client";

import { useCallback, useEffect, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const STATUS_FILTERS = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
] as const;

function statusDotClass(status: string) {
  if (status === "paid") return "bg-emerald-500";
  if (status === "rejected") return "bg-red-500";
  return "bg-amber-500";
}

function formatIdr(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export default function TopupOrdersPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.listTopupOrders>>["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.listTopupOrders(token, { status, search: search.trim() || undefined });
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load top-up orders");
    }
  }, [token, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    if (!token) return;
    if (!confirm("Credit these minutes to the customer wallet?")) return;
    setBusyId(id);
    try {
      await api.approveTopupOrder(token, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!token) return;
    const notes = window.prompt("Rejection note (optional)") ?? "";
    setBusyId(id);
    try {
      await api.rejectTopupOrder(token, id, notes);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Minute top-ups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm offline payment, then credit purchased minutes. Duplicate approve is safe.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer or code"
          className="min-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>
              <span className="inline-flex items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(status))} />
                {STATUS_FILTERS.find((option) => option.value === status)?.label ?? "Status"}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {STATUS_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value} textValue={option.label}>
                <span className="inline-flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(option.value))} />
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Proof</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <p className="font-medium">{row.user_name || row.user_email}</p>
                  <p className="text-xs text-muted-foreground">{row.transaction_code}</p>
                </td>
                <td className="px-4 py-3">
                  {row.package_name}
                  <span className="block text-xs text-muted-foreground">{row.minutes} min</span>
                </td>
                <td className="px-4 py-3">{formatIdr(row.price_idr)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status === "paid" ? "approved" : row.status} />
                </td>
                <td className="px-4 py-3">
                  {row.payment_proof_url ? (
                    <a href={row.payment_proof_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.status === "pending" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => void approve(row.id)}
                      >
                        Credit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={() => void reject(row.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No top-up orders.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
