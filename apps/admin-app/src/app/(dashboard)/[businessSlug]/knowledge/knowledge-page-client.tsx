"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BookOpenIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  InformationCircleIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api, type KnowledgeEntry } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

import {
  filterKnowledgeImportFiles,
  KNOWLEDGE_IMPORT_ACCEPT,
  parseKnowledgeImportFile,
} from "./knowledge-import";
import {
  CATEGORY_OPTIONS,
  CategoryBadge,
  CategoryFilterPill,
  getEntryLabel,
  groupByCategory,
} from "./knowledge-shared";

const KNOWLEDGE_EXAMPLE_HREF = "/examples/ai-knowledge-example.md";

function KnowledgeImportTip() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="How to import knowledge files"
          >
            <InformationCircleIcon className="h-5 w-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-[280px] bg-slate-900 px-3 py-2.5 text-left text-xs leading-relaxed text-white"
        >
          <p className="font-semibold text-white">How to add knowledge from a file</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-3.5 text-white/90">
            <li>
              Click the <span className="font-semibold text-white">▾</span> next to{" "}
              <span className="font-semibold text-white">Add entry</span>
            </li>
            <li>
              Choose <span className="font-semibold text-white">Import files</span>
            </li>
            <li>
              Pick a <span className="font-semibold text-white">.md</span>,{" "}
              <span className="font-semibold text-white">.txt</span>, or{" "}
              <span className="font-semibold text-white">.docx</span> file
            </li>
          </ol>
          <p className="mt-2 text-white/80">
            Tip: each file becomes <span className="font-semibold text-white">1 entry</span>. Upload
            files one by one so titles stay clear.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Primary Add entry + menu for Import / Example — one control in the header. */
