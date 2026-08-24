"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, type VoiceMinuteWallet } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function formatMinutes(seconds: number): string {
  const mins = seconds / 60;
  if (mins >= 10) return `${Math.round(mins)}`;
  return mins.toFixed(1).replace(/\.0$/, "");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function VoiceMinutesCard() {
  const { token } = useAuth();
  const [wallet, setWallet] = useState<VoiceMinuteWallet | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void api
      .getVoiceMinuteWallet(token)
      .then((data) => {
        if (!cancelled) setWallet(data);
      })
      .catch(() => {
        if (!cancelled) setWallet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!wallet) return null;

  const used = wallet.included_used_seconds;
  const included = wallet.included_seconds;
  const available = wallet.available_seconds;
  const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const warningCopy =
    wallet.warning === "empty"
      ? "You're out of Lore Voice Minutes."
      : wallet.warning === "critical"
        ? "You have less than 10% of your Lore Voice Minutes remaining."
        : wallet.warning === "low"
          ? "You're running low on Lore Voice Minutes."
          : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Lore Voice Usage</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDate(wallet.period_start)} – {formatDate(wallet.period_end)}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/billing/top-up">+ Add Minutes</Link>
        </Button>
      </div>

      <p className="mt-4 text-2xl font-semibold tabular-nums text-slate-900">
        {formatMinutes(used)} / {formatMinutes(included)} min
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            wallet.warning === "empty" || wallet.warning === "critical"
              ? "bg-red-500"
              : wallet.warning === "low"
                ? "bg-amber-500"
                : "bg-orange-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {formatMinutes(available)} minutes remaining
        {wallet.purchased_remaining_seconds > 0
          ? ` · ${formatMinutes(wallet.purchased_remaining_seconds)} purchased`
          : ""}
      </p>
      {wallet.next_expiry ? (
        <p className="mt-1 text-xs text-slate-500">
          {formatMinutes(wallet.next_expiry.seconds)} purchased min expire{" "}
          {formatDate(wallet.next_expiry.expires_at)}
        </p>
      ) : null}
      {warningCopy ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{warningCopy}</p>
      ) : null}
    </section>
  );
}
