"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type KnowledgeEntry } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import {
  CATEGORY_OPTIONS,
  CategoryBadge,
  CategoryFilterPill,
  getEntryLabel,
  groupByCategory,
} from "./knowledge-shared";

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: KnowledgeEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const title = entry.title?.trim();
  const label = getEntryLabel(entry);

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="items-start px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1 pr-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <CategoryBadge category={entry.category} />
          </div>
          {title ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{entry.content}</p>
          ) : null}
        </div>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                <EllipsisHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">Open entry menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <TrashIcon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
    </Card>
  );
}

export function KnowledgePageClient() {
  const router = useRouter();
  const { token, business } = useAuth();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
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
        entry.title.toLowerCase().includes(query) ||
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

  const handleDelete = async (entry: KnowledgeEntry) => {
    if (!token || !business) return;
    if (!window.confirm("Delete this knowledge entry? Lorescale will no longer use it in conversation.")) {
      return;
    }
    await api.deleteKnowledge(token, business.id, entry.id);
    await load();
  };

  const subtitle = useMemo(() => {
    if (loading) return "Loading knowledge base…";
    if (entries.length === 0) return "Teach Lorescale facts about your business — hours, policies, and more.";
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
          <Button asChild>
            <Link href="/knowledge/new">
              <PlusIcon />
              Add entry
            </Link>
          </Button>
        }
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
              <BookOpenIcon className="h-7 w-7" />
            </div>
            <p className="text-lg font-semibold text-slate-900">No knowledge entries yet</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Add facts about your hours, substitutions, payment methods, and policies. Lorescale will
              use these to answer customer questions accurately.
            </p>
            <Button className="mt-6" asChild>
              <Link href="/knowledge/new">
                <PlusIcon />
                Add entry
              </Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full shrink-0 lg:w-64">
                <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search entries…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
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
                    <div className="mb-2 flex items-center justify-between px-1">
                      <CategoryBadge category={group.category} />
                      <p className="text-xs text-muted-foreground">
                        {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {group.items.map((entry) => (
                        <EntryCard
                          key={entry.id}
                          entry={entry}
                          onEdit={() => router.push(`/knowledge/${entry.id}/edit`)}
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
