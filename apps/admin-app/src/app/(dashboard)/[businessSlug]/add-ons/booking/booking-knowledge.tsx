"use client";

import {
  BookOpenIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, type KnowledgeEntry } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CategoryBadge } from "../../knowledge/knowledge-shared";

const BOOKING_CATEGORIES = ["General", "Hours", "Policies", "Payment", "Prep"] as const;

const CATEGORY_HINTS: Record<
  (typeof BOOKING_CATEGORIES)[number],
  { description: string; title: string; example: string }
> = {
  General: {
    description: "Location, parking, how to find the clinic.",
    title: "Parking",
    example: "Motor parking is in the basement. The clinic is on the 2nd floor.",
  },
  Hours: {
    description: "Holidays and extra schedule notes. Per-doctor hours stay in Setup.",
    title: "National holidays",
    example: "Closed on national holidays. Walk-ins are not available.",
  },
  Policies: {
    description: "Cancellation, late arrival, and no-show rules.",
    title: "Cancellation",
    example: "Please cancel at least 2 hours before the appointment.",
  },
  Payment: {
    description: "BPJS, insurance, cash, cards, QRIS.",
    title: "BPJS",
    example: "We accept BPJS, cash, cards, and QRIS.",
  },
  Prep: {
    description: "What to bring and how early to arrive.",
    title: "What to bring",
    example: "Bring KTP and your BPJS card. Arrive 15 minutes early.",
  },
};

type FormState = {
  category: string;
  title: string;
  content: string;
};

const emptyForm = (): FormState => ({
  category: "General",
  title: "",
  content: "",
});

function KnowledgeFormModal({
  open,
  editing,
  form,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  form: FormState;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChange: (next: FormState) => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  const categories = BOOKING_CATEGORIES.includes(form.category as (typeof BOOKING_CATEGORIES)[number])
    ? [...BOOKING_CATEGORIES]
    : [form.category, ...BOOKING_CATEGORIES];
  const hint =
    CATEGORY_HINTS[form.category as (typeof BOOKING_CATEGORIES)[number]] ?? CATEGORY_HINTS.General;
  const canSave = form.category.trim().length > 0 && form.content.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => {
          if (!saving) onClose();
        }}
        aria-label="Close dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-knowledge-title"
        className="relative z-10 flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="booking-knowledge-title" className="text-base font-semibold text-slate-900">
              {editing ? "Edit knowledge" : "Add knowledge"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              One fact the voice receptionist can say out loud.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave && !saving) onSubmit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">Category</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
                {categories.map((option) => {
                  const selected = option === form.category;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onChange({ ...form, category: option })}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">{hint.description}</p>
            </div>

            <div>
              <label htmlFor="booking-knowledge-entry-title" className="mb-1.5 block text-xs font-medium text-slate-600">
                Title
              </label>
              <input
                id="booking-knowledge-entry-title"
                type="text"
                maxLength={200}
                value={form.title}
                onChange={(event) => onChange({ ...form, title: event.target.value })}
                placeholder={hint.title}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-500/20"
              />
            </div>

            <div>
              <label htmlFor="booking-knowledge-content" className="mb-1.5 block text-xs font-medium text-slate-600">
                What the assistant should know
              </label>
              <textarea
                id="booking-knowledge-content"
                required
                value={form.content}
                onChange={(event) => onChange({ ...form, content: event.target.value })}
                placeholder={hint.example}
                className="min-h-32 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-500/20"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || saving}>
              {saving ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function BookingKnowledge({
  token,
  businessId,
}: {
  token: string;
  businessId: string;
}) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await api.listKnowledge(token, businessId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load knowledge.");
    } finally {
      setLoading(false);
    }
  }, [token, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...entries]
      .filter((entry) => {
        if (!needle) return true;
        return [entry.title, entry.content, entry.category].join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
  }, [entries, query]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (entry: KnowledgeEntry) => {
    setEditing(entry);
    setForm({
      category: entry.category || "General",
      title: entry.title ?? "",
      content: entry.content,
    });
    setModalError(null);
    setModalOpen(true);
  };

  const save = async () => {
    const category = form.category.trim();
    const title = form.title.trim();
    const content = form.content.trim();
    if (!category || !content) return;
    setSaving(true);
    setModalError(null);
    try {
      if (editing) {
        await api.updateKnowledge(token, businessId, editing.id, { category, title, content });
      } else {
        await api.createKnowledge(token, businessId, { category, title, content });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not save knowledge.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: KnowledgeEntry) => {
    const label = entry.title.trim() || entry.content.slice(0, 40);
    if (!window.confirm(`Delete “${label}”? The receptionist will no longer use this fact.`)) {
      return;
    }
    try {
      await api.deleteKnowledge(token, businessId, entry.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete knowledge.");
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Receptionist knowledge</h2>
          <p className="text-sm text-slate-500">
            Facts the voice assistant can answer while booking — parking, insurance, what to bring,
            cancellation rules.
          </p>
        </div>
        <Button type="button" className="shrink-0" onClick={openAdd}>
          <PlusIcon className="size-4" />
          Add
        </Button>
      </div>

      <label className="relative block max-w-xs">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          placeholder="Search knowledge…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center">
          <BookOpenIcon className="mx-auto size-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-800">
            {entries.length === 0 ? "No knowledge yet" : "No entries match this search"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {entries.length === 0
              ? "Add short facts the receptionist should know, for example parking, BPJS, or arrive 15 minutes early."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => openEdit(entry)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {entry.title.trim() || entry.content.slice(0, 48)}
                  </p>
                  <CategoryBadge category={entry.category} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{entry.content}</p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(entry)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  aria-label={`Edit ${entry.title || "entry"}`}
                >
                  <PencilIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(entry)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${entry.title || "entry"}`}
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <KnowledgeFormModal
        open={modalOpen}
        editing={Boolean(editing)}
        form={form}
        saving={saving}
        error={modalError}
        onClose={() => setModalOpen(false)}
        onChange={setForm}
        onSubmit={() => void save()}
      />
    </div>
  );
}
