"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarMode } from "@voicetalk/avatar";
import {
  GREETING_WAVE_CLIP,
  HERO_FRAME_CLASS,
  TALKING_HAND_GESTURE_CHANCE,
  TALKING_HAND_GESTURE_CLIP,
} from "@voicetalk/avatar";

import { MicrophoneIcon, PaperAirplaneIcon } from "@heroicons/react/24/solid";

import { Button } from "@/components/ui/button";
import {
  api,
  type PresentationSessionAnalytics,
  type PresentationSessionDetail,
} from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import {
  audienceSpeechErrorMessage,
  blobToBase64,
  pickRecorderMimeType,
  requestAudienceMicrophone,
  stopMediaStream,
} from "@/lib/audience-speech";
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

type SpeakMode = "slide" | "stage";

type SpeakPayload = {
  key: string;
  text: string;
  expectedMs: number;
  fallbackMs: number;
  mode: SpeakMode;
  label: string;
};

function resolveSpeakScript(
  detail: PresentationSessionDetail,
  stage: string,
  slideId?: string,
): SpeakPayload | null {
  if (stage === "greeting") {
    const text = detail.presentation?.greeting_script?.trim() || "";
    const expectedMs = estimateSpeechMs(text, 6000);
    return {
      key: `greeting:${text.slice(0, 40)}`,
      text,
      expectedMs,
      fallbackMs: expectedMs + 25_000,
      mode: "stage",
      label: "greeting",
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
      mode: "stage",
      label: "closing",
    };
  }
  if (stage === "presenting" && slideId) {
    const slide = detail.slides.find((s) => s.id === slideId);
    const text = slide?.script?.trim() || "";
    const expectedMs = Math.max(
      estimateSpeechMs(text, 5000),
      (slide?.duration_seconds || 0) * 1000,
    );
    const total = detail.slides.length;
    const title = slide?.title?.trim();
    return {
      key: `slide:${slideId}:${text.slice(0, 40)}`,
      text,
      expectedMs,
      fallbackMs: expectedMs + 30_000,
      mode: "slide",
      label: title
        ? `slide ${slide?.slide_number ?? "?"} of ${total}: ${title}`
        : `slide ${slide?.slide_number ?? "?"} of ${total}`,
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
      mode: "stage",
      label: "Q&A answer",
    };
  }
  return null;
}

