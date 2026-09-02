"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState, type ReactNode } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@voicetalk/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { token, admin } = useAuth();
  const [business, setBusiness] = useState<Awaited<ReturnType<typeof api.getBusiness>> | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setBusiness(await api.getBusiness(token, id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: "active" | "disabled") {
    if (!token || !id) return;
    if (!confirm(`Set workspace status to ${status}?`)) return;
    try {
      await api.setBusinessStatus(token, id, status);
      setMessage(`Workspace marked as ${status}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function impersonate() {
    if (!token || !id) return;
    if (!confirm("Open an impersonation session for this workspace?")) return;
    try {
      const result = await api.impersonate(token, id);
      window.open(
        `${result.merchant_admin_url}/#platform_impersonate=${encodeURIComponent(result.access_token)}&business=${id}`,
        "_blank",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impersonation failed");
    }
  }

  if (!business && !error) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!business) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/businesses" className="text-sm text-primary hover:underline">
            ← Workspaces
          </Link>
          <h2 className="mt-2 text-2xl font-semibold">{business.name}</h2>
          <p className="text-sm text-muted-foreground">/{business.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {business.status === "active" ? (
            <Button variant="danger" onClick={() => void setStatus("disabled")}>
              Disable
            </Button>
          ) : (
            <Button variant="success" onClick={() => void setStatus("active")}>
              Enable
            </Button>
          )}
          {admin?.role === "super" ? (
            <Button variant="outline" onClick={() => void impersonate()}>
              Impersonate
            </Button>
          ) : null}
        </div>
      </div>

      {message ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Info label="Status" value={<StatusBadge status={business.status} />} />
        <Info label="Type" value={business.business_type || "—"} />
        <Info label="Products" value={String(business.products_count)} />
        <Info label="Voice sessions" value={String(business.voice_sessions_count)} />
        <Info label="Assistants" value={String(business.assistants_count)} />
        <Info label="WhatsApp" value={business.whatsapp_status} />
        <Info label="Model" value={business.gemini_model} />
        <Info
          label="Created"
          value={new Date(business.created_at).toLocaleString()}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-semibold">Subscription</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <p className="text-muted-foreground">Plan</p>
            <p className="capitalize">{business.subscription.plan_name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Billing</p>
            <p className="capitalize">{business.subscription.billing_cycle}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <StatusBadge status={business.subscription.status} />
          </div>
          <div>
            <p className="text-muted-foreground">Notes</p>
            <p>{business.subscription.notes || "—"}</p>
          </div>
        </div>
        <Link
          href="/subscriptions"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Manage in Subscriptions
        </Link>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Members</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {business.members.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/users/${m.id}`} className="text-primary hover:underline">
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                  <td className="px-4 py-3 capitalize">{m.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}
