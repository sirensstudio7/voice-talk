"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { PageHeader, StatCard } from "@/components/ui";
import { api, type KnowledgeEntry } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CATEGORY_OPTIONS = ["General", "Hours", "Menu", "Policies", "Payment"] as const;

const emptyForm = {
  category: "General",
  content: "",
};

const CATEGORY_STYLES: Record<string, string> = {
  General: "bg-orange-50 text-orange-700 ring-orange-600/20",
  Hours: "bg-sky-50 text-sky-700 ring-sky-600/20",
  Menu: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Policies: "bg-violet-50 text-violet-700 ring-violet-600/20",
  Payment: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const inputClassName =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500";

function categoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? "bg-slate-100 text-slate-600 ring-slate-500/10";
}

function groupByCategory(entries: KnowledgeEntry[]) {
  const groups = new Map<string, KnowledgeEntry[]>();
  for (const entry of entries) {
    const existing = groups.get(entry.category) ?? [];
    existing.push(entry);
    groups.set(entry.category, existing);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({
      category,
      items: [...items].sort((a, b) => a.sort_order - b.sort_order),
    }));
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${categoryStyle(category)}`}
    >
      {category}
    </span>
  );
}

function CategoryFilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-100"
      } ${!active && count === 0 ? "opacity-50" : ""}`}
    >
      {label}
      {count > 0 ? ` · ${count}` : ""}
    </button>
  );
}

function CategorySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    if (CATEGORY_OPTIONS.includes(value as (typeof CATEGORY_OPTIONS)[number])) {
      return [...CATEGORY_OPTIONS];
    }
    return [value, ...CATEGORY_OPTIONS];
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5 text-left text-sm shadow-sm transition-colors ${
          open
            ? "border-orange-300 ring-2 ring-orange-500/20"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <span className="font-medium text-slate-900">{value}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute z-20 mt-1.5 max-h-48 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/80"
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <li key={option} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2.5 text-sm transition-colors ${
                    selected
                      ? "bg-orange-50 font-medium text-orange-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: KnowledgeEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <CategoryBadge category={entry.category} />
          <p className="mt-2.5 text-sm leading-relaxed text-slate-700">{entry.content}</p>
        </div>

        <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit entry"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete entry"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function KnowledgeFormModal({
  open,
  editingId,
  form,
  saving,
  onClose,
  onSubmit,
  onChange,
}: {
  open: boolean;
  editingId: string | null;
  form: typeof emptyForm;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChange: (form: typeof emptyForm) => void;
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isValid = form.content.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-form-title"
        className="relative z-10 flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="knowledge-form-title" className="text-base font-semibold text-slate-900">
              {editingId ? "Edit entry" : "Add entry"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {editingId
                ? "Update what Eva knows about your business."
                : "A short fact Eva can reference in conversation."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label htmlFor="knowledge-category" className="mb-1.5 block text-sm font-medium text-slate-700">
                Category
              </label>
              <CategorySelect
                id="knowledge-category"
                value={form.category}
                onChange={(category) => onChange({ ...form, category })}
              />
            </div>

            <div>
              <label htmlFor="knowledge-content" className="mb-1.5 block text-sm font-medium text-slate-700">
                Content
              </label>
              <textarea
                id="knowledge-content"
                className={`${inputClassName} min-h-32 resize-y`}
                placeholder="We are open daily from 7:00 AM to 9:00 PM."
                value={form.content}
                onChange={(event) => onChange({ ...form, content: event.target.value })}
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Keep it concise — one clear fact per entry works best.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !isValid}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editingId ? (
                <>
                  <Pencil className="h-4 w-4" />
                  {saving ? "Saving…" : "Save changes"}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {saving ? "Adding…" : "Add entry"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function KnowledgePageClient() {
  const { token, business } = useAuth();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const load = async () => {
    if (!token || !business) return;
    setLoading(true);
    try {
      setEntries(await api.listKnowledge(token, business.id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token, business]);

  const categories = useMemo(
    () => [...new Set(entries.map((entry) => entry.category))].sort(),
    [entries],
  );

  const filterOptions = useMemo(() => {
    const options = new Set<string>(CATEGORY_OPTIONS);
    for (const entry of entries) {
      options.add(entry.category);
    }
    return [...options].sort((a, b) => {
      const aIndex = CATEGORY_OPTIONS.indexOf(a as (typeof CATEGORY_OPTIONS)[number]);
      const bIndex = CATEGORY_OPTIONS.indexOf(b as (typeof CATEGORY_OPTIONS)[number]);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [entries]);

  const searchMatchedEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(
      (entry) =>
        entry.content.toLowerCase().includes(query) ||
        entry.category.toLowerCase().includes(query),
    );
  }, [entries, search]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of searchMatchedEntries) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    return counts;
  }, [searchMatchedEntries]);

  const filteredEntries = useMemo(() => {
    return searchMatchedEntries.filter((entry) => {
      if (filterCategory && entry.category !== filterCategory) return false;
      return true;
    });
  }, [searchMatchedEntries, filterCategory]);

  const groups = useMemo(() => groupByCategory(filteredEntries), [filteredEntries]);

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
  };

  const openAddForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  };

  const handleEdit = (entry: KnowledgeEntry) => {
    setEditingId(entry.id);
    setForm({ category: entry.category, content: entry.content });
    setFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !business || !form.content.trim()) return;

    setSaving(true);
    try {
      const payload = {
        category: form.category.trim() || "General",
        content: form.content.trim(),
      };

      if (editingId) {
        await api.updateKnowledge(token, business.id, editingId, payload);
      } else {
        await api.createKnowledge(token, business.id, payload);
      }

      closeForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: KnowledgeEntry) => {
    if (!token || !business) return;
    if (!window.confirm("Delete this knowledge entry? Eva will no longer use it in conversation.")) {
      return;
    }
    await api.deleteKnowledge(token, business.id, entry.id);
    if (editingId === entry.id) closeForm();
    await load();
  };

  const subtitle = useMemo(() => {
    if (loading) return "Loading knowledge base…";
    if (entries.length === 0) return "Teach Eva facts about your business — hours, policies, and more.";
    const categoryLabel =
      categories.length === 1 ? "1 category" : `${categories.length} categories`;
    return `${entries.length} ${entries.length === 1 ? "entry" : "entries"} across ${categoryLabel}`;
  }, [loading, entries.length, categories.length]);

  return (
    <>
      <PageHeader
        title="AI Knowledge"
        subtitle={subtitle}
        action={
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Add entry
          </button>
        }
      />

      <KnowledgeFormModal
        open={formOpen}
        editingId={editingId}
        form={form}
        saving={saving}
        onClose={closeForm}
        onSubmit={handleSubmit}
        onChange={setForm}
      />

      {entries.length > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StatCard label="Total entries" value={String(entries.length)} />
          <StatCard label="Categories" value={String(categories.length)} />
        </div>
      ) : null}

      <section>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
              <BookOpen className="h-7 w-7" />
            </div>
            <p className="text-lg font-semibold text-slate-900">No knowledge entries yet</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Add facts about your hours, substitutions, payment methods, and policies. Eva will
              use these to answer customer questions accurately.
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              Add entry
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full shrink-0 lg:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search entries…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                />
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                <CategoryFilterPill
                  label="All"
                  count={searchMatchedEntries.length}
                  active={filterCategory === null}
                  onClick={() => setFilterCategory(null)}
                />
                {filterOptions.map((option) => (
                  <CategoryFilterPill
                    key={option}
                    label={option}
                    count={categoryCounts.get(option) ?? 0}
                    active={filterCategory === option}
                    onClick={() => setFilterCategory(option === filterCategory ? null : option)}
                  />
                ))}
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center">
                <p className="text-base font-semibold text-slate-900">No matching entries</p>
                <p className="mt-2 text-sm text-slate-500">
                  Try a different search term or clear your filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilterCategory(null);
                  }}
                  className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group) => (
                  <div key={group.category}>
                    <div className="mb-2 flex items-baseline justify-between px-1">
                      <h2 className="text-sm font-semibold text-slate-900">{group.category}</h2>
                      <p className="text-xs text-slate-500">
                        {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {group.items.map((entry) => (
                        <EntryCard
                          key={entry.id}
                          entry={entry}
                          onEdit={() => handleEdit(entry)}
                          onDelete={() => {
                            void handleDelete(entry);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