/** Monotonic rank so polls cannot snap the deck backward after an optimistic advance. */
function sessionProgress(detail: PresentationSessionDetail): number {
  const slide = Math.max(0, detail.session.current_slide_number);
  switch (detail.session.status) {
    case "initializing":
      return 0;
    case "greeting":
      return 10;
    case "paused":
    case "presenting":
      return 20 + slide;
    case "closing":
      return 1000;
    case "qna_waiting":
    case "thinking":
    case "answering":
      return 2000;
    case "completed":
      return 3000;
    default:
      return 0;
  }
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

export function LiveSessionClient({
  sessionId,
  shareToken,
}: {
  sessionId: string;
  shareToken?: string;
}) {
  const { token, business } = useAuth();
  const isShare = Boolean(shareToken);
  const [detail, setDetail] = useState<PresentationSessionDetail | null>(null);
  const [analytics, setAnalytics] = useState<PresentationSessionAnalytics | null>(null);
  const [error, setError] = useState("");
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("idle");
  const [questionDraft, setQuestionDraft] = useState("");
  const [askOpen, setAskOpen] = useState(true);
  const [askBusy, setAskBusy] = useState(false);
  const [listening, setListening] = useState(false);
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
  const pendingSpeakRef = useRef<SpeakPayload | null>(null);
  const advancingRef = useRef(false);
  const advanceGenRef = useRef(0);
  const minProgressRef = useRef(0);
  const poseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetingWaveFiredRef = useRef(false);
  const talkGestureKeyRef = useRef("");
  const spokenRef = useRef("");
  const qnaScrollRef = useRef<HTMLDivElement>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef(0);
  const holdingMicRef = useRef(false);
  const finishingMicRef = useRef(false);
  const [transcribing, setTranscribing] = useState(false);

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
    minProgressRef.current = 0;
    clearPoseTimer();
    setAvatarMode("idle");
    setMouthOpen(0);
  }, [sessionId, clearPoseTimer]);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if ((!isShare && (!token || !business)) || loadInFlight.current) return;
    // Avoid poll overwriting an optimistic slide advance mid-handoff.
    if (advancingRef.current && !opts?.force) return;
    loadInFlight.current = true;
    const gen = advanceGenRef.current;
    try {
      const next = shareToken
        ? await api.getSharedPresentationSession(shareToken, sessionId)
        : await api.getPresentationSession(token!, business!.id, sessionId);
      if (gen !== advanceGenRef.current && !opts?.force) return;
      const progress = sessionProgress(next);
      // A lagged / timed-out finish_stage must not rewind the visible slide.
      if (progress < minProgressRef.current) return;
      minProgressRef.current = Math.max(minProgressRef.current, progress);
      setDetail(next);
      setError("");
      if (next.session.status === "completed" || next.session.status === "qna_waiting") {
        setAnalytics(
          shareToken
            ? await api.getSharedPresentationSessionAnalytics(shareToken, sessionId)
            : await api.getPresentationSessionAnalytics(token!, business!.id, sessionId),
        );
      }
    } finally {
      loadInFlight.current = false;
    }
  }, [business, isShare, sessionId, shareToken, token]);

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
  const isQnaStage =
    Boolean(detail?.session.enable_qna) &&
    (stage === "qna_waiting" || stage === "thinking" || stage === "answering");

  const finishStage = useCallback(() => {
    if ((!isShare && (!token || !business)) || advancingRef.current) return;
    advancingRef.current = true;
    advanceGenRef.current += 1;
    const gen = advanceGenRef.current;

    // Flip local stage immediately so the next narration can start without an API gap.
    let expectedProgress = minProgressRef.current;
    setDetail((prev) => {
      if (!prev) return prev;
      const next = optimisticAdvance(prev) ?? prev;
      expectedProgress = sessionProgress(next);
      minProgressRef.current = Math.max(minProgressRef.current, expectedProgress);
      return next;
    });

    void (async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let lastError: unknown;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (gen !== advanceGenRef.current) return;
        try {
          if (shareToken) {
            await api.controlSharedPresentationSession(shareToken, sessionId, "finish_stage");
          } else {
            await api.controlPresentationSession(token!, business!.id, sessionId, "finish_stage");
          }
          const synced = shareToken
            ? await api.getSharedPresentationSession(shareToken, sessionId)
            : await api.getPresentationSession(token!, business!.id, sessionId);
          if (gen !== advanceGenRef.current) return;
          const progress = sessionProgress(synced);
          if (progress >= expectedProgress) {
            minProgressRef.current = Math.max(minProgressRef.current, progress);
            setDetail(synced);
            setError("");
            if (
              synced.session.status === "completed" ||
              synced.session.status === "qna_waiting"
            ) {
              setAnalytics(
                shareToken
                  ? await api.getSharedPresentationSessionAnalytics(shareToken, sessionId)
                  : await api.getPresentationSessionAnalytics(token!, business!.id, sessionId),
              );
            }
            return;
          }
          lastError = new Error("Advance not confirmed");
        } catch (err) {
          lastError = err;
          try {
            const synced = shareToken
              ? await api.getSharedPresentationSession(shareToken, sessionId)
              : await api.getPresentationSession(token!, business!.id, sessionId);
            if (gen !== advanceGenRef.current) return;
            if (sessionProgress(synced) >= expectedProgress) {
              minProgressRef.current = Math.max(minProgressRef.current, sessionProgress(synced));
              setDetail(synced);
              setError("");
              return;
            }
          } catch {
            // GET also failed — retrying finish_stage could skip a slide. Stop.
            break;
          }
        }
        await sleep(700 * (attempt + 1));
      }

      if (gen === advanceGenRef.current) {
        setError(
          lastError instanceof Error
            ? lastError.message
            : "Could not save slide advance — keeping this slide on screen",
        );
      }
    })().finally(() => {
      if (gen === advanceGenRef.current) advancingRef.current = false;
    });
  }, [business, isShare, sessionId, shareToken, token]);

  finishStageRef.current = finishStage;

  useEffect(() => {
    if (isQnaStage) setAskOpen(true);
  }, [isQnaStage]);

  useEffect(() => {
    const el = qnaScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail?.questions, questionDraft, listening, stage]);

  const releaseMic = useCallback(() => {
    holdingMicRef.current = false;
    setListening(false);
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {
      // already stopped
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopMediaStream(micStreamRef.current);
    micStreamRef.current = null;
  }, []);

  const stopListening = useCallback((opts?: { skipSubmit?: boolean }) => {
    void opts;
    releaseMic();
  }, [releaseMic]);

  const submitAudienceQuestion = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? questionDraft).trim();
      if ((!isShare && (!token || !business)) || !text || askBusy) return;
      releaseMic();
      setAskBusy(true);
      setError("");
      try {
        await playerRef.current?.unlock();
        if (shareToken) {
          await api.askSharedPresentationQuestion(shareToken, sessionId, text);
        } else {
          await api.askPresentationQuestion(token!, business!.id, sessionId, text);
        }
        setQuestionDraft("");
        spokenRef.current = "";
        await load({ force: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send the question");
      } finally {
        setAskBusy(false);
      }
    },
    [askBusy, business, isShare, load, questionDraft, releaseMic, sessionId, shareToken, token],
  );

  const startListening = useCallback(() => {
    if (askBusy || transcribing || listening) return;
    if (stage === "thinking" || stage === "answering") return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(audienceSpeechErrorMessage("insecure") ?? "");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Voice input isn't available in this browser. Type your question instead.");
      return;
    }

    holdingMicRef.current = true;
    finishingMicRef.current = false;
    spokenRef.current = "";
    chunksRef.current = [];
    setQuestionDraft("");
    setError("");
    setListening(true);

    void (async () => {
      try {
        const stream = await requestAudienceMicrophone();
        if (!holdingMicRef.current) {
          stopMediaStream(stream);
          return;
        }
        micStreamRef.current = stream;
        const mime = pickRecorderMimeType();
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorderRef.current = recorder;
        recordStartedAtRef.current = Date.now();
        recorder.start(200);
      } catch (err) {
        holdingMicRef.current = false;
        setListening(false);
        const code = (err as Error & { code?: string }).code;
        setError(
          audienceSpeechErrorMessage(code === "insecure" ? "insecure" : "not-allowed") ??
            "Allow the microphone to ask by voice.",
        );
      }
    })();
  }, [askBusy, listening, stage, transcribing]);

  const finishListening = useCallback(() => {
    if (finishingMicRef.current) return;
    if (!holdingMicRef.current && !recorderRef.current) return;
    finishingMicRef.current = true;
    holdingMicRef.current = false;
    setListening(false);
    const recorder = recorderRef.current;
    const elapsed = Date.now() - recordStartedAtRef.current;
    const mimeType = recorder?.mimeType || pickRecorderMimeType() || "audio/webm";

    const submitRecording = async (blob: Blob) => {
      stopMediaStream(micStreamRef.current);
      micStreamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      finishingMicRef.current = false;
      if (elapsed < 280 || blob.size < 250) {
        setError("Hold the orange mic, speak, then release.");
        return;
      }
      if ((!isShare && (!token || !business)) || askBusy) return;
      setTranscribing(true);
      setError("");
      try {
        const audio_base64 = await blobToBase64(blob);
        const result = shareToken
          ? await api.transcribeSharedPresentationQuestion(shareToken, sessionId, {
              audio_base64,
              mime_type: mimeType,
            })
          : await api.transcribePresentationQuestion(token!, business!.id, sessionId, {
              audio_base64,
              mime_type: mimeType,
            });
        const text = result.text.trim();
        if (!text) {
          setError("Didn't catch that — hold the orange mic and speak.");
          return;
        }
        setQuestionDraft(text);
        spokenRef.current = text;
        await submitAudienceQuestion(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not hear the question");
      } finally {
        finishingMicRef.current = false;
        setTranscribing(false);
      }
    };

    if (!recorder || recorder.state === "inactive") {
      if (chunksRef.current.length === 0) {
        finishingMicRef.current = false;
        stopMediaStream(micStreamRef.current);
        micStreamRef.current = null;
        return;
      }
      const leftover = new Blob(chunksRef.current, { type: mimeType });
      void submitRecording(leftover);
      return;
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      void submitRecording(blob);
    };
    try {
      recorder.stop();
    } catch {
      void submitRecording(new Blob(chunksRef.current, { type: mimeType }));
    }
  }, [askBusy, business, isShare, sessionId, shareToken, submitAudienceQuestion, token]);

  const endPresentation = useCallback(async () => {
    if ((!isShare && (!token || !business)) || askBusy) return;
    setAskBusy(true);
    setError("");
    try {
      if (shareToken) {
        await api.controlSharedPresentationSession(shareToken, sessionId, "end");
      } else {
        await api.controlPresentationSession(token!, business!.id, sessionId, "end");
      }
      await load({ force: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end the presentation");
    } finally {
      setAskBusy(false);
    }
  }, [askBusy, business, isShare, load, sessionId, shareToken, token]);

  useEffect(() => {
    if (!isQnaStage || stage === "thinking" || stage === "answering") {
      stopListening({ skipSubmit: true });
    }
  }, [isQnaStage, stage, stopListening]);

  useEffect(() => {
    return () => stopListening({ skipSubmit: true });
  }, [stopListening]);

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

    ws.send(
      JSON.stringify({
        type: "speak",
        text: payload.text,
        mode: payload.mode,
        label: payload.label,
      }),
    );
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
    // Paraphrase is usually much shorter than the written script. Only continue
    // when audio is clearly truncated (glitch / premature turn_complete).
    const minCoverageMs = Math.min(4_000, Math.max(2_000, Math.round(expectedMs * 0.12)));

    if (
      reason === "turn_complete" &&
      !continuedOnceRef.current &&
      pending?.text.trim() &&
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
            mode: "continue",
            label: pending.label,
            text: pending.text,
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
    if (!detail || detail.session.status === "completed") return;
    if (!isShare && (!token || !business)) return;
    if (wsRef.current) return;

    const ws = new WebSocket(
      shareToken
        ? buildPresenterWsUrl(shareToken, detail.session.business_id, sessionId, { share: true })
        : buildPresenterWsUrl(token!, business!.id, sessionId),
    );
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
  }, [token, business?.id, isShare, sessionId, shareToken, Boolean(detail)]);

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
    !isStageFocus &&
    !isQnaStage;
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
          <Link href={adminPath(business?.slug ?? "", `/presentations/${session.presentation_id}`)}>Close session</Link>
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
                  shareToken
                    ? api.sharedPresentationPptxUrl(shareToken)
                    : token && business
                      ? api.presentationPptxUrl(business.id, detail.session.presentation_id)
                      : null
                }
                authToken={shareToken ? null : token}
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

            <div className="pointer-events-none absolute right-0 bottom-0 z-50 h-[40vh] w-[28vh] min-h-[240px] min-w-[170px] max-h-[380px] max-w-[260px]">
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

        {isQnaStage ? (
          <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100">
            <div className="pointer-events-none absolute inset-0 overflow-visible">
              <AvatarHero
                key={`${PRESENTER_TEMPLATE.id}-qna`}
                isTalking={isTalking}
                mode={presentAvatarMode}
                mouthOpen={mouthOpen}
                modelPath={PRESENTER_TEMPLATE.modelPath}
                assistantName={PRESENTER_TEMPLATE.assistant_name}
                framing="bust"
                frameClassName={HERO_FRAME_CLASS}
                performanceMode="lite"
                pauseWhenHidden
              />
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[38%]"
              aria-hidden
              style={{
                background:
                  "linear-gradient(to top, rgb(241 245 249) 0%, rgba(241,245,249,0.82) 42%, transparent 100%)",
              }}
            />

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

            <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[12%] z-30 flex items-end justify-start px-4 pb-6 sm:px-6 sm:pb-8">
              <div className="pointer-events-auto flex max-h-full min-h-0 w-72 max-w-[calc(100vw-2rem)] flex-col">
                {askOpen ? (
                  <div className="flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm">
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Conversation
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          {listening
                            ? "Release to send"
                            : transcribing
                              ? "Hearing you…"
                              : askBusy && stage === "qna_waiting"
                                ? "Sending…"
                                : stage === "thinking"
                                  ? "Finding an answer…"
                                  : stage === "answering"
                                    ? "Answering…"
                                    : "Hold to talk, or type"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          className="text-xs text-slate-400 hover:text-slate-700"
                          onClick={() => {
                            stopListening({ skipSubmit: true });
                            setAskOpen(false);
                          }}
                        >
                          Hide
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
                          disabled={askBusy}
                          onClick={() => void endPresentation()}
                        >
                          End
                        </button>
                      </div>
                    </div>

                    <div
                      ref={qnaScrollRef}
                      className="flex min-h-[8rem] flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
                    >
                      {detail.questions.length === 0 && !listening && !questionDraft.trim() ? (
                        <p className="px-1 text-sm leading-relaxed text-slate-600">
                          Hold the orange mic to speak, or type a question.
                        </p>
                      ) : (
                        <>
                          {detail.questions.map((q) => (
                            <div key={q.id} className="flex flex-col gap-2">
                              <div className="flex flex-row-reverse items-end gap-2">
                                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-orange-500 px-3.5 py-2 text-sm leading-relaxed text-white">
                                  {q.question}
                                </div>
                              </div>
                              {q.answer ? (
                                <div className="flex items-end gap-2">
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-500">
                                    AI
                                  </div>
                                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-sm leading-relaxed text-slate-900">
                                    {q.answer}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {listening || (questionDraft.trim() && !askBusy && stage === "qna_waiting") ? (
                            <div className="flex flex-row-reverse items-end gap-2">
                              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-orange-400/90 px-3.5 py-2 text-sm leading-relaxed text-white">
                                {questionDraft.trim() || "Listening…"}
                              </div>
                            </div>
                          ) : null}
                          {stage === "thinking" || (askBusy && stage === "qna_waiting") ? (
                            <div className="flex items-end gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-500">
                                AI
                              </div>
                              <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-sm text-slate-500">
                                {askBusy && stage === "qna_waiting" ? "Sending…" : "Finding an answer…"}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>

                    {error && isQnaStage ? (
                      <p className="shrink-0 px-4 pb-1 text-xs text-red-600">{error}</p>
                    ) : null}

                    <form
                      className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-3 py-2.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submitAudienceQuestion();
                      }}
                    >
                      <div className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
                        {!askBusy && !transcribing && !listening && stage === "qna_waiting" ? (
                          <>
                            <span className="mic-hold-pulse" aria-hidden />
                            <span className="mic-hold-pulse mic-hold-pulse-delay" aria-hidden />
                          </>
                        ) : null}
                        <button
                          type="button"
                          aria-label={listening ? "Release to stop talking" : "Hold to talk"}
                          aria-pressed={listening}
                          disabled={askBusy || transcribing || stage === "thinking" || stage === "answering"}
                          onMouseDown={() => startListening()}
                          onMouseUp={() => finishListening()}
                          onMouseLeave={() => {
                            if (recorderRef.current) finishListening();
                          }}
                          onTouchStart={(event) => {
                            event.preventDefault();
                            startListening();
                          }}
                          onTouchEnd={(event) => {
                            event.preventDefault();
                            finishListening();
                          }}
                          className={`relative z-10 inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition-opacity disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-60 ${
                            listening ? "opacity-90" : "hover:opacity-90"
                          }`}
                          style={
                            askBusy || transcribing || stage === "thinking" || stage === "answering"
                              ? undefined
                              : {
                                  background: "rgb(249, 115, 22)",
                                  boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
                                }
                          }
                        >
                          <MicrophoneIcon className="h-5 w-5" />
                        </button>
                      </div>
                      <input
                        value={questionDraft}
                        onChange={(e) => setQuestionDraft(e.target.value)}
                        placeholder={
                          listening
                            ? "Release to send…"
                            : transcribing
                              ? "Hearing you…"
                              : "Type a message…"
                        }
                        disabled={askBusy || listening || transcribing || stage === "thinking"}
                        className="h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
                      />
                      <button
                        type="submit"
                        aria-label="Send question"
                        disabled={askBusy || listening || transcribing || stage === "thinking" || !questionDraft.trim()}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <PaperAirplaneIcon className="h-5 w-5" />
                      </button>
                    </form>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm font-medium text-slate-800 shadow-lg backdrop-blur-sm"
                    onClick={() => setAskOpen(true)}
                  >
                    <MicrophoneIcon className="h-4 w-4 text-orange-500" />
                    Ask a question
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
