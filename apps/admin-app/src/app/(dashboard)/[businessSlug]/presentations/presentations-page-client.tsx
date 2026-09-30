"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  ClockIcon,
  DocumentTextIcon,
  PlayIcon,
  PlusIcon,
  PresentationChartBarIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { PageHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { api, ApiRequestError, type AiLanguage, type Presentation } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { deferEffectRun } from "@/lib/defer-effect-run";
import { useAddonStatus } from "@/lib/use-addon-status";
import { cn } from "@/lib/cn";
import { availableLanguageOptions } from "@voicetalk/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return `${API_URL}/${path}`;
}

function statusMeta(status: string): {
  label: string;
  dotClassName: string;
} {
  switch (status) {
    case "ready":
    case "completed":
      return { label: "Ready", dotClassName: "bg-emerald-500" };
    case "live":
      return { label: "Live", dotClassName: "bg-orange-500" };
    case "processing":
      return { label: "Preparing", dotClassName: "bg-amber-500" };
    case "failed":
      return { label: "Failed", dotClassName: "bg-red-500" };
    default:
      return {
        label: status.replace(/_/g, " ") || "Draft",
        dotClassName: "bg-slate-400",
      };
  }
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function durationLabel(seconds: number) {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return `~${mins} min`;
}

export function PresentationsPageClient() {
  const router = useRouter();
  const { token, business } = useAuth();
  const { isActive: hasLanguagePack } = useAddonStatus("language_pack");
  const languageOptions = availableLanguageOptions(hasLanguagePack);
  const [items, setItems] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<AiLanguage>("id");
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const thumbRefreshScheduled = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const openCreateModal = () => {
    setCreateError("");
    setTitle("");
    setLanguage("id");
    setCreateOpen(true);
  };

  const closeCreateModal = () => {
    if (creating) return;
    setCreateOpen(false);
    setCreateError("");
    setTitle("");
    setLanguage("id");
  };

  const load = useCallback(async () => {
    if (!token || !business) return;
    setLoading(true);
    try {
      setItems(await api.listPresentations(token, business.id));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        router.replace(adminPath(business.slug, "/add-ons/ai-presenter"));
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, business, router]);

  useEffect(() => {
    thumbRefreshScheduled.current = false;
    deferEffectRun(load);
  }, [load]);

  // Backfill renders thumbnails async on the server; refresh once so cards update.
  useEffect(() => {
    if (loading || !token || !business) return;
    if (thumbRefreshScheduled.current) return;
    if (!items.some((item) => !item.thumbnail_url)) return;
    thumbRefreshScheduled.current = true;
    const timer = window.setTimeout(() => {
      void api
        .listPresentations(token, business.id)
        .then(setItems)
        .catch(() => undefined);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [loading, items, token, business]);

  useEffect(() => {
    if (!createOpen) return;
    const timer = window.setTimeout(() => titleInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [createOpen]);

  const create = async () => {
    if (!token || !business || !title.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const created = await api.createPresentation(token, business.id, {
        title: title.trim(),
        language,
      });
      setTitle("");
      setLanguage("id");
      setCreateOpen(false);
      router.push(adminPath(business.slug, `/presentations/${created.id}`));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!token || !business) return;
    if (!window.confirm("Archive this presentation?")) return;
    await api.deletePresentation(token, business.id, id);
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Presenter"
        subtitle="Upload decks, generate narration, and run live AI presentation sessions."
        action={
          <Button onClick={openCreateModal}>
            <PlusIcon className="h-4 w-4" />
            New presentation
          </Button>
        }
      />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <PresentationChartBarIcon className="h-7 w-7" />
          </div>
          <p className="text-lg font-semibold text-slate-900">No presentations yet</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            Create a presentation, upload a PPTX, and prepare it with AI to start presenting.
          </p>
          <Button className="mt-6 rounded-xl" onClick={openCreateModal}>
            <PlusIcon className="h-4 w-4" />
            New presentation
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Your decks
            </p>
            <p className="text-xs text-slate-400">
              {items.length} {items.length === 1 ? "presentation" : "presentations"}
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => {
              const status = statusMeta(item.status);
              const duration = durationLabel(item.estimated_duration);
              const canPresent = item.status === "ready" || item.status === "completed";
              const slideLabel =
                item.total_slides > 0 ? `${item.total_slides} slides` : "Draft";

              return (
                <li key={item.id} className="min-w-0">
                  <article className="group flex h-full flex-col rounded-[1.25rem] border border-slate-200 bg-white p-1.5 transition duration-200 hover:border-slate-300 hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]">
                    <div className="relative overflow-hidden rounded-[0.95rem] bg-slate-100">
                      <Link
                        href={adminPath(business?.slug ?? "", `/presentations/${item.id}`)}
                        className="relative block aspect-[16/10] outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-inset"
                      >
                        {item.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- thumbnail can be any API/storage host
                          <img
                            src={resolveMediaUrl(item.thumbnail_url)}
                            alt=""
                            className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#fff7ed,transparent_55%),linear-gradient(160deg,#f8fafc,#f1f5f9)] text-slate-300 transition group-hover:text-orange-400">
                            <PresentationChartBarIcon className="h-10 w-10" />
                          </div>
                        )}

                        <div className="absolute inset-0 bg-slate-950/0 transition duration-200 group-hover:bg-slate-950/35" />

                        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-200 group-hover:opacity-100">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-900 shadow-lg">
                            {canPresent ? (
                              <>
                                <PlayIcon className="h-3.5 w-3.5" />
                                Present
                              </>
                            ) : (
                              <>
                                Open
                                <ArrowRightIcon className="h-3.5 w-3.5" />
                              </>
                            )}
                          </span>
                        </div>
                      </Link>

                      <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold tracking-wide text-slate-700 uppercase shadow-sm ring-1 ring-black/5 backdrop-blur">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${status.dotClassName} ${
                              item.status === "live" || item.status === "processing"
                                ? "animate-pulse"
                                : ""
                            }`}
                          />
                          {status.label}
                        </span>
                        <button
                          type="button"
                          aria-label={`Archive ${item.title}`}
                          onClick={() => void remove(item.id)}
                          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-500 opacity-0 shadow-sm ring-1 ring-black/5 backdrop-blur transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <Link
                      href={adminPath(business?.slug ?? "", `/presentations/${item.id}`)}
                      className="flex min-w-0 flex-1 flex-col px-2.5 pt-3 pb-2.5 outline-none"
                    >
                      <h2 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                        {item.title}
                      </h2>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <p className="flex min-w-0 items-center gap-2 truncate">
                          <span className="inline-flex items-center gap-1 truncate">
                            <DocumentTextIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            {slideLabel}
                          </span>
                          {duration ? (
                            <span className="inline-flex items-center gap-1 truncate">
                              <ClockIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              {duration}
                            </span>
                          ) : null}
                        </p>
                        <time
                          dateTime={item.updated_at}
                          className="shrink-0 tabular-nums text-slate-400"
                        >
                          {formatUpdatedAt(item.updated_at)}
                        </time>
                      </div>
                    </Link>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-presentation-title"
          onClick={closeCreateModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="create-presentation-title"
              className="text-lg font-semibold text-slate-900"
            >
              New presentation
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Give it a title, then upload your PowerPoint on the next screen.
            </p>
            <label
              htmlFor="presentation-title"
              className="mt-5 block text-sm font-medium text-slate-700"
            >
              Title
            </label>
            <input
              ref={titleInputRef}
              id="presentation-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
                if (e.key === "Escape") closeCreateModal();
              }}
              disabled={creating}
              placeholder="e.g. Q3 product overview"
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60"
            />
            <p className="mt-4 block text-sm font-medium text-slate-700">
              AI Present language
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Language the presenter speaks during AI Present.
            </p>
            <div
              className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-3"
              role="group"
              aria-label="AI Present language"
            >
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={creating}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60",
                    language === option.value
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                  onClick={() => setLanguage(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {createError ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={creating}
                onClick={closeCreateModal}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={creating || !title.trim()}
                onClick={() => void create()}
              >
                <PlusIcon className="h-4 w-4" />
                {creating ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
