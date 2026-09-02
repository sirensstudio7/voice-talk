"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  EyeIcon,
  GlobeAltIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@voicetalk/ui";
import {
  api,
  type AiLanguage,
  type PresentationDetail,
  type PresentationKnowledgeEntry,
} from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const PRESENTATION_LANGUAGES: { value: AiLanguage; label: string; short: string }[] = [
  { value: "id", label: "Bahasa Indonesia", short: "ID" },
  { value: "en", label: "English", short: "EN" },
];

function normalizePresentationLanguage(value: string | null | undefined): AiLanguage {
  return value === "id" ? "id" : "en";
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return `${API_URL}/${path}`;
}

const STEPS = ["parsing", "scripting", "completed"] as const;

const STEP_LABELS: Record<string, string> = {
  queued: "Starting…",
  parsing: "Reading slides",
  scripting: "Building talking points",
  completed: "Finished",
};

function stepIndex(step: string): number {
  if (step === "queued") return 0;
  const idx = STEPS.indexOf(step as (typeof STEPS)[number]);
  return idx >= 0 ? idx : 0;
}

function processingProgress(detail: PresentationDetail): {
  percent: number;
  label: string;
  tone: "idle" | "active" | "done" | "error";
} {
  if (detail.status === "ready" || detail.status === "completed") {
    return { percent: 100, label: "Ready to present", tone: "done" };
  }
  if (detail.status === "failed") {
    const pct = Math.round((stepIndex(detail.processing_step) / (STEPS.length - 1)) * 100);
    return {
      percent: Math.max(8, pct),
      label: detail.processing_error || "Processing failed",
      tone: "error",
    };
  }
  if (detail.status === "processing") {
    const step = detail.processing_step || "parsing";
    const idx = stepIndex(step);
    const percent = Math.min(96, Math.round(((idx + 0.45) / (STEPS.length - 1)) * 100));
    return {
      percent,
      label: STEP_LABELS[step] ?? STEP_LABELS[STEPS[idx]!] ?? "Preparing…",
      tone: "active",
    };
  }
  if (detail.files.length === 0) {
    return { percent: 0, label: "Upload a PowerPoint to continue", tone: "idle" };
  }
  return { percent: 0, label: "Prepare narration with AI", tone: "idle" };
}

function statusLabel(tone: "idle" | "active" | "done" | "error", hasFile: boolean) {
  if (tone === "done") return "Ready";
  if (tone === "active") return "Preparing";
  if (tone === "error") return "Failed";
  return hasFile ? "Draft" : "No file";
}

/** Matches server split for delivery-style vs factual presentation knowledge. */
const STYLE_NOTE_RE =
  /\b(style|tone|delivery|presenting|presenter|speaking|cara\s*present|gaya|nada|penyampaian)\b/i;

function isDeliveryStyleNote(entry: Pick<PresentationKnowledgeEntry, "title" | "content">) {
  return (
    STYLE_NOTE_RE.test(entry.title.trim()) || STYLE_NOTE_RE.test(entry.content.trim().slice(0, 120))
  );
}

