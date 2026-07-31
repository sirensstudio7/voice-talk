"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  api,
  type PresentationDetail,
  type PresentationSessionDetail,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function liveSessionStorageKey(presentationId: string) {
  return `voicetalk:live-session:${presentationId}`;
}

function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

const PptxDeckViewer = dynamic(
  () => import("@/components/pptx-deck-viewer").then((m) => m.PptxDeckViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading PowerPoint…
      </div>
    ),
  },
);

export function PresentationPreviewClient({ presentationId }: { presentationId: string }) {
  const { token, business } = useAuth();
  const stageRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<PresentationDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [showScript, setShowScript] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [liveDetail, setLiveDetail] = useState<PresentationSessionDetail | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    if (!token || !business) return;
    void api.getPresentation(token, business.id, presentationId).then(setDetail);
  }, [token, business, presentationId]);

  // Restore director controls if a live session was already started for this deck.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(liveSessionStorageKey(presentationId));
      if (saved) setLiveSessionId(saved);
    } catch {
      // ignore
    }
  }, [presentationId]);

  useEffect(() => {
    if (!token || !business || !liveSessionId) {
      setLiveDetail(null);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await api.getPresentationSession(token, business.id, liveSessionId);
        if (cancelled) return;
        setLiveDetail(next);
        if (next.session.status === "completed") {
          try {
            sessionStorage.removeItem(liveSessionStorageKey(presentationId));
          } catch {
            // ignore
          }
          setLiveSessionId(null);
        } else if (next.session.current_slide_number > 0) {
          setIndex(Math.max(0, next.session.current_slide_number - 1));
        }
      } catch {
        if (!cancelled) {
          setLiveSessionId(null);
          try {
            sessionStorage.removeItem(liveSessionStorageKey(presentationId));
          } catch {
            // ignore
          }
        }
      }
    };
    void refresh();
    const id = window.setInterval(() => void refresh(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, business, liveSessionId, presentationId]);

  const onAiPresent = useCallback(async () => {
    if (!token || !business || !detail) return;
    setLaunching(true);
    setLaunchError("");
    try {
      const session = await api.launchPresentationSession(token, business.id, presentationId, {
        name: detail.title,
        enable_qna: true,
        auto_start: true,
      });
      setLiveSessionId(session.id);
      try {
        sessionStorage.setItem(liveSessionStorageKey(presentationId), session.id);
      } catch {
        // ignore
      }
      window.open(`/sessions/${session.id}/live`, "_blank", "noopener,noreferrer");
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Failed to start AI presentation");
    } finally {
      setLaunching(false);
    }
  }, [token, business, detail, presentationId]);

  const controlLive = useCallback(
    async (action: string) => {
      if (!token || !business || !liveSessionId) return;
      setLiveBusy(true);
      setLaunchError("");
      try {
        await api.controlPresentationSession(token, business.id, liveSessionId, action);
        const next = await api.getPresentationSession(token, business.id, liveSessionId);
        setLiveDetail(next);
        if (next.session.status === "completed") {
          try {
            sessionStorage.removeItem(liveSessionStorageKey(presentationId));
          } catch {
            // ignore
          }
          setLiveSessionId(null);
        } else if (next.session.current_slide_number > 0) {
          setIndex(Math.max(0, next.session.current_slide_number - 1));
        }
      } catch (err) {
        setLaunchError(err instanceof Error ? err.message : "Control failed");
      } finally {
        setLiveBusy(false);
      }
    },
    [token, business, liveSessionId, presentationId],
  );

  const askLive = useCallback(async () => {
    if (!token || !business || !liveSessionId || !question.trim()) return;
    setLiveBusy(true);
    setLaunchError("");
    try {
      await api.askPresentationQuestion(token, business.id, liveSessionId, question.trim());
      setQuestion("");
      setLiveDetail(await api.getPresentationSession(token, business.id, liveSessionId));
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Question failed");
    } finally {
      setLiveBusy(false);
    }
  }, [token, business, liveSessionId, question]);

  const exitFocus = useCallback(async () => {
    setFocusMode(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
  }, []);

  const enterFocus = useCallback(() => {
    setFocusMode(true);
    requestAnimationFrame(() => {
      void stageRef.current?.requestFullscreen?.().catch(() => {
        // Fullscreen may be blocked; expanded in-page layout still applies.
      });
    });
  }, []);

  // Sync when the user leaves browser fullscreen (Esc / system UI).
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const slides = detail?.slides ?? [];
  const slide = slides[index];
  const liveActive = Boolean(liveSessionId && liveDetail && liveDetail.session.status !== "completed");
  const liveStage = liveDetail?.session.status ?? "";
  const canAiPresent =
    Boolean(detail) &&
    !launching &&
    !liveActive &&
    slides.length > 0 &&
    (detail!.status === "ready" || detail!.status === "completed");
  const aiPresentDisabledReason = !detail
    ? ""
    : liveActive
      ? "Live session already running — use the controls below"
      : launching
        ? "Starting session…"
        : slides.length === 0
          ? "No slides yet — process the presentation first"
          : detail.status !== "ready" && detail.status !== "completed"
            ? `AI Present needs status “ready” (currently “${detail.status}”${
                detail.processing_step ? ` · ${detail.processing_step}` : ""
              })`
            : "";
  const audioUrl = useMemo(() => {
    if (!slide || !detail) return null;
    return (
      detail.audio_assets.find((a) => a.slide_id === slide.id && a.kind === "slide")?.storage_path ??
      null
    );
  }, [detail, slide]);

  if (!detail) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading preview…
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      className="relative flex min-h-svh flex-col bg-background text-foreground"
    >
      {focusMode ? (
        <div className="absolute right-3 top-3 z-20">
          <Button
            variant="outline"
            size="sm"
            className="bg-background/90 backdrop-blur"
            onClick={() => void exitFocus()}
          >
            <ArrowsPointingInIcon className="h-4 w-4" />
            Exit focus
          </Button>
        </div>
      ) : (
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{detail.title}</p>
            <p className="text-xs text-muted-foreground">
              {slides.length > 0
                ? `Slide ${slide?.slide_number ?? index + 1} of ${slides.length}`
                : "No slides"}
              {slide?.title ? ` · ${slide.title}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowScript((v) => !v)}
              disabled={slides.length === 0}
            >
              {showScript ? "Hide script" : "Show script"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={slides.length === 0}
              onClick={enterFocus}
            >
              <ArrowsPointingOutIcon className="h-4 w-4" />
              In focus
            </Button>
            {liveActive && liveSessionId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(`/sessions/${liveSessionId}/live`, "_blank", "noopener,noreferrer")
                }
              >
                Open live
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                disabled={!canAiPresent}
                title={aiPresentDisabledReason || "Start AI-led live presentation"}
                onClick={() => void onAiPresent()}
              >
                <PlayIcon className="h-4 w-4" />
                {launching ? "Starting…" : "AI Present"}
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/presentations/${presentationId}`}>
                <XMarkIcon className="h-4 w-4" />
                Close
              </Link>
            </Button>
          </div>
        </header>
      )}

      {launchError ? (
        <p className="border-b border-border px-4 py-2 text-sm text-destructive">{launchError}</p>
      ) : null}

      {!canAiPresent && detail.status !== "processing" && aiPresentDisabledReason ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm">
          <p className="text-muted-foreground">
            {aiPresentDisabledReason}. There is no “Ready” button — run processing on the
            presentation page until Status shows <span className="font-medium text-foreground">ready</span>.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/presentations/${presentationId}`}>Go to processing</Link>
          </Button>
        </div>
      ) : null}

      {detail.status === "processing" ? (
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          Processing… step <span className="font-medium text-foreground">{detail.processing_step || "queued"}</span>.
          AI Present unlocks when status becomes ready.
        </div>
      ) : null}

      {slides.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No slides yet. Process the presentation first.
        </div>
      ) : (
        <div
          className={
            focusMode
              ? "flex min-h-0 flex-1 flex-col"
              : "flex min-h-0 flex-1 flex-col lg:flex-row"
          }
        >
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <div className={focusMode ? "min-h-0 flex-1" : "min-h-0 flex-1 p-3 md:p-6"}>
              <div
                className={
                  focusMode
                    ? "h-full w-full overflow-hidden bg-white"
                    : "mx-auto h-full max-w-6xl overflow-hidden rounded-xl border border-border bg-white shadow-sm"
                }
              >
                {/* Stay mounted across focus toggles — no re-download / re-parse. */}
                <PptxDeckViewer
                  pptxUrl={
                    token && business
                      ? api.presentationPptxUrl(business.id, presentationId)
                      : null
                  }
                  authToken={token}
                  slideNumber={slide?.slide_number ?? index + 1}
                  onSlideChange={(next) => {
                    const max = Math.max(0, slides.length - 1);
                    setIndex(Math.min(max, Math.max(0, next - 1)));
                  }}
                  background="white"
                  viewerMode="present"
                  className="h-full w-full"
                />
              </div>
            </div>

            {!focusMode ? (
              <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-background px-4 py-3">
                {liveActive ? (
                  <>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {liveStage === "paused" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={liveBusy}
                          onClick={() => void controlLive("resume")}
                        >
                          Resume
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={liveBusy}
                          onClick={() => void controlLive("pause")}
                        >
                          Pause
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          liveBusy || liveStage === "greeting" || liveStage === "closing"
                        }
                        onClick={() => void controlLive("previous")}
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="min-w-16 text-center text-xs text-muted-foreground">
                        {liveDetail?.session.current_slide_number || index + 1} / {slides.length}
                        <span className="ml-2 uppercase tracking-wide">
                          {liveStage.replace(/_/g, " ")}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={liveBusy}
                        onClick={() => void controlLive("next")}
                      >
                        Next
                        <ChevronRightIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={liveBusy}
                        onClick={() => void controlLive("end")}
                      >
                        End session
                      </Button>
                    </div>
                    {(liveStage === "qna_waiting" ||
                      liveStage === "answering" ||
                      liveStage === "thinking") && (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <input
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder="Audience question"
                          className="min-w-[16rem] max-w-md flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                        <Button
                          size="sm"
                          disabled={liveBusy || !question.trim()}
                          onClick={() => void askLive()}
                        >
                          Ask
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={index <= 0}
                      onClick={() => setIndex((v) => Math.max(0, v - 1))}
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="min-w-16 text-center text-xs text-muted-foreground">
                      {index + 1} / {slides.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={index >= slides.length - 1}
                      onClick={() => setIndex((v) => Math.min(slides.length - 1, v + 1))}
                    >
                      Next
                      <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {!focusMode && showScript ? (
            <aside className="flex w-full shrink-0 flex-col border-t border-border bg-background lg:w-[360px] lg:border-t-0 lg:border-l">
              <div className="border-b border-border px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {liveActive ? "Live session" : "Generated script"}
                </p>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
                {liveActive && liveDetail ? (
                  <div className="space-y-3 text-xs">
                    <p className="text-muted-foreground">
                      Stage:{" "}
                      <span className="font-medium uppercase text-foreground">
                        {liveStage.replace(/_/g, " ")}
                      </span>
                    </p>
                    <div>
                      <p className="mb-1 font-semibold text-foreground">Incoming</p>
                      {liveDetail.questions
                        .filter((q) => q.status === "incoming")
                        .map((q) => (
                          <p key={q.id} className="truncate text-muted-foreground">
                            {q.question}
                          </p>
                        ))}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-foreground">Answered</p>
                      {liveDetail.questions
                        .filter((q) => q.status === "answered")
                        .map((q) => (
                          <p key={q.id} className="truncate text-muted-foreground">
                            {q.question}
                          </p>
                        ))}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-foreground">Blocked</p>
                      {liveDetail.questions
                        .filter((q) => q.status === "blocked")
                        .map((q) => (
                          <p key={q.id} className="truncate text-muted-foreground">
                            {q.question}
                          </p>
                        ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {slide?.script || "—"}
                    </p>
                    {mediaUrl(audioUrl) ? (
                      <audio controls src={mediaUrl(audioUrl)!} className="w-full" />
                    ) : (
                      <p className="text-xs text-muted-foreground">No audio asset for this slide</p>
                    )}
                  </>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
