"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api, type AddonRequestItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { deferEffectRun } from "@/lib/defer-effect-run";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatDateParts(iso: string) {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

function DateTimeCell({ iso }: { iso: string }) {
  const { day, time } = formatDateParts(iso);
  return (
    <div className="leading-tight">
      <p className="text-sm font-medium text-slate-800">{day}</p>
      <p className="mt-0.5 font-mono text-[11px] tracking-wide text-slate-400">{time}</p>
    </div>
  );
}

function parseNotes(notes: string) {
  return notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { label: "Note", value: line };
      return {
        label: line.slice(0, idx).trim(),
        value: line.slice(idx + 1).trim(),
      };
    })
    .filter((row) => {
      const label = row.label.toLowerCase();
      return label !== "payment proof" && label !== "amount";
    });
}

function formatFieldLabel(label: string) {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldValue(label: string, value: string) {
  if (label.toLowerCase() === "payment method") {
    return value
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return value;
}

function durationFromNotes(notes: string) {
  const match = notes.match(/Duration:\s*(\d+)\s*month/i);
  return match ? Number(match[1]) : 12;
}

const ADDON_MONTHLY_IDR = 199_000;
const ADDON_DURATION_DISCOUNTS: Record<number, number> = {
  1: 0,
  3: 0.05,
  6: 0.1,
  12: 0.15,
};

function formatIdr(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function amountFromNotes(notes: string) {
  const explicit = notes.match(/Amount:\s*(.+)/i);
  if (explicit?.[1]) return explicit[1].trim();

  const months = durationFromNotes(notes);
  const discount = ADDON_DURATION_DISCOUNTS[months] ?? 0;
  const total = Math.round(ADDON_MONTHLY_IDR * months * (1 - discount));
  return formatIdr(total);
}

function userInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function AddonRequestsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<AddonRequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<AddonRequestItem | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listAddonRequests(token, {
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
    deferEffectRun(load);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!detailItem) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailItem(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailItem]);

  async function act(
    id: string,
    action: "approve" | "reject" | "suspend",
    durationMonths = 12,
  ) {
    if (!token) return;
    setActingId(id);
    setError(null);
    try {
      if (action === "approve") {
        await api.approveAddonRequest(token, id, { duration_months: durationMonths });
      } else if (action === "reject") {
        await api.rejectAddonRequest(token, id);
      } else {
        await api.suspendAddonRequest(token, id);
      }
      window.dispatchEvent(new Event("platform-addon-requests-changed"));
      setDetailItem(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActingId(null);
    }
  }

  const detailRows = useMemo(
    () => (detailItem?.notes ? parseNotes(detailItem.notes) : []),
    [detailItem],
  );
  const detailAmount = useMemo(
    () => (detailItem ? amountFromNotes(detailItem.notes) : null),
    [detailItem],
  );

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Add-on requests
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review payment requests and activate workspace add-ons.
          </p>
        </div>
        <p className="text-sm text-slate-400">
          <span className="font-medium text-slate-700">{total}</span>{" "}
          {total === 1 ? "request" : "requests"}
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
            placeholder="Search workspace, owner, or code"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="inline-flex w-fit rounded-full bg-slate-100 p-1">
          {STATUS_OPTIONS.map((opt) => {
            const active = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setStatus(opt.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-xs text-slate-400">
            <tr>
              <th className="px-5 py-3.5 font-medium">Code</th>
              <th className="px-5 py-3.5 font-medium">Workspace</th>
              <th className="px-5 py-3.5 font-medium">Owner</th>
              <th className="px-5 py-3.5 font-medium">Add-on</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
              <th className="px-5 py-3.5 font-medium">Requested</th>
              <th className="px-5 py-3.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                  No requests in this filter.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/70"
                >
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-800">
                    {item.transaction_code}
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {item.workspace.name}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-800">{item.owner.name || "—"}</div>
                    <div className="text-xs text-slate-400">{item.owner.email}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{item.addon.name}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-4">
                    <DateTimeCell iso={item.created_at} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDetailItem(item)}>
                        Details
                      </Button>
                      {item.status === "approved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actingId === item.id}
                          onClick={() => void act(item.id, "suspend")}
                        >
                          Suspend
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          Page {page} of {totalPages}
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

      {detailItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={() => setDetailItem(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="addon-request-details-title"
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                  Add-on request
                </p>
                <h2
                  id="addon-request-details-title"
                  className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-900"
                >
                  {detailItem.addon.name}
                </h2>
                <p className="mt-1 font-mono text-xs font-semibold text-slate-500">
                  {detailItem.transaction_code}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDetailItem(null)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={detailItem.status} />
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {detailItem.workspace.name}
                </span>
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {userInitials(detailItem.owner.name, detailItem.owner.email)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {detailItem.owner.name || "—"}
                  </p>
                  <p className="truncate text-xs text-slate-500">{detailItem.owner.email}</p>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                  Payment
                </p>
                {detailAmount ? (
                  <div className="mt-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-white">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                      Total due
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{detailAmount}</p>
                  </div>
                ) : null}
                {detailRows.length > 0 ? (
                  <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
                    {detailRows.map((row) => (
                      <div
                        key={`${row.label}-${row.value}`}
                        className="flex items-start justify-between gap-4 px-3.5 py-3"
                      >
                        <span className="text-xs text-slate-500">
                          {formatFieldLabel(row.label)}
                        </span>
                        <span className="max-w-[58%] text-right text-sm font-medium text-slate-900 break-words">
                          {formatFieldValue(row.label, row.value)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-start justify-between gap-4 px-3.5 py-3">
                      <span className="text-xs text-slate-500">Requested</span>
                      <span className="max-w-[58%] text-right text-sm font-medium text-slate-900">
                        {formatDate(detailItem.created_at)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No payment details provided.</p>
                )}
              </div>

              {detailItem.payment_proof_url ? (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                      Proof
                    </p>
                    <a
                      href={detailItem.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-slate-600 underline-offset-2 hover:underline"
                    >
                      Open
                    </a>
                  </div>
                  <a
                    href={detailItem.payment_proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={detailItem.payment_proof_url}
                      alt="Payment proof"
                      className="max-h-56 w-full object-contain"
                    />
                  </a>
                </div>
              ) : null}
            </div>

            {detailItem.status === "pending" ? (
              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-5 py-4">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={actingId === detailItem.id}
                  onClick={() => void act(detailItem.id, "reject")}
                >
                  Reject
                </Button>
                <Button
                  className="w-full"
                  disabled={actingId === detailItem.id}
                  onClick={() =>
                    void act(
                      detailItem.id,
                      "approve",
                      durationFromNotes(detailItem.notes),
                    )
                  }
                >
                  Approve
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