function KnowledgeFormModal({
  open,
  editing,
  kind,
  title,
  content,
  busy,
  onClose,
  onKindChange,
  onTitleChange,
  onContentChange,
  onSave,
}: {
  open: boolean;
  editing: boolean;
  kind: "fact" | "style";
  title: string;
  content: string;
  busy: boolean;
  onClose: () => void;
  onKindChange: (kind: "fact" | "style") => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSave: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

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
        className="relative z-10 flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="knowledge-form-title" className="text-base font-semibold text-slate-900">
              {editing ? "Edit note" : "Add knowledge note"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {kind === "style"
                ? "Guides how AI Present sounds on stage."
                : "Facts and FAQs the presenter can use in live Q&A."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div
            className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5"
            role="group"
            aria-label="Note type"
          >
            {(
              [
                { id: "fact", label: "Fact / FAQ" },
                { id: "style", label: "Delivery style" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-2 text-xs font-medium transition",
                  kind === option.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900",
                )}
                onClick={() => onKindChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="presentation-knowledge-title"
              className="mb-1.5 block text-xs font-medium text-slate-600"
            >
              Title {kind === "fact" ? <span className="font-normal text-slate-400">(optional)</span> : null}
            </label>
            <input
              id="presentation-knowledge-title"
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={kind === "style" ? "Delivery style" : "e.g. Pricing"}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="presentation-knowledge-content"
              className="mb-1.5 block text-xs font-medium text-slate-600"
            >
              Content
            </label>
            <textarea
              id="presentation-knowledge-content"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              placeholder={
                kind === "style"
                  ? "How should the AI speak? Pace, warmth, language mix, stage presence…"
                  : "Answer, pricing, FAQ, or talking point the presenter can use…"
              }
              rows={6}
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !content.trim()}
            onClick={onSave}
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Save note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CircleProgress({ percent, size = 36 }: { percent: number; size?: number }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 shrink-0"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-slate-200"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-orange-500 transition-[stroke-dashoffset] duration-500 ease-out"
      />
    </svg>
  );
}

export function PresentationDetailClient({ presentationId }: { presentationId: string }) {
  const { token, business } = useAuth();
  const [detail, setDetail] = useState<PresentationDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [showKnowledgeForm, setShowKnowledgeForm] = useState(false);
  const [knowledgeKind, setKnowledgeKind] = useState<"fact" | "style">("fact");
  const loadInFlight = useRef(false);
  const openPreviewWhenReadyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token || !business || loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      setDetail(await api.getPresentation(token, business.id, presentationId));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      loadInFlight.current = false;
    }
  }, [token, business, presentationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail || detail.status !== "processing") return;
    const id = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(id);
  }, [detail?.status, load]);

  // After Prepare with AI finishes, open preview in a new tab once.
  useEffect(() => {
    if (!detail || !openPreviewWhenReadyRef.current) return;
    if (detail.status === "ready" || detail.status === "completed") {
      openPreviewWhenReadyRef.current = false;
      window.open(
        adminPath(business?.slug ?? "", `/presentations/${presentationId}/preview`),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    if (detail.status === "failed") {
      openPreviewWhenReadyRef.current = false;
    }
  }, [detail?.status, presentationId]);

  useEffect(() => {
    setSelectedSlide(0);
  }, [presentationId, detail?.slides.length]);

  const onUpload = async (file: File | null) => {
    if (!token || !business || !file) return;
    setBusy(true);
    setError("");
    try {
      await api.uploadPresentationFile(token, business.id, presentationId, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const onProcess = async () => {
    if (!token || !business) return;
    setBusy(true);
    setError("");
    openPreviewWhenReadyRef.current = true;
    try {
      await api.processPresentation(token, business.id, presentationId);
      await load();
    } catch (err) {
      openPreviewWhenReadyRef.current = false;
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setBusy(false);
    }
  };

  const onCancelProcess = async () => {
    if (!token || !business) return;
    openPreviewWhenReadyRef.current = false;
    setBusy(true);
    setError("");
    try {
      await api.cancelPresentationProcess(token, business.id, presentationId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop preparation");
    } finally {
      setBusy(false);
    }
  };

  const onLaunch = async () => {
    if (!token || !business) return;
    setBusy(true);
    setError("");
    try {
      const session = await api.launchPresentationSession(token, business.id, presentationId, {
        name: detail?.title,
        enable_qna: true,
        auto_start: true,
      });
      try {
        sessionStorage.setItem(`voicetalk:live-session:${presentationId}`, session.id);
      } catch {
        // ignore
      }
      // Same-tab navigation preserves the click gesture so autoplay is less likely to block.
      window.location.assign(adminPath(business?.slug ?? "", `/sessions/${session.id}/live`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setBusy(false);
    }
  };

  const onLanguageChange = async (language: AiLanguage) => {
    if (!token || !business || !detail) return;
    if (normalizePresentationLanguage(detail.language) === language) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.updatePresentation(token, business.id, presentationId, {
        language,
      });
      setDetail((prev) => (prev ? { ...prev, ...updated, knowledge: prev.knowledge } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update language");
    } finally {
      setBusy(false);
    }
  };

  const knowledge = detail?.knowledge ?? [];

  const resetKnowledgeForm = () => {
    setKnowledgeTitle("");
    setKnowledgeContent("");
    setEditingKnowledgeId(null);
    setKnowledgeKind("fact");
    setShowKnowledgeForm(false);
  };

  const openNewKnowledgeForm = (kind: "fact" | "style" = "fact") => {
    setEditingKnowledgeId(null);
    setKnowledgeKind(kind);
    setKnowledgeTitle(kind === "style" ? "Delivery style" : "");
    setKnowledgeContent("");
    setShowKnowledgeForm(true);
  };

  const onKnowledgeKindChange = (kind: "fact" | "style") => {
    setKnowledgeKind(kind);
    if (kind === "style") {
      setKnowledgeTitle((prev) => (STYLE_NOTE_RE.test(prev) ? prev : "Delivery style"));
    }
  };

  const onSaveKnowledge = async () => {
    if (!token || !business || !knowledgeContent.trim()) return;
    const title =
      knowledgeKind === "style"
        ? knowledgeTitle.trim() || "Delivery style"
        : knowledgeTitle;
    setKnowledgeBusy(true);
    setError("");
    try {
      if (editingKnowledgeId) {
        await api.updatePresentationKnowledge(
          token,
          business.id,
          presentationId,
          editingKnowledgeId,
          { title, content: knowledgeContent },
        );
      } else {
        await api.createPresentationKnowledge(token, business.id, presentationId, {
          title,
          content: knowledgeContent,
          sort_order: knowledge.length,
        });
      }
      resetKnowledgeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save knowledge");
    } finally {
      setKnowledgeBusy(false);
    }
  };

  const onEditKnowledge = (entry: PresentationKnowledgeEntry) => {
    setEditingKnowledgeId(entry.id);
    setKnowledgeKind(isDeliveryStyleNote(entry) ? "style" : "fact");
    setKnowledgeTitle(entry.title);
    setKnowledgeContent(entry.content);
    setShowKnowledgeForm(true);
  };

  const onDeleteKnowledge = async (entryId: string) => {
    if (!token || !business) return;
    setKnowledgeBusy(true);
    setError("");
    try {
      await api.deletePresentationKnowledge(token, business.id, presentationId, entryId);
      if (editingKnowledgeId === entryId) resetKnowledgeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete knowledge");
    } finally {
      setKnowledgeBusy(false);
    }
  };

  const progress = useMemo(() => (detail ? processingProgress(detail) : null), [detail]);

  if (!detail || !progress) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {error || "Loading…"}
      </div>
    );
  }

  const isReady = detail.status === "ready" || detail.status === "completed";
  const isProcessing = detail.status === "processing";
  const primaryFile = detail.files[0];
  const slides = detail.slides ?? [];
  const slide = slides[selectedSlide] ?? slides[0] ?? null;
  const thumbUrl = detail.thumbnail_url ? resolveMediaUrl(detail.thumbnail_url) : "";
  const status = statusLabel(progress.tone, Boolean(primaryFile));

  return (
    <div className="-mx-4 -mt-4 -mb-4 flex h-[calc(100dvh-3.5rem)] w-auto flex-col overflow-hidden bg-background md:-mt-6 md:-mb-6 lg:-mx-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="hidden"
        onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
        disabled={busy || isProcessing}
      />

      {/* Toolbar */}
      <header className="shrink-0 border-b border-slate-200 bg-background">
        <div className="flex items-start gap-3 px-4 py-3 lg:items-center lg:px-6">
          <Link
            href={adminPath(business?.slug ?? "", "/presentations")}
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:mt-0"
            aria-label="Back to presentations"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>

          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  {detail.title}
                </h1>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide",
                    progress.tone === "done" && "bg-emerald-50 text-emerald-700",
                    progress.tone === "active" && "bg-orange-50 text-orange-700",
                    progress.tone === "error" && "bg-red-50 text-red-700",
                    progress.tone === "idle" && "bg-slate-100 text-slate-600",
                  )}
                >
                  {status}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs text-slate-500">
                {detail.total_slides > 0 ? (
                  <span className="rounded-md bg-slate-50 px-1.5 py-0.5 tabular-nums text-slate-600">
                    {detail.total_slides} slides
                  </span>
                ) : null}
                {detail.estimated_duration ? (
                  <span className="rounded-md bg-slate-50 px-1.5 py-0.5 tabular-nums text-slate-600">
                    ~{Math.max(1, Math.round(detail.estimated_duration / 60))} min
                  </span>
                ) : null}
                {primaryFile?.file_name ? (
                  <span
                    className="max-w-[12rem] truncate rounded-md bg-slate-50 px-1.5 py-0.5 text-slate-600 sm:max-w-[16rem]"
                    title={primaryFile.file_name}
                  >
                    {primaryFile.file_name}
                  </span>
                ) : (
                  <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-slate-500">
                    No file uploaded
                  </span>
                )}

                <span className="mx-0.5 hidden text-slate-300 sm:inline" aria-hidden>
                  |
                </span>

                <div
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5"
                  role="group"
                  aria-label="AI Present language"
                >
                  <GlobeAltIcon className="ml-1 hidden h-3.5 w-3.5 text-slate-400 sm:block" />
                  {PRESENTATION_LANGUAGES.map((option) => {
                    const selected =
                      normalizePresentationLanguage(detail.language) === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={busy || isProcessing}
                        title={`Speak ${option.label}`}
                        aria-pressed={selected}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px] font-semibold transition disabled:opacity-50",
                          selected
                            ? "bg-slate-900 text-white"
                            : "text-slate-500 hover:text-slate-800",
                        )}
                        onClick={() => void onLanguageChange(option.value)}
                      >
                        {option.short}
                      </button>
                    );
                  })}
                </div>

                {primaryFile ? (
                  <button
                    type="button"
                    disabled={busy || isProcessing}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                    Replace
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {primaryFile ? (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={adminPath(business?.slug ?? "", `/presentations/${presentationId}/preview`)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <EyeIcon className="h-4 w-4" />
                    Preview
                  </Link>
                </Button>
              ) : null}
              {isReady ? (
                <Button size="sm" disabled={busy} onClick={() => void onLaunch()}>
                  <PlayIcon className="h-4 w-4" />
                  AI Present
                </Button>
              ) : primaryFile && isProcessing ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onCancelProcess()}
                >
                  <StopIcon className="h-4 w-4" />
                  Stop
                </Button>
              ) : primaryFile ? (
                <Button size="sm" disabled={busy} onClick={() => void onProcess()}>
                  {detail.status === "failed" ? "Retry prepare" : "Prepare with AI"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 lg:px-6">
          {error}
        </p>
      ) : null}

      {!primaryFile ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onUpload(e.dataTransfer.files?.[0] ?? null);
          }}
          className={cn(
            "m-4 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 transition lg:m-6",
            dragOver
              ? "border-orange-400 bg-orange-50"
              : "border-slate-300 bg-slate-50/80 hover:border-slate-400",
          )}
        >
          <ArrowUpTrayIcon className="h-8 w-8 text-slate-400" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-900">Drop your .pptx here</p>
            <p className="mt-1 text-sm text-slate-500">or click to browse</p>
          </div>
        </button>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Second sidebar — fixed; only slide list scrolls inside */}
          <aside className="flex max-h-64 w-full shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-white lg:max-h-none lg:h-full lg:w-[220px] lg:border-b-0 lg:border-r">
            <div className="shrink-0 px-3 py-2.5">
              <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                Slides
              </p>
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-1.5">
              {slides.length === 0 ? (
                <li className="px-2.5 py-6 text-center text-xs text-slate-400">
                  Slides appear after preparation
                </li>
              ) : (
                slides.map((s, idx) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSlide(idx)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                        idx === selectedSlide
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold",
                          idx === selectedSlide
                            ? "bg-white/15 text-white"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {s.slide_number}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {s.title || `Slide ${s.slide_number}`}
                        </span>
                        {s.duration_seconds > 0 ? (
                          <span
                            className={cn(
                              "mt-0.5 block text-[10px]",
                              idx === selectedSlide ? "text-white/60" : "text-slate-400",
                            )}
                          >
                            ~{Math.max(1, Math.round(s.duration_seconds))}s
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            {primaryFile && (isReady || isProcessing) ? (
              <div className="mt-auto shrink-0 bg-white p-2.5">
                {isProcessing ? (
                  <div className="space-y-2">
                    <div className="flex w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5">
                      <CircleProgress percent={progress.percent} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-800">
                          {progress.label}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                          {progress.percent}%
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={busy}
                      onClick={() => void onCancelProcess()}
                    >
                      <StopIcon className="h-3.5 w-3.5" />
                      Stop preparing
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void onProcess()}
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    Re-run preparation
                  </Button>
                )}
              </div>
            ) : null}
          </aside>

          {/* Main pane — only this column scrolls */}
          <div className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain p-4">
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="relative aspect-[16/9] bg-[#f4f4f5]">
                  {thumbUrl && selectedSlide === 0 ? (
                    <img
                      src={thumbUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        {slide?.title || `Slide ${(slide?.slide_number ?? selectedSlide + 1)}`}
                      </p>
                      <p className="max-w-md text-xs leading-relaxed text-slate-400">
                        {slide?.content?.texts?.slice(0, 3).join(" · ") ||
                          "Open Preview to walk through the full deck."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-h-[200px] flex-col rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                  <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    Narration
                  </p>
                  {slide?.duration_seconds ? (
                    <p className="text-[11px] text-slate-400">
                      ~{Math.max(1, Math.round(slide.duration_seconds))}s
                    </p>
                  ) : null}
                </div>
                <div className="px-4 py-3">
                  {slide?.script ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {slide.script}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400">
                      {isProcessing
                        ? "AI is writing narration…"
                        : isReady
                          ? "No script on this slide."
                          : "Run Prepare with AI to generate narration for each slide."}
                    </p>
                  )}
                </div>
              </div>

              <section className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-900">Knowledge</h2>
                      {knowledge.length > 0 ? (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
                          {knowledge.length}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Facts for live Q&A. Add a delivery-style note to shape how AI Present speaks.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => openNewKnowledgeForm("fact")}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>

                {knowledge.length === 0 ? (
                  <div className="border-t border-slate-100 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-slate-800">No notes yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                      Add pricing, FAQs, or a delivery-style note so AI Present can answer and
                      sound on-brand.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openNewKnowledgeForm("fact")}
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Add fact
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openNewKnowledgeForm("style")}
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Delivery style
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-2 border-t border-slate-100 px-3 py-3">
                    {knowledge.map((entry) => {
                      const styleNote = isDeliveryStyleNote(entry);
                      return (
                        <li
                          key={entry.id}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300"
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => onEditKnowledge(entry)}
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-medium text-slate-900">
                                  {entry.title.trim() ||
                                    (styleNote ? "Delivery style" : "Untitled note")}
                                </span>
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                    styleNote
                                      ? "bg-violet-50 text-violet-700"
                                      : "bg-slate-100 text-slate-600",
                                  )}
                                >
                                  {styleNote ? "Style" : "Fact"}
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                {entry.content}
                              </p>
                            </button>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Edit note"
                                onClick={() => onEditKnowledge(entry)}
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                aria-label="Delete note"
                                disabled={knowledgeBusy}
                                onClick={() => void onDeleteKnowledge(entry.id)}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {detail.processing_error && !isReady ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {detail.processing_error}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <KnowledgeFormModal
        open={showKnowledgeForm}
        editing={Boolean(editingKnowledgeId)}
        kind={knowledgeKind}
        title={knowledgeTitle}
        content={knowledgeContent}
        busy={knowledgeBusy}
        onClose={resetKnowledgeForm}
        onKindChange={onKnowledgeKindChange}
        onTitleChange={setKnowledgeTitle}
        onContentChange={setKnowledgeContent}
        onSave={() => void onSaveKnowledge()}
      />
    </div>
  );
}
