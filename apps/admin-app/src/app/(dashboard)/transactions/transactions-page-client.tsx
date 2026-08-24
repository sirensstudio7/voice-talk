"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/ui";
import { api, type BillingTransaction } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

function statusClass(status: string) {
  if (status === "approved" || status === "active") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (status === "pending") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  if (status === "rejected") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }
  return "bg-slate-50 text-slate-600 ring-slate-200";
}

export function TransactionsPageClient() {
  const { token } = useAuth();
  const [items, setItems] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const result = await api.listTransactions(token);
        if (!cancelled) setItems(result.items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load transactions");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        subtitle="Plan and add-on payment requests for your account."
      />

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Proof</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={`${item.type}-${item.id}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-800">
                    {item.transaction_code ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    {item.workspace_name ? (
                      <p className="text-xs text-slate-500">{item.workspace_name}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">
                    {item.type === "addon" ? "Add-on" : item.type === "topup" ? "Minutes" : "Plan"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1",
                        statusClass(item.status),
                      )}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{item.amount_label ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {item.payment_proof_url ? (
                      <a
                        href={item.payment_proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-orange-600 underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
