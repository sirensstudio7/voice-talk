"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, type AccountSubscription } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

function formatRemaining(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ${remHours} hour${remHours === 1 ? "" : "s"}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const mins = Math.max(1, Math.floor(ms / (1000 * 60)));
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SubscriptionBanner() {
  const { token } = useAuth();
  const [sub, setSub] = useState<AccountSubscription | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .getSubscription(token)
      .then((data) => {
        if (!cancelled) setSub(data);
      })
      .catch(() => {
        if (!cancelled) setSub(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!sub) return null;

  const remaining = formatRemaining(sub.trial_ends_at);
  const usage = `${sub.workspace_count} / ${sub.workspace_limit}`;

  if (sub.status === "trialing") {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            Demo Trial
            {remaining ? ` — ${remaining} remaining` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Workspaces: {usage}
            {sub.pending_request
              ? ` · Pending: ${sub.pending_request.requested_plan_name}`
              : ""}
          </p>
        </div>
        {!sub.pending_request ? (
          <Button asChild size="sm">
            <Link href="/billing">Choose Plan</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/billing">Change request</Link>
          </Button>
        )}
      </div>
    );
  }

  if (sub.status === "expired" || sub.status === "past_due" || sub.status === "cancelled") {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            {sub.pending_request
              ? `Waiting for activation — ${sub.pending_request.requested_plan_name}`
              : "Your demo has expired. Choose a plan to continue using LORESCALE."}
          </p>
          <p className="text-xs text-muted-foreground">
            Voice Talk and new workspaces are paused. Dashboard remains available.
          </p>
        </div>
        {!sub.pending_request ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/billing">Choose Plan</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (sub.status === "active") {
    return (
      <div
        className={cn(
          "mb-6 flex flex-col gap-1 rounded-lg border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <div>
          <p className="text-sm font-medium text-foreground">{sub.plan_name} Plan Active</p>
          <p className="text-xs text-muted-foreground">
            Expires: {formatDate(sub.ends_at)} · Workspaces: {usage}
          </p>
        </div>
        {sub.pending_request ? (
          <p className="text-xs text-muted-foreground">
            Upgrade request pending: {sub.pending_request.requested_plan_name}
          </p>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/billing">Change Plan</Link>
          </Button>
        )}
      </div>
    );
  }

  return null;
}
