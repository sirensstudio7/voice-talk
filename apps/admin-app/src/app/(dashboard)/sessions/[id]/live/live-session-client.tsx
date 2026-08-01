"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarMode } from "@voicetalk/avatar";
import {
  GREETING_WAVE_CLIP,
  TALKING_HAND_GESTURE_CHANCE,
  TALKING_HAND_GESTURE_CLIP,
} from "@voicetalk/avatar";

import { Button } from "@/components/ui/button";
import {
  api,
  type PresentationSessionAnalytics,
  type PresentationSessionDetail,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEFAULT_TEMPLATE_ID, getAssistantTemplate } from "@/lib/assistant-templates";
import { PresenterPcmPlayer, buildPresenterWsUrl } from "@/lib/presenter-pcm";

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

/** Ceiling if Live never finishes — not used as a post-speech pause. */
function estimateSpeechMs(text: string, floorMs = 4000): number {
  const chars = text.trim().length;
  if (!chars) return floorMs;
  return Math.max(floorMs, Math.min(120_000, Math.round((chars / 13) * 1000) + 800));
}

function resolveSpeakScript(
  detail: PresentationSessionDetail,
  stage: string,
  slideId?: string,
): { key: string; text: string; expectedMs: number; fallbackMs: number } | null {
  if (stage === "greeting") {
    const text = detail.presentation?.greeting_script?.trim() || "";
    const expectedMs = estimateSpeechMs(text, 6000);
    return {
      key: `greeting:${text.slice(0, 40)}`,
      text,
      expectedMs,
      fallbackMs: expectedMs + 25_000,
    };
  }
  if (stage === "closing") {
    const text = detail.presentation?.closing_script?.trim() || "";
    const expectedMs = estimateSpeechMs(text, 6000);
    return {
      key: `closing:${text.slice(0, 40)}`,
      text,
      expectedMs,
      fallbackMs: expectedMs + 25_000,
    };
  }
  if (stage === "presenting" && slideId) {
    const slide = detail.slides.find((s) => s.id === slideId);
    const text = slide?.script?.trim() || "";
    const expectedMs = Math.max(
      estimateSpeechMs(text, 5000),
      (slide?.duration_seconds || 0) * 1000,
    );
    return {
      key: `slide:${slideId}:${text.slice(0, 40)}`,
      text,
      expectedMs,
      fallbackMs: expectedMs + 30_000,
    };
  }
  if (stage === "answering") {
    const q = detail.questions.at(-1);
    const text = q?.answer?.trim() || "";
    const expectedMs = estimateSpeechMs(text, 4000);
    return {
      key: `answering:${q?.id ?? "none"}`,
      text,
      expectedMs,
      fallbackMs: expectedMs + 25_000,
    };
  }
  return null;
}

/** Local stage advance so the next slide can start without waiting on the API. */
function optimisticAdvance(
  detail: PresentationSessionDetail,
): PresentationSessionDetail | null {
  const { session, slides, presentation } = detail;
  if (session.status === "greeting") {
    const first = slides[0];
    return {
      ...detail,
      session: {
        ...session,
        status: first ? "presenting" : "closing",
        current_slide_number: first?.slide_number ?? 0,
      },
    };
  }
  if (session.status === "presenting") {
    const idx = slides.findIndex((s) => s.slide_number === session.current_slide_number);
    const next = slides[idx + 1];
    if (next) {
      return {
        ...detail,
        session: {
          ...session,
          status: "presenting",
          current_slide_number: next.slide_number,
        },
      };
    }
    return {
      ...detail,
      session: { ...session, status: "closing" },
    };
  }
  if (session.status === "closing") {
    return {
      ...detail,
      session: {
        ...session,
        status: session.enable_qna ? "qna_waiting" : "completed",
      },
      presentation,
    };
  }
  if (session.status === "answering" || session.status === "thinking") {
    return {
      ...detail,
      session: { ...session, status: "qna_waiting" },
    };
  }
  return null;
}