function AddKnowledgeActions({
  importing,
  disabled,
  onImportClick,
  newHref,
}: {
  importing: boolean;
  disabled?: boolean;
  onImportClick: () => void;
  newHref: string;
}) {
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-md shadow-sm">
      {importing || disabled ? (
        <Button type="button" disabled className="rounded-none rounded-l-md">
          <PlusIcon />
          {importing ? "Importing…" : "Add entry"}
        </Button>
      ) : (
        <Button asChild className="rounded-none rounded-l-md">
          <Link href={newHref}>
            <PlusIcon />
            Add entry
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            disabled={importing || disabled}
            className="rounded-none rounded-r-md border-l border-primary-foreground/25 px-2"
            aria-label="More ways to add knowledge"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            disabled={importing || disabled}
            onSelect={() => onImportClick()}
          >
            <ArrowUpTrayIcon />
            Import files
            <span className="ml-auto text-[11px] text-muted-foreground">.md .txt .docx</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={KNOWLEDGE_EXAMPLE_HREF} download="ai-knowledge-example.md">
              <ArrowDownTrayIcon />
              Download example .md
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
  const { token, business, user } = useAuth();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importMessage, setImportMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const confirmEmailPhrase = (user?.email?.trim() || "DELETE ALL").toLowerCase();
  const emailMatches =
    confirmEmail.trim().toLowerCase() === confirmEmailPhrase;

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

  const onImportFiles = useCallback(
    async (rawFiles: FileList | File[] | null) => {
      if (!token || !business || !rawFiles || rawFiles.length === 0) return;

      const files = filterKnowledgeImportFiles(rawFiles);
      if (files.length === 0) {
        setImportMessage({
          tone: "error",
          text: "Unsupported file. Use .md, .txt, or .docx (up to 2 MB each).",
        });
        return;
      }

      setImporting(true);
      setImportMessage(null);
      let entryCount = 0;
      const failures: string[] = [];

      try {
        for (const file of files) {
          try {
            const drafts = await parseKnowledgeImportFile(file);
            for (const draft of drafts) {
              await api.createKnowledge(token, business.id, {
                category: "General",
                title: draft.title,
                content: draft.content,
              });
              entryCount += 1;
            }
          } catch (err) {
            failures.push(
              `${file.name}: ${err instanceof Error ? err.message : "Import failed"}`,
            );
          }
        }

        setEntries(await api.listKnowledge(token, business.id));

        if (entryCount > 0 && failures.length === 0) {
          const fileLabel =
            files.length === 1 ? "1 file" : `${files.length} files`;
          setImportMessage({
            tone: "ok",
            text:
              entryCount === 1
                ? `Imported 1 knowledge entry from ${fileLabel}.`
                : `Imported ${entryCount} knowledge entries from ${fileLabel}.`,
          });
        } else if (entryCount > 0) {
          setImportMessage({
            tone: "error",
            text: `Imported ${entryCount} entries, but some files failed: ${failures.join(" · ")}`,
          });
        } else {
          setImportMessage({
            tone: "error",
            text: failures[0] ?? "Import failed",
          });
        }
      } finally {
        setImporting(false);
        if (importInputRef.current) importInputRef.current.value = "";
      }
    },
    [token, business],
  );

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragOver(false);
    if (importing) return;
    void onImportFiles(e.dataTransfer.files);
  };

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

  const openDeleteAllModal = () => {
    setConfirmEmail("");
    setDeleteAllError("");
    setDeleteAllOpen(true);
  };

  const closeDeleteAllModal = () => {
    if (deletingAll) return;
    setDeleteAllOpen(false);
    setConfirmEmail("");
    setDeleteAllError("");
  };

  const confirmDeleteAll = async () => {
    if (!token || !business || !emailMatches) return;
    setDeletingAll(true);
    setDeleteAllError("");
    try {
      const result = await api.deleteAllKnowledge(token, business.id);
      setDeleteAllOpen(false);
      setConfirmEmail("");
      setEntries([]);
      setImportMessage({
        tone: "ok",
        text:
          result.deleted === 1
            ? "Deleted 1 knowledge entry."
            : `Deleted ${result.deleted} knowledge entries.`,
      });
    } catch (err) {
      setDeleteAllError(err instanceof Error ? err.message : "Could not delete knowledge");
    } finally {
      setDeletingAll(false);
    }
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
      <input
        ref={importInputRef}
        type="file"
        accept={KNOWLEDGE_IMPORT_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void onImportFiles(e.target.files)}
        disabled={importing}
      />

      <PageHeader
        title="AI Knowledge"
        subtitle={subtitle}
        titleAccessory={<KnowledgeImportTip />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {entries.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={loading || importing || deletingAll}
                className="border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                onClick={openDeleteAllModal}
              >
                <TrashIcon />
                Delete all
              </Button>
            ) : null}
            <AddKnowledgeActions
              importing={importing}
              disabled={loading || deletingAll}
              onImportClick={() => importInputRef.current?.click()}
              newHref={adminPath(business?.slug ?? "", "/knowledge/new")}
            />
          </div>
        }
      />

      {importMessage ? (
        <p
          className={
            importMessage.tone === "ok"
              ? "mb-4 text-sm text-emerald-700"
              : "mb-4 text-sm text-red-600"
          }
          role={importMessage.tone === "error" ? "alert" : "status"}
        >
          {importMessage.text}
        </p>
      ) : null}

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
          <div
            role="button"
            tabIndex={0}
            onClick={() => !importing && importInputRef.current?.click()}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!importing) importInputRef.current?.click();
              }
            }}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl border border-dashed bg-white px-8 py-16 text-center transition",
              dragOver
                ? "border-orange-400 bg-orange-50"
                : "border-slate-300 hover:border-slate-400",
              importing && "pointer-events-none opacity-70",
            )}
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
              <BookOpenIcon className="h-7 w-7" />
            </div>
            <p className="text-lg font-semibold text-slate-900">
              {dragOver ? "Drop files to import" : "No knowledge entries yet"}
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Drag and drop .md, .txt, or .docx files here (or click to browse). Each file becomes
              one knowledge entry. Download the example to see the format.
            </p>
            <div
              className="mt-6 flex flex-wrap items-center justify-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <AddKnowledgeActions
                importing={importing}
                onImportClick={() => importInputRef.current?.click()}
                newHref={adminPath(business?.slug ?? "", "/knowledge/new")}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition sm:flex-row sm:justify-between sm:text-left",
                dragOver
                  ? "border-orange-400 bg-orange-50"
                  : "border-slate-200 bg-white",
                importing && "opacity-70",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {dragOver ? "Drop to import" : "Import more knowledge"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Drag and drop one or more .md, .txt, or .docx files — or browse.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 shrink-0 sm:mt-0"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                <ArrowUpTrayIcon />
                {importing ? "Importing…" : "Browse files"}
              </Button>
            </div>

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
                            onEdit={() =>
                              router.push(
                                adminPath(business?.slug ?? "", `/knowledge/${entry.id}/edit`),
                              )
                            }
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
          </div>
        )}
      </section>

      {deleteAllOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-all-knowledge-title"
          onClick={closeDeleteAllModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-all-knowledge-title" className="text-lg font-semibold text-foreground">
              Delete all knowledge?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This permanently removes all{" "}
              <span className="font-medium text-foreground">{entries.length}</span> knowledge{" "}
              {entries.length === 1 ? "entry" : "entries"} for this workspace. Lorescale will no
              longer use them in conversation. This cannot be undone.
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              <label
                htmlFor="confirm-knowledge-email"
                className="text-sm leading-snug text-muted-foreground"
              >
                Type your email{" "}
                <span className="font-medium text-foreground">
                  {user?.email?.trim() || "DELETE ALL"}
                </span>{" "}
                to confirm
              </label>
              <input
                id="confirm-knowledge-email"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeDeleteAllModal();
                  if (e.key === "Enter" && emailMatches) void confirmDeleteAll();
                }}
                disabled={deletingAll}
                autoFocus
                autoComplete="off"
                placeholder={user?.email?.trim() || "DELETE ALL"}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {deleteAllError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {deleteAllError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={deletingAll}
                onClick={closeDeleteAllModal}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={deletingAll || !emailMatches}
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => void confirmDeleteAll()}
              >
                <TrashIcon />
                {deletingAll ? "Deleting…" : "Delete all knowledge"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
