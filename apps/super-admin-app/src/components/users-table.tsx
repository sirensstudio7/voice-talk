"use client";

import Link from "next/link";
import { useState } from "react";
import { Cog6ToothIcon, EllipsisVerticalIcon } from "@heroicons/react/24/outline";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserApiSettingsDialog } from "@/components/user-api-settings-dialog";
import { api, type PlatformUser } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function ApprovalActions({
  userId,
  token,
  onUpdated,
}: {
  userId: string;
  token: string;
  onUpdated: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function updateStatus(status: "active" | "suspended", action: "approve" | "reject") {
    const label = action === "approve" ? "approve this registration" : "reject this registration";
    if (!confirm(`Are you sure you want to ${label}?`)) return;

    setBusy(action);
    try {
      await api.setUserStatus(token, userId, status);
      window.dispatchEvent(new Event("platform-users-changed"));
      await onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          disabled={busy !== null}
          aria-label="Registration actions"
        >
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          disabled={busy !== null}
          onSelect={() => void updateStatus("active", "approve")}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy !== null}
          className="text-destructive focus:text-destructive"
          onSelect={() => void updateStatus("suspended", "reject")}
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UsersTable({
  users,
  token,
  onUserUpdated,
  showApprovalActions = false,
}: {
  users: PlatformUser[];
  token?: string | null;
  onUserUpdated?: () => void | Promise<void>;
  showApprovalActions?: boolean;
}) {
  const { admin } = useAuth();
  const canWriteApiKeys = admin?.role === "super";
  const [settingsUser, setSettingsUser] = useState<PlatformUser | null>(null);
  const hasPending = users.some((user) => user.status === "pending");
  const showPendingActions = showApprovalActions && Boolean(token) && hasPending;

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        No registered users found.
      </div>
    );
  }

  return (
    <>
      <div className="max-w-full overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Workspaces</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/users/${user.id}`} className="font-medium text-foreground hover:text-primary">
                    {user.name || "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{user.phone || "—"}</td>
                <td className="px-4 py-3 tabular-nums">{user.workspace_count}</td>
                <td className="px-4 py-3 capitalize">{user.plan}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={user.status} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(user.created_at)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(user.last_login_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {token ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "relative size-8 text-muted-foreground",
                          user.has_custom_api_keys && "text-foreground",
                        )}
                        aria-label={`API settings for ${user.name || user.email}`}
                        onClick={() => setSettingsUser(user)}
                      >
                        <Cog6ToothIcon className="size-4" />
                        {user.has_custom_api_keys ? (
                          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-orange-500" />
                        ) : null}
                      </Button>
                    ) : null}
                    {showPendingActions && user.status === "pending" && token && onUserUpdated ? (
                      <ApprovalActions userId={user.id} token={token} onUpdated={onUserUpdated} />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {settingsUser && token ? (
        <UserApiSettingsDialog
          userId={settingsUser.id}
          userName={settingsUser.name}
          userEmail={settingsUser.email}
          token={token}
          canWrite={canWriteApiKeys}
          open
          onClose={() => setSettingsUser(null)}
          onSaved={onUserUpdated}
        />
      ) : null}
    </>
  );
}