export function LiveSessionClient({ sessionId }: { sessionId: string }) {
  const { token, business } = useAuth();
  const [detail, setDetail] = useState<PresentationSessionDetail | null>(null);
  const [analytics, setAnalytics] = useState<PresentationSessionAnalytics | null>(null);
  const [error, setError] = useState("");
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("idle");
  const loadInFlight = useRef(false);
  const playerRef = useRef<PresenterPcmPlayer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const liveReadyRef = useRef(false);
  const speakKeyRef = useRef("");
  /** speaking | completing | continuing | done */
  const speakPhaseRef = useRef<"idle" | "speaking" | "completing" | "continuing" | "done">(
    "idle",
  );
  const speakGenRef = useRef(0);
  const speakStartedAtRef = useRef(0);
  const pcmBytesForSpeakRef = useRef(0);
  const lastPcmAtRef = useRef(0);
  const continuedOnceRef = useRef(false);
  const finishStageRef = useRef<() => void>(() => undefined);
  const pendingSpeakRef = useRef<{
    key: string;
    text: string;
    expectedMs: number;
    fallbackMs: number;
  } | null>(null);
  const advancingRef = useRef(false);
  const advanceGenRef = useRef(0);
  const poseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetingWaveFiredRef = useRef(false);
  const talkGestureKeyRef = useRef("");

  if (!playerRef.current) {
    playerRef.current = new PresenterPcmPlayer();
  }

  const clearPoseTimer = useCallback(() => {
    if (poseTimerRef.current) {
      clearTimeout(poseTimerRef.current);
      poseTimerRef.current = null;
    }
  }, []);

  const setTimedAvatarMode = useCallback(
    (mode: AvatarMode, durationMs: number, afterward: AvatarMode = "idle") => {
      clearPoseTimer();
      setAvatarMode(mode);
      poseTimerRef.current = setTimeout(() => {
        poseTimerRef.current = null;
        setAvatarMode(afterward);
      }, durationMs);
    },
    [clearPoseTimer],
  );

  /** Match customer-app: short hello wave when greeting narration starts. */
  const triggerGreetingWave = useCallback(() => {
    if (greetingWaveFiredRef.current) return;
    greetingWaveFiredRef.current = true;
    setTimedAvatarMode("greeting", Math.round(GREETING_WAVE_CLIP.period * 1000), "talking");
  }, [setTimedAvatarMode]);

  /** Occasional talking-hand gesture while presenting (same chance as kiosk). */
  const maybeTriggerTalkingHand = useCallback(
    (speakKey: string) => {
      if (talkGestureKeyRef.current === speakKey) return;
      talkGestureKeyRef.current = speakKey;
      if (Math.random() >= TALKING_HAND_GESTURE_CHANCE) return;
      setTimedAvatarMode(
        "talk_gesture",
        Math.round(TALKING_HAND_GESTURE_CLIP.period * 1000),
        "talking",
      );
    },
    [setTimedAvatarMode],
  );

  // Lip sync from live PCM amplitude (same idea as customer-app voice-audio).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setMouthOpen(playerRef.current?.getPlaybackLevel() ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    return () => clearPoseTimer();
  }, [clearPoseTimer]);

  // Fresh session → allow greeting wave again.
  useEffect(() => {
    greetingWaveFiredRef.current = false;
    talkGestureKeyRef.current = "";
    clearPoseTimer();
    setAvatarMode("idle");
    setMouthOpen(0);
  }, [sessionId, clearPoseTimer]);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!token || !business || loadInFlight.current) return;
    // Avoid poll overwriting an optimistic slide advance mid-handoff.
    if (advancingRef.current && !opts?.force) return;
    loadInFlight.current = true;
    const gen = advanceGenRef.current;
    try {
      const next = await api.getPresentationSession(token, business.id, sessionId);
      if (gen !== advanceGenRef.current && !opts?.force) return;
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
      playerRef.current?.close();
      playerRef.current = null;
      if (wsRef.current) {
        try {
          wsRef.current.send(JSON.stringify({ type: "close" }));
        } catch {
          // ignore
        }
        wsRef.current.close();
        wsRef.current = null;
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
  const isGreeting = stage === "greeting";
  const isClosing = stage === "closing";
  const isStageFocus = isGreeting || isClosing;

  const finishStage = useCallback(() => {
    if (!token || !business || advancingRef.current) return;
    advancingRef.current = true;
    advanceGenRef.current += 1;
    const gen = advanceGenRef.current;

    // Flip local stage immediately so the next narration can start without an API gap.
    setDetail((prev) => {
      if (!prev) return prev;
      return optimisticAdvance(prev) ?? prev;
    });

    void api
      .controlPresentationSession(token, business.id, sessionId, "finish_stage")
      .then(() => load({ force: true }))
      .catch((err) => {
        if (gen === advanceGenRef.current) {
          setError(err instanceof Error ? err.message : "Advance failed");
          void load({ force: true });
        }
      })
      .finally(() => {
        if (gen === advanceGenRef.current) advancingRef.current = false;
      });
  }, [token, business, sessionId, load]);

  finishStageRef.current = finishStage;

  const speakPayload = useMemo(() => {
    if (!detail) return null;
    if (
      stage === "paused" ||
      stage === "completed" ||
      stage === "thinking" ||
      stage === "initializing" ||
      stage === "qna_waiting"
    ) {
      return null;
    }
    return resolveSpeakScript(detail, stage, currentSlide?.id);
  }, [detail, stage, currentSlide?.id]);

  const flushSpeak = useCallback(async () => {
    const payload = pendingSpeakRef.current;
    const ws = wsRef.current;
    if (!payload || !ws || ws.readyState !== WebSocket.OPEN || !liveReadyRef.current) return;
    // Skip if this script is already in flight.
    if (
      speakKeyRef.current === payload.key &&
      (speakPhaseRef.current === "speaking" ||
        speakPhaseRef.current === "completing" ||
        speakPhaseRef.current === "continuing")
    ) {
      return;
    }

    try {
      await playerRef.current?.unlock();
      setNeedsAudioUnlock(false);
    } catch {
      setNeedsAudioUnlock(true);
      return;
    }

    speakGenRef.current += 1;
    speakKeyRef.current = payload.key;
    speakPhaseRef.current = "speaking";
    speakStartedAtRef.current = Date.now();
    pcmBytesForSpeakRef.current = 0;
    lastPcmAtRef.current = 0;
    continuedOnceRef.current = false;
    advancingRef.current = false;
    playerRef.current?.stop();
    setSpeaking(true);

    // Drive avatar poses like customer-app (wave / talk gesture / talking).
    if (payload.key.startsWith("greeting:")) {
      triggerGreetingWave();
    } else if (payload.key.startsWith("closing:")) {
      setTimedAvatarMode("goodbye", Math.round(GREETING_WAVE_CLIP.period * 1000), "talking");
    } else if (
      payload.key.startsWith("slide:") ||
      payload.key.startsWith("answering:")
    ) {
      setAvatarMode("talking");
      maybeTriggerTalkingHand(payload.key);
    } else {
      setAvatarMode("talking");
    }

    ws.send(JSON.stringify({ type: "speak", text: payload.text }));
  }, [maybeTriggerTalkingHand, setTimedAvatarMode, triggerGreetingWave]);

  const completeSpeakAndAdvance = useCallback(async (key: string, reason: string) => {
    // Ignore late/duplicate events from a previous slide.
    if (!key || speakKeyRef.current !== key || advancingRef.current) return;
    if (speakPhaseRef.current !== "speaking" && speakPhaseRef.current !== "continuing") {
      return;
    }

    const gen = speakGenRef.current;
    const pending = pendingSpeakRef.current;
    const expectedMs = pending?.key === key ? pending.expectedMs : 8000;
    const isActive = () => speakGenRef.current === gen && speakKeyRef.current === key;

    speakPhaseRef.current = "completing";

    // Wait for first audio chunk (turn_complete often beats the first PCM).
    const audioWaitDeadline = Date.now() + 12_000;
    while (pcmBytesForSpeakRef.current === 0 && Date.now() < audioWaitDeadline) {
      if (!isActive()) return;
      await new Promise((r) => setTimeout(r, 40));
    }
    if (!isActive()) return;

    // Drain playback; cancel if a newer speak superseded this one.
    await playerRef.current?.waitUntilQuiet(90_000, 120, () => !isActive());
    if (!isActive() || speakPhaseRef.current !== "completing") return;

    // Brief silence after last PCM so late trailing chunks can still arrive.
    // Keep this short — it is the main “dead air” between slides.
    const silenceNeededMs = 280;
    const silenceDeadline = Date.now() + 8_000;
    while (Date.now() < silenceDeadline) {
      if (!isActive() || speakPhaseRef.current !== "completing") return;
      const sincePcm = Date.now() - (lastPcmAtRef.current || 0);
      const remaining = playerRef.current?.remainingSeconds() ?? 0;
      const busy = playerRef.current?.hasActivePlayback() ?? false;
      if (!busy && remaining <= 0.05 && sincePcm >= silenceNeededMs) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    if (!isActive() || speakPhaseRef.current !== "completing") return;

    const pcmMs = PresenterPcmPlayer.pcmDurationMs(pcmBytesForSpeakRef.current);
    // Only nudge a continue when audio is clearly truncated (was too aggressive before).
    const minCoverageMs = Math.max(2_000, Math.round(expectedMs * 0.35));

    // Model stopped too early (common with paraphrase) — ask once to finish the slide.
    if (
      reason === "turn_complete" &&
      !continuedOnceRef.current &&
      pcmMs > 0 &&
      pcmMs < minCoverageMs
    ) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        continuedOnceRef.current = true;
        speakPhaseRef.current = "continuing";
        setSpeaking(true);
        ws.send(
          JSON.stringify({
            type: "speak",
            text: "Continue the same slide. Cover any remaining talking points you have not spoken yet. Keep the same natural presenting style. Do not restart from the beginning. Stop only when every key point is covered.",
          }),
        );
        if (process.env.NODE_ENV === "development") {
          console.info("[live-present] continue slide — coverage short", {
            key,
            pcmMs,
            minCoverageMs,
          });
        }
        return;
      }
    }

    speakPhaseRef.current = "done";
    setSpeaking(false);
    setMouthOpen(0);
    // Keep a short gesture if one is mid-clip; otherwise return to idle between slides.
    setAvatarMode((prev) =>
      prev === "greeting" || prev === "talk_gesture" || prev === "goodbye" ? prev : "idle",
    );
    if (process.env.NODE_ENV === "development") {
      console.info("[live-present] advance", reason, {
        key,
        pcmMs,
        expectedMs,
        elapsedMs: Date.now() - (speakStartedAtRef.current || Date.now()),
      });
    }
    finishStageRef.current();
  }, []);

  // Connect Gemini Live once session detail is available.
  useEffect(() => {
    if (!token || !business || !detail || detail.session.status === "completed") return;
    if (wsRef.current) return;

    const ws = new WebSocket(buildPresenterWsUrl(token, business.id, sessionId));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    setLiveReady(false);

    const notePcm = (buf: ArrayBuffer) => {
      pcmBytesForSpeakRef.current += buf.byteLength;
      lastPcmAtRef.current = Date.now();
      setSpeaking(true);
      playerRef.current?.play(buf);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        notePcm(event.data);
        return;
      }
      if (typeof Blob !== "undefined" && event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buf) => {
          if (wsRef.current !== ws) return;
          notePcm(buf);
        });
        return;
      }

      try {
        const payload = JSON.parse(String(event.data)) as {
          type?: string;
          status?: string;
          error?: string;
        };
        if (payload.type === "session.status" && payload.status === "connected") {
          liveReadyRef.current = true;
          setLiveReady(true);
          void flushSpeak();
        }
        if (payload.type === "turn_complete") {
          const key = speakKeyRef.current;
          const phase = speakPhaseRef.current;
          if (key && (phase === "speaking" || phase === "continuing")) {
            void completeSpeakAndAdvance(key, "turn_complete");
          }
        }
        if (payload.type === "error" && payload.error) {
          setError(payload.error);
          setSpeaking(false);
        }
        if (payload.type === "audio.interrupted") {
          playerRef.current?.stop();
          setSpeaking(false);
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      setError("Live voice connection failed");
      liveReadyRef.current = false;
      setLiveReady(false);
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        liveReadyRef.current = false;
        setLiveReady(false);
      }
    };

    return () => {
      try {
        ws.send(JSON.stringify({ type: "close" }));
      } catch {
        // ignore
      }
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
    // Only reconnect when identity changes — not on every detail poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, business?.id, sessionId, Boolean(detail)]);

  // Queue narration whenever the stage script changes.
  useEffect(() => {
    if (!speakPayload) {
      pendingSpeakRef.current = null;
      return;
    }
    if (!speakPayload.text.trim()) {
      // Empty script — advance after a short beat.
      const t = window.setTimeout(() => finishStageRef.current(), 1200);
      return () => window.clearTimeout(t);
    }
    pendingSpeakRef.current = speakPayload;
    if (speakKeyRef.current !== speakPayload.key || speakPhaseRef.current === "done") {
      void flushSpeak();
    }
  }, [speakPayload, flushSpeak]);

  // Fallback only if Live never finishes — still drains audio first.
  useEffect(() => {
    if (!speakPayload?.text.trim()) return;
    const key = speakPayload.key;
    const timer = window.setTimeout(() => {
      if (
        speakKeyRef.current === key &&
        (speakPhaseRef.current === "speaking" || speakPhaseRef.current === "continuing")
      ) {
        void completeSpeakAndAdvance(key, "fallback");
      }
    }, speakPayload.fallbackMs);
    return () => window.clearTimeout(timer);
  }, [
    speakPayload?.key,
    speakPayload?.fallbackMs,
    speakPayload?.text,
    completeSpeakAndAdvance,
  ]);

  const unlockAudio = async () => {
    try {
      await playerRef.current?.unlock();
      setNeedsAudioUnlock(false);
      void flushSpeak();
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
    detail.slides.length > 0 &&
    stage !== "initializing" &&
    stage !== "completed" &&
    !isStageFocus;
  const deckSlideNumber = Math.max(
    1,
    currentSlide?.slide_number ||
      (session.current_slide_number > 0 ? session.current_slide_number : 1),
  );

  const stageScript = isGreeting
    ? detail.presentation?.greeting_script?.trim() || ""
    : isClosing
      ? detail.presentation?.closing_script?.trim() || ""
      : "";

  const isTalking =
    speaking &&
    !needsAudioUnlock &&
    (stage === "greeting" ||
      stage === "presenting" ||
      stage === "closing" ||
      stage === "answering");

  // Prefer active gesture clips; fall back to talking/idle like the kiosk hero.
  const presentAvatarMode: AvatarMode =
    avatarMode === "greeting" ||
    avatarMode === "talk_gesture" ||
    avatarMode === "goodbye" ||
    avatarMode === "acknowledge"
      ? avatarMode
      : isTalking
        ? "talking"
        : "idle";

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
      <div className="relative flex min-h-0 flex-1 flex-col">
        {stage === "initializing" ? (
          <div className="relative flex flex-1 items-center justify-center bg-slate-950 text-sm text-white/70">
            Preparing presentation…
          </div>
        ) : null}

        {isStageFocus ? (
          <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-hidden bg-slate-950 px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,146,60,0.12),transparent_55%)]" />

            <div className="relative z-10 mt-8 mb-auto max-w-xl shrink-0 text-center sm:mt-12">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-orange-300/90 uppercase">
                {isGreeting ? "Greeting" : "Closing"}
              </p>
              {stageScript ? (
                <p className="mt-3 text-base leading-relaxed text-white/90 sm:text-lg">
                  {stageScript}
                </p>
              ) : (
                <p className="mt-3 text-sm text-white/50">…</p>
              )}
              {!liveReady ? (
                <p className="mt-3 text-xs text-white/45">Connecting live voice…</p>
              ) : null}
            </div>

            <div className="relative z-10 mt-auto flex h-[88vh] w-[62vh] max-h-none max-w-[560px] shrink-0 items-end justify-center">
              <AvatarHero
                key={`${PRESENTER_TEMPLATE.id}-stage`}
                isTalking={isTalking}
                mode={presentAvatarMode}
                mouthOpen={mouthOpen}
                modelPath={PRESENTER_TEMPLATE.modelPath}
                assistantName={PRESENTER_TEMPLATE.assistant_name}
                framing="bust"
                frameClassName="absolute inset-x-0 bottom-0 top-0 mx-auto aspect-[2/3] h-full w-auto max-w-full bg-transparent"
                performanceMode="lite"
                pauseWhenHidden
              />
            </div>

            {needsAudioUnlock ? (
              <button
                type="button"
                className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-black/55 px-6 text-center text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  void unlockAudio();
                }}
              >
                <span className="text-base font-semibold">Tap to enable voice</span>
                <span className="max-w-sm text-sm text-white/80">
                  {error || "Browsers block audio until you interact with this tab."}
                </span>
              </button>
            ) : null}
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

            {!liveReady ? (
              <div className="absolute inset-x-0 top-4 z-30 flex justify-center">
                <span className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
                  Connecting live voice…
                </span>
              </div>
            ) : null}

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
                  {error || "Browsers block audio until you interact with this tab."}
                </span>
              </button>
            ) : null}

            {stage === "paused" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 text-center text-sm font-semibold tracking-wide text-amber-600">
                SESSION PAUSED
              </div>
            ) : null}

            <div className="pointer-events-none absolute right-0 bottom-0 z-50 h-[32vh] w-[22vh] min-h-[200px] min-w-[140px] max-h-[300px] max-w-[200px]">
              <AvatarHero
                key={PRESENTER_TEMPLATE.id}
                isTalking={isTalking}
                mode={presentAvatarMode}
                mouthOpen={mouthOpen}
                modelPath={PRESENTER_TEMPLATE.modelPath}
                assistantName={PRESENTER_TEMPLATE.assistant_name}
                framing="bust"
                frameClassName="absolute inset-x-0 bottom-0 top-0 mx-auto aspect-[2/3] h-full w-auto max-w-full bg-transparent"
                performanceMode="lite"
                pauseWhenHidden
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
