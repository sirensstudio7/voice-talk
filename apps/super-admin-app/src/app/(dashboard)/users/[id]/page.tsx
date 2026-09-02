"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@voicetalk/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { token, admin } = useAuth();
  const [user, setUser] = useState<Awaited<ReturnType<typeof api.getUser>> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      setUser(await api.getUser(token, id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: "active" | "suspended", action: "approve" | "reject" | "suspend" | "reactivate") {
    if (!token || !id) return;
    const label =
      action === "approve"
        ? "approve this registration"
        : action === "reject"
          ? "reject this registration"
          : action === "suspend"
            ? "suspend this user"
            : "reactivate this user";
    if (!confirm(`Are you sure you want to ${label}?`)) return;
    try {
      await api.setUserStatus(token, id, status);
      setMessage(
        action === "approve"
          ? "Registration approved."
          : action === "reject"
            ? "Registration rejected."
            : action === "suspend"
              ? "User suspended."
              : "User reactivated.",
      );
      await load();
      window.dispatchEvent(new Event("platform-users-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function resetPassword() {
    if (!token || !id) return;
    if (!confirm("Generate a temporary password for this user?")) return;
    try {
      const result = await api.resetUserPassword(token, id);
      setMessage(`Temporary password: ${result.temporary_password}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    }
  }

  if (!user && !error) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!user) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/users" className="text-sm text-primary hover:underline">
            ← Users
          </Link>
          <h2 className="mt-2 text-2xl font-semibold">{user.name || user.email}</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.status === "pending" ? (
            <>
              <Button variant="success" onClick={() => void setStatus("active", "approve")}>
                Approve
              </Button>
              <Button variant="danger" onClick={() => void setStatus("suspended", "reject")}>
                Reject
              </Button>
            </>
          ) : user.status === "active" ? (
            <Button variant="danger" onClick={() => void setStatus("suspended", "suspend")}>
              Suspend
            </Button>
          ) : (
            <Button variant="success" onClick={() => void setStatus("active", "reactivate")}>
              Reactivate
            </Button>
          )}
          <Button variant="outline" onClick={() => void resetPassword()}>
            Reset password
          </Button>
        </div>
      </div>

      {message ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Status</p>
          <div className="mt-2">
            <StatusBadge status={user.status} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Phone</p>
          <p className="mt-2">{user.phone || "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Last login</p>
          <p className="mt-2">
            {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "—"}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Workspaces</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                {admin?.role === "super" ? <th className="px-4 py-3">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {user.workspaces.map((ws) => (
                <tr key={ws.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/businesses/${ws.id}`} className="text-primary hover:underline">
                      {ws.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{ws.role}</td>
                  <td className="px-4 py-3 capitalize">{ws.plan}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ws.is_active ? "active" : "disabled"} />
                  </td>
                  {admin?.role === "super" ? (
                    <td className="px-4 py-3">
                      <ImpersonateButton businessId={ws.id} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ImpersonateButton({ businessId }: { businessId: string }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!token) return;
    if (!confirm("Open an impersonation session for this workspace?")) return;
    setBusy(true);
    try {
      const result = await api.impersonate(token, businessId);
      window.open(
        `${result.merchant_admin_url}/#platform_impersonate=${encodeURIComponent(result.access_token)}&business=${businessId}`,
        "_blank",
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Impersonation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
      Impersonate
    </Button>
  );
}
