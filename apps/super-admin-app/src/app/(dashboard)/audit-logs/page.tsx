"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, type AuditLogItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { deferEffectRun } from "@/lib/defer-effect-run";

export default function AuditLogsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const limit = 50;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listAuditLogs(token, { page, limit });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    }
  }, [token, page]);

  useEffect(() => {
    deferEffectRun(load);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Audit Logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable record of administrative actions.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {new Date(item.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div>{item.admin_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{item.admin_email}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{item.action}</td>
                <td className="px-4 py-3">
                  <div className="text-xs">
                    {item.entity_type} · {item.entity_id || "—"}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.ip_address || "—"}</td>
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
