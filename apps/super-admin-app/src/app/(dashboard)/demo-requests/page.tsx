"use client";

import { useCallback, useEffect, useState } from "react";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";

import { SlideOver } from "@/components/slide-over";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type DemoRequestItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
] as const;

function statusDotClass(status: string) {
  if (status === "new") return "bg-sky-500";
  if (status === "contacted") return "bg-emerald-500";
  if (status === "closed") return "bg-red-500";
  return "bg-muted-foreground";
}

function StatusFilterSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const filterValue = value || "all";
  const selected =
    filterValue === "all"
      ? { value: "all", label: "All statuses" }
      : STATUS_OPTIONS.find((option) => option.value === filterValue);

  return (
    <Select value={filterValue} onValueChange={(next) => onChange(next === "all" ? "" : next)}>
      <SelectTrigger className="w-[132px]">
        <SelectValue placeholder="All statuses">
          {selected?.value === "all" ? (
            selected.label
          ) : selected ? (
            <span className="inline-flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(selected.value))} />
              <span>{selected.label}</span>
            </span>
          ) : (
            "All statuses"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="all" textValue="All statuses">
          All statuses
        </SelectItem>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            <span className="inline-flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(option.value))} />
              <span>{option.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function DemoRequestsPage() {
  const { token, admin } = useAuth();
  const canWrite =
    admin?.role === "super" || admin?.role === "ops" || admin?.role === "support";
  const [items, setItems] = useState<DemoRequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("new");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<DemoRequestItem | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const limit = 25;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.listDemoRequests(token, { page, limit, search, status });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo requests");
    }
  }, [token, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(id: string, nextStatus: string) {
    if (!token) return;
    try {
      await api.updateDemoRequest(token, id, { status: nextStatus });
      setMessage(`Marked as ${nextStatus}.`);
      window.dispatchEvent(new Event("platform-demo-requests-changed"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function saveNotes() {
    if (!token || !editing) return;
    setSaving(true);
    try {
      await api.updateDemoRequest(token, editing.id, { notes: notesDraft });
      setMessage("Notes saved.");
      setEditing(null);
      window.dispatchEvent(new Event("platform-demo-requests-changed"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Demo requests"
        subtitle="Leads submitted from the marketing landing page."
        titleAction={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:max-w-sm"
          placeholder="Search company, email, city, country"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <StatusFilterSelect
          value={status}
          onChange={(next) => {
            setPage(1);
            setStatus(next);
          }}
        />
      </div>

      {message ? <p className="rounded-lg bg-muted px-3 py-2 text-sm">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          No demo requests found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Branches</th>
                <th className="px-4 py-3 font-medium">Preferred</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                {canWrite ? <th className="px-4 py-3 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{item.company_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.phone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.city}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.country || "—"}</td>
                  <td className="px-4 py-3">{item.business_industry}</td>
                  <td className="px-4 py-3 tabular-nums">{item.branch_total}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.preferred_date
                      ? `${item.preferred_date}${item.preferred_time ? ` · ${item.preferred_time}` : ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            aria-label="Demo request actions"
                          >
                            <EllipsisVerticalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {item.status !== "contacted" ? (
                            <DropdownMenuItem onSelect={() => void updateStatus(item.id, "contacted")}>
                              Mark contacted
                            </DropdownMenuItem>
                          ) : null}
                          {item.status !== "closed" ? (
                            <DropdownMenuItem onSelect={() => void updateStatus(item.id, "closed")}>
                              Mark closed
                            </DropdownMenuItem>
                          ) : null}
                          {item.status !== "new" ? (
                            <DropdownMenuItem onSelect={() => void updateStatus(item.id, "new")}>
                              Mark new
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(item);
                              setNotesDraft(item.notes);
                              setMessage(null);
                            }}
                          >
                            Edit notes
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      <SlideOver
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit notes"
        description={editing?.company_name}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveNotes()} disabled={saving || !editing}>
              {saving ? "Saving…" : "Save notes"}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
              <p className="font-medium">{editing.company_name}</p>
              <p className="mt-1 text-muted-foreground">
                {editing.email} · {editing.phone}
              </p>
              <p className="mt-1 text-muted-foreground">
                {[editing.city, editing.country].filter(Boolean).join(", ")} ·{" "}
                {editing.business_industry} · {editing.branch_total} branches
              </p>
              {editing.preferred_date ? (
                <p className="mt-1 text-muted-foreground">
                  Preferred: {editing.preferred_date}
                  {editing.preferred_time ? ` at ${editing.preferred_time}` : ""}
                </p>
              ) : null}
            </div>
            <label className="block text-sm">
              <span className="font-medium">Internal notes</span>
              <textarea
                className="mt-1.5 min-h-36 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Call notes, follow-up date…"
              />
            </label>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
