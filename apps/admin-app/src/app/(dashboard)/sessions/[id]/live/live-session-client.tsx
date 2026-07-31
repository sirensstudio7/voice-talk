"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  api,
  type PresentationAudioAsset,
  type PresentationSessionAnalytics,
  type PresentationSessionDetail,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEFAULT_TEMPLATE_ID, getAssistantTemplate } from "@/lib/assistant-templates";

const PptxDeckViewer = dynamic(
  () => import("@/components/pptx-deck-viewer").then((m) => m.PptxDeckViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-white text-sm text-muted-foreground">
        Loading PowerPoint…
      </div>
    ),
  },
);

const AvatarHero = dynamic(
  () => import("@voicetalk/avatar").then((mod) => ({ default: mod.AvatarHero })),
  {
    ssr: false,
    loading: () => null,
  },
);

const PRESENTER_TEMPLATE = getAssistantTemplate(DEFAULT_TEMPLATE_ID)!;

function resolveAudioAsset(
  detail: PresentationSessionDetail,
  kind: "greeting" | "closing" | "slide",
  slideId?: string,
): PresentationAudioAsset | null {
  if (kind === "greeting" || kind === "closing") {
    return detail.audio_assets.find((a) => a.kind === kind) ?? null;
  }
  if (!slideId) return null;
  return detail.audio_assets.find((a) => a.slide_id === slideId && a.kind === "slide") ?? null;
}

