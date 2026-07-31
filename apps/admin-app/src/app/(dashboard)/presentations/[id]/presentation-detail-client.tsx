"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckIcon,
  DocumentIcon,
  EyeIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { api, type PresentationDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

const STEPS = [
  "queued",
  "parsing",
  "scripting",
  "voicing",
  "embedding",
  "completed",
] as const;

const STEP_LABELS: Record<(typeof STEPS)[number], string> = {
  queued: "Queued",
  parsing: "Reading slides",
  scripting: "Writing narration",
  voicing: "Generating voice",
  embedding: "Indexing content",
  completed: "Finished",
};

function stepIndex(step: string): number {
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
    const idx = stepIndex(detail.processing_step || "queued");
    const percent = Math.min(96, Math.round(((idx + 0.45) / (STEPS.length - 1)) * 100));
    const key = (STEPS[idx] ?? "queued") as (typeof STEPS)[number];
    return { percent, label: STEP_LABELS[key], tone: "active" };
  }
  if (detail.files.length === 0) {
    return { percent: 0, label: "Add a deck to get started", tone: "idle" };
  }
  return { percent: 0, label: "Ready to prepare", tone: "idle" };
}

function StatusPill({
  tone,
  children,
}: {
  tone: "idle" | "active" | "done" | "error";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "done" && "bg-emerald-50 text-emerald-700",
        tone === "active" && "bg-orange-50 text-orange-700",
        tone === "error" && "bg-red-50 text-red-700",
        tone === "idle" && "bg-slate-100 text-slate-600",
      )}
    >
      {tone === "active" ? <ArrowPathIcon className="h-3 w-3 animate-spin" /> : null}
      {tone === "done" ? <CheckIcon className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

export function PresentationDetailClient({ presentationId }: { presentationId: string }) {
  const { token, business } = useAuth();
  const [detail, setDetail] = useState<PresentationDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const loadInFlight = useRef(false);
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
    try {
      await api.processPresentation(token, business.id, presentationId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
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
      window.open(`/sessions/${session.id}/live`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setBusy(false);
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
  const meta = [
    detail.total_slides ? `${detail.total_slides} slides` : null,
    detail.estimated_duration ? `~${Math.round(detail.estimated_duration / 60)} min` : null,
    detail.language ? detail.language.toUpperCase() : null,
  ].filter(Boolean);

  const statusText =
    progress.tone === "done"
      ? "Ready"
      : progress.tone === "active"
        ? "Preparing"
        : progress.tone === "error"
          ? "Failed"
          : primaryFile
            ? "Draft"
            : "Needs file";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/presentations"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All presentations
      </Link>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900">
              {detail.title}
            </h1>
            <StatusPill tone={progress.tone}>{statusText}</StatusPill>
          </div>
          {detail.description ? (
            <p className="text-sm text-slate-500">{detail.description}</p>
          ) : meta.length > 0 ? (
            <p className="text-sm text-slate-500">{meta.join(" · ")}</p>
          ) : null}
        </div>
        {primaryFile || detail.total_slides > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link
                href={`/presentations/${presentationId}/preview`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <EyeIcon className="h-4 w-4" />
                Preview
              </Link>
            </Button>
            <Button
              disabled={busy || !isReady}
              onClick={() => void onLaunch()}
              title={
                isReady
                  ? "Start AI-led live presentation"
                  : "Finish Prepare with AI first"
              }
            >
              <PlayIcon className="h-4 w-4" />
              AI Present
            </Button>
          </div>
        ) : null}
      </header>

      {error ? (
        <p className="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="hidden"
        onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
        disabled={busy || isProcessing}
      />

      {/* Single primary surface — changes with state */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* File strip */}
        {primaryFile ? (
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <DocumentIcon className="h-4 w-4 text-slate-600" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{primaryFile.file_name}</p>
                <p className="text-xs text-slate-500">
                  {Math.round(primaryFile.size_bytes / 1024)} KB
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy || isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-40"
            >
              Replace
            </button>
          </div>
        ) : null}

        <div className="px-5 py-10 sm:px-8">
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
                "flex w-full flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 transition-colors",
                dragOver
                  ? "border-orange-400 bg-orange-50/50"
                  : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50",
                "disabled:opacity-50",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
                <DocumentIcon className="h-5 w-5 text-slate-700" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-semibold text-slate-900">Drop a PowerPoint here</p>
                <p className="text-sm text-slate-500">or click to browse · .pptx</p>
              </div>
            </button>
          ) : (
            <div className="flex flex-col items-center text-center">
              <p
                className={cn(
                  "text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl",
                  progress.tone === "done" && "text-emerald-600",
                  progress.tone === "error" && "text-red-600",
                  (progress.tone === "idle" || progress.tone === "active") && "text-slate-900",
                )}
              >
                {progress.percent}
                <span className="text-2xl font-medium text-slate-400 sm:text-3xl">%</span>
              </p>
              <p className="mt-3 text-sm font-medium text-slate-900">{progress.label}</p>
              {meta.length > 0 && isReady ? (
                <p className="mt-1 text-sm text-slate-500">{meta.join(" · ")}</p>
              ) : null}

              <div className="mt-8 w-full max-w-sm">
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500 ease-out",
                      progress.tone === "error" && "bg-red-500",
                      progress.tone === "done" && "bg-emerald-500",
                      (progress.tone === "idle" || progress.tone === "active") && "bg-orange-500",
                    )}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>

              {detail.processing_error ? (
                <p className="mt-4 max-w-md text-sm text-red-600">{detail.processing_error}</p>
              ) : null}

              <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
                {isReady ? (
                  <Button
                    size="lg"
                    className="min-w-[10rem]"
                    disabled={busy}
                    onClick={() => void onLaunch()}
                  >
                    <PlayIcon className="h-4 w-4" />
                    AI Present
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="min-w-[10rem]"
                    disabled={busy || isProcessing}
                    onClick={() => void onProcess()}
                  >
                    {isProcessing ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Preparing…
                      </>
                    ) : detail.status === "failed" ? (
                      "Retry"
                    ) : (
                      "Prepare with AI"
                    )}
                  </Button>
                )}
                <Button variant="outline" size="lg" asChild>
                  <Link
                    href={`/presentations/${presentationId}/preview`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <EyeIcon className="h-4 w-4" />
                    Preview
                  </Link>
                </Button>
              </div>

              {isReady ? (
                <button
                  type="button"
                  disabled={busy || isProcessing}
                  onClick={() => void onProcess()}
                  className="mt-4 text-xs text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-40"
                >
                  Re-run preparation
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