export function LiveSessionClient({ sessionId }: { sessionId: string }) {
  const { token, business } = useAuth();
  const [detail, setDetail] = useState<PresentationSessionDetail | null>(null);
  const [analytics, setAnalytics] = useState<PresentationSessionAnalytics | null>(null);
  const [error, setError] = useState("");
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const loadInFlight = useRef(false);

  const load = useCallback(async () => {
    if (!token || !business || loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const next = await api.getPresentationSession(token, business.id, sessionId);
      setDetail(next);
      setError("");
      if (next.session.status === "completed" || next.session.status === "qna_waiting") {
        setAnalytics(await api.getPresentationSessionAnalytics(token, business.id, sessionId));
      }
    } finally {
      loadInFlight.current = false;
    }
  }, [token, business, sessionId]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
  }, [load]);

  useEffect(() => {
    if (!detail || detail.session.status === "completed") return;
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [detail?.session.status, load]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const currentSlide = useMemo(() => {
    if (!detail) return null;
    return (
      detail.slides.find((s) => s.slide_number === detail.session.current_slide_number) ?? null
    );
  }, [detail]);

  const stage = detail?.session.status ?? "initializing";

  const finishStage = useCallback(() => {
    if (!token || !business) return;
    void api
      .controlPresentationSession(token, business.id, sessionId, "finish_stage")
      .then(() => load())
      .catch((err) => setError(err instanceof Error ? err.message : "Advance failed"));
  }, [token, business, sessionId, load]);

  const playback = useMemo(() => {
    if (!detail) return null;
    if (
      stage === "paused" ||
      stage === "completed" ||
      stage === "thinking" ||
      stage === "initializing"
    ) {
      return null;
    }

    if (stage === "greeting") {
      const asset = resolveAudioAsset(detail, "greeting");
      return {
        key: `greeting:${asset?.id ?? "text"}`,
        asset,
        fallbackMs: Math.max(
          6000,
          (asset?.duration_seconds ?? 0) * 1000 ||
            Math.min(20000, (detail.presentation?.greeting_script?.length ?? 80) * 50),
        ),
        presentationId: detail.session.presentation_id,
      };
    }
    if (stage === "closing") {
      const asset = resolveAudioAsset(detail, "closing");
      return {
        key: `closing:${asset?.id ?? "text"}`,
        asset,
        fallbackMs: Math.max(
          6000,
          (asset?.duration_seconds ?? 0) * 1000 ||
            Math.min(20000, (detail.presentation?.closing_script?.length ?? 80) * 50),
        ),
        presentationId: detail.session.presentation_id,
      };
    }
    if (stage === "presenting" && currentSlide) {
      const asset = resolveAudioAsset(detail, "slide", currentSlide.id);
      return {
        key: `slide:${currentSlide.id}:${asset?.id ?? "text"}`,
        asset,
        fallbackMs: Math.max(
          4000,
          (currentSlide.duration_seconds || asset?.duration_seconds || 8) * 1000,
        ),
        presentationId: detail.session.presentation_id,
      };
    }
    if (stage === "answering") {
      return {
        key: `answering:${detail.questions.at(-1)?.id ?? "none"}`,
        asset: null,
        fallbackMs: 4000,
        presentationId: detail.session.presentation_id,
      };
    }
    return null;
  }, [detail, stage, currentSlide]);

  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const playbackKey = playback?.key ?? "";
  const businessId = business?.id ?? "";
  const finishStageRef = useRef(finishStage);
  finishStageRef.current = finishStage;
  const retryPlayRef = useRef<(() => Promise<void>) | null>(null);

  // Auto-play stage audio and advance when finished.
  // Important: if the browser blocks autoplay, do NOT advance on a timer —
  // wait for a user tap (unlock) or the stage will skip past the narration.
  useEffect(() => {
    const current = playbackRef.current;
    if (!current || !playbackKey || !token || !businessId) return;

    let cancelled = false;
    let fallbackTimer = 0;
    const audio = audioRef.current;
    const { asset, fallbackMs, presentationId } = current;

    const clearFallback = () => {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    };

    const onEnded = () => {
      clearFallback();
      if (!cancelled) finishStageRef.current();
    };

    const armFallback = (ms: number) => {
      clearFallback();
      fallbackTimer = window.setTimeout(() => {
        if (!cancelled) finishStageRef.current();
      }, ms);
    };

    const loadAndPlay = async () => {
      if (!audio) return;

      // No TTS asset yet — wait longer on greeting/closing (ensure may still be writing).
      // Parent poll will remount this effect when an asset id appears.
      if (!asset) {
        setNeedsAudioUnlock(false);
        const waitingForStageAudio =
          playbackKey.startsWith("greeting:") || playbackKey.startsWith("closing:");
        armFallback(waitingForStageAudio ? Math.max(fallbackMs, 25000) : fallbackMs);
        return;
      }

      audio.removeEventListener("ended", onEnded);
      audio.addEventListener("ended", onEnded);

      try {
        const authUrl = api.presentationAudioUrl(businessId, presentationId, asset.id);
        const res = await fetch(authUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Audio fetch failed (${res.status})`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const objectUrl = URL.createObjectURL(blob);
        blobUrlRef.current = objectUrl;
        audio.src = objectUrl;
        await audio.play();
        if (cancelled) return;
        setNeedsAudioUnlock(false);
        setError("");
        // Safety net if `ended` never fires; clear on natural end.
        const durationMs =
          asset.duration_seconds > 0
            ? (asset.duration_seconds + 1.5) * 1000
            : fallbackMs;
        armFallback(Math.max(fallbackMs, durationMs));
      } catch (err) {
        if (cancelled) return;
        // Autoplay policy or fetch failure — stay on this stage until unlock.
        setNeedsAudioUnlock(true);
        const msg = err instanceof Error ? err.message : "Audio blocked";
        if (msg.includes("fetch") || msg.includes("Audio fetch")) {
          setError("Could not load narration audio. Tap to retry.");
        }
        clearFallback();
      }
    };

    retryPlayRef.current = loadAndPlay;
    void loadAndPlay();

    return () => {
      cancelled = true;
      clearFallback();
      audio?.pause();
      audio?.removeEventListener("ended", onEnded);
      retryPlayRef.current = null;
    };
  }, [playbackKey, token, businessId]);

  const unlockAudio = async () => {
    const retry = retryPlayRef.current;
    if (retry) {
      await retry();
      return;
    }
    const audio = audioRef.current;
    if (!audio?.src) return;
    try {
      await audio.play();
      setNeedsAudioUnlock(false);
    } catch {
      setNeedsAudioUnlock(true);
    }
  };

  if (!detail) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        {error || "Preparing presentation…"}
      </div>
    );
  }

  const { session } = detail;
  const showDeck =
    detail.slides.length > 0 && stage !== "initializing" && stage !== "completed";
  const deckSlideNumber = Math.max(
    1,
    currentSlide?.slide_number ||
      (session.current_slide_number > 0 ? session.current_slide_number : 1),
  );

  if (stage === "completed") {
    return (
      <div className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
        <h1 className="text-2xl font-semibold">Presentation successfully ended</h1>
        {analytics ? (
          <div className="grid w-full grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-border p-3">
              Slides: {analytics.total_slides}
            </div>
            <div className="rounded-md border border-border p-3">
              Questions: {analytics.question_count}
            </div>
            <div className="rounded-md border border-border p-3">
              Duration: {Math.round(analytics.session_duration_seconds / 60)} min
            </div>
            <div className="rounded-md border border-border p-3">
              Completion: {analytics.completion_rate}%
            </div>
          </div>
        ) : null}
        <Button asChild>
          <Link href={`/presentations/${session.presentation_id}`}>Close session</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-svh flex-col overflow-hidden bg-background text-foreground"
      onClick={() => {
        if (needsAudioUnlock) void unlockAudio();
      }}
    >
      <audio ref={audioRef} className="hidden" preload="auto" playsInline />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {stage === "initializing" ? (
          <div className="relative flex flex-1 items-center justify-center bg-background text-sm text-muted-foreground">
            Preparing presentation…
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[46vh] w-[30vh] max-h-[340px] max-w-[240px] -translate-x-1/2 -translate-y-1/2">
              <AvatarHero
                key={PRESENTER_TEMPLATE.id}
                isTalking={false}
                mode="idle"
                modelPath={PRESENTER_TEMPLATE.modelPath}
                assistantName={PRESENTER_TEMPLATE.assistant_name}
                framing="bust"
                frameClassName="absolute inset-x-0 bottom-0 top-0 mx-auto aspect-[2/3] h-full w-auto max-w-full bg-transparent"
              />
            </div>
          </div>
        ) : null}

        {showDeck ? (
          <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
            <div className="absolute inset-0">
              <PptxDeckViewer
                pptxUrl={
                  token && business
                    ? api.presentationPptxUrl(business.id, detail.session.presentation_id)
                    : null
                }
                authToken={token}
                slideNumber={deckSlideNumber}
                background="white"
                viewerMode="present"
                presenterChrome={false}
                className="h-full w-full"
              />
            </div>

            {needsAudioUnlock ? (
              <button
                type="button"
                className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-black/50 px-6 text-center text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  void unlockAudio();
                }}
              >
                <span className="text-base font-semibold">Tap to enable voice</span>
                <span className="max-w-sm text-sm text-white/80">
                  {error || "Browsers block autoplay until you interact with this tab."}
                </span>
              </button>
            ) : null}

            {stage === "paused" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 text-center text-sm font-semibold tracking-wide text-amber-600">
                SESSION PAUSED
              </div>
            ) : null}

            <div className="pointer-events-none absolute bottom-0 right-0 z-50 h-[32vh] w-[22vh] min-h-[200px] min-w-[140px] max-h-[300px] max-w-[200px]">
              <AvatarHero
                key={PRESENTER_TEMPLATE.id}
                isTalking={
                  stage === "greeting" ||
                  stage === "presenting" ||
                  stage === "closing" ||
                  stage === "answering"
                }
                mode="idle"
                modelPath={PRESENTER_TEMPLATE.modelPath}
                assistantName={PRESENTER_TEMPLATE.assistant_name}
                framing="bust"
                frameClassName="absolute inset-x-0 bottom-0 top-0 mx-auto aspect-[2/3] h-full w-auto max-w-full bg-transparent"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
