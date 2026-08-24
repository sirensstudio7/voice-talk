"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GREETING_WAVE_CLIP,
  THUMBS_UP_CLIP,
  TALKING_HAND_GESTURE_CLIP,
  TALKING_HAND_GESTURE_CHANCE,
} from "@voicetalk/avatar";

import { VoiceAudioEngine } from "@/lib/voice-audio";
import { mergeTranscriptChunk, stripVerbalizedToolCalls, isStandaloneCustomerNameAsk } from "@voicetalk/shared";
import {
  OrderSyncAction,
  registerOrderSyncHandler,
  unregisterOrderSyncHandler,
} from "@/lib/order-sync";
import { useBusinessSlug } from "@/context/business-context";
import { useSessionStore } from "@/store/session-store";
import { OrderState, TranscriptMessage } from "@/types/voice";

function buildWsUrl(businessSlug: string, language: string): string {
  let base = process.env.NEXT_PUBLIC_WS_URL;
  if (!base && process.env.NEXT_PUBLIC_API_URL) {
    const api = new URL(process.env.NEXT_PUBLIC_API_URL);
    api.protocol = api.protocol === "https:" ? "wss:" : "ws:";
    api.pathname = "/ws/session";
    api.search = "";
    base = api.toString();
  }
  if (!base) {
    base = "ws://localhost:8000/ws/session";
  }
  const url = new URL(base);
  url.searchParams.set("business", businessSlug);
  url.searchParams.set("language", language);
  return url.toString();
}

function sendControl(ws: WebSocket, type: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type }));
  }
}

/** Assistant said "Ok" / "Okay" / "Baik" → maybe play thumbs-up gesture. */
const ACKNOWLEDGE_WORD_RE = /\b(?:ok(?:ay)?|baik)\b/i;
/** Chance to show thumbs-up when an acknowledge word appears (keeps it natural). */
const THUMBS_UP_CHANCE = 0.35;

function waitForSocketOpen(ws: WebSocket, timeoutMs = 10000): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Connection timed out. Run `npm run api:restart` in the project root, then try again.",
        ),
      );
    }, timeoutMs);

    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to connect to voice server."));
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Connection closed before it was ready."));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
  });
}

function isSessionReadyForGreeting(): boolean {
  const status = useSessionStore.getState().status;
  return status === "connected" || status === "idle" || status === "connecting";
}

function waitForSessionReady(
  isCurrent: () => boolean,
  timeoutMs = 15000,
): Promise<boolean> {
  if (isSessionReadyForGreeting()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (!isCurrent()) {
        window.clearInterval(timer);
        resolve(false);
        return;
      }

      if (isSessionReadyForGreeting()) {
        window.clearInterval(timer);
        resolve(true);
        return;
      }
      if (useSessionStore.getState().status === "error") {
        window.clearInterval(timer);
        resolve(false);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 40);
  });
}

function isEmbeddedPreviewBrowser(): boolean {
  const ua = navigator.userAgent;
  return ua.includes("Electron") || ua.includes("Cursor");
}

function micErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      if (isEmbeddedPreviewBrowser()) {
        return "Cursor's built-in browser cannot grant microphone access. Open http://localhost:6670 in Chrome or Safari instead.";
      }
      return "Microphone blocked. Allow mic access in your browser settings, then try again.";
    }
    if (error.name === "NotFoundError") {
      return "No microphone found. Connect a mic and try again.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Microphone access failed.";
}

function computeRevealLength(fullText: string, progress: number): number {
  if (progress >= 1) return fullText.length;
  if (progress <= 0) return 0;

  const target = Math.ceil(fullText.length * progress);
  if (target >= fullText.length) return fullText.length;

  const slice = fullText.slice(0, target);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > 0 ? lastSpace : target;
}

type ConnectOptions = {
  preserveSession?: boolean;
  requestGreeting?: boolean;
  source?: "vision";
  continuousListen?: boolean;
  /** Connect voice + Gemini during dwell time; no greeting until triggered. */
  prefetch?: boolean;
};

const CHAT_FINISH_GRACE_MS = 400;
const CHAT_RESET_TIMEOUT_MS = 15_000;
const CONTINUOUS_SILENCE_MS = 2000;
const CONTINUOUS_SPEECH_RMS = 0.012;

function chunkRms(chunk: ArrayBuffer): number {
  const view = new Int16Array(chunk);
  if (view.length === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < view.length; i++) {
    const normalized = view[i] / 32768;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / view.length);
}

export function useVoiceSession() {
  const businessSlug = useBusinessSlug();
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<VoiceAudioEngine | null>(null);
  const sentAudioRef = useRef(false);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const conversationCompletedRef = useRef(false);
  const preserveSessionRef = useRef(false);
  const preserveTranscriptRef = useRef(false);
  const pendingGreetingRef = useRef(false);
  const pendingGreetingSourceRef = useRef<"vision" | "manual">("manual");
  const continuousListenRef = useRef(false);
  const continuousListenActiveRef = useRef(false);
  const continuousCaptureRunningRef = useRef(false);
  const utteranceOpenRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const continuousSilenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefetchModeRef = useRef(false);
  const [sessionWarm, setSessionWarm] = useState(false);
  const [micPrimed, setMicPrimed] = useState(false);
  const [continuousListenActive, setContinuousListenActive] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const greetingDispatchedRef = useRef(false);
  const visionGreetingPendingRef = useRef(false);
  const [visionGreetingPending, setVisionGreetingPending] = useState(false);
  /** Avatar wave pose — armed for ~1s when greeting audio starts. */
  const greetingPoseActiveRef = useRef(false);
  const [greetingPoseActive, setGreetingPoseActive] = useState(false);
  /** True after session.greeting until the first assistant audio starts the wave. */
  const greetingAwaitingSpeechRef = useRef(false);
  const greetingPoseEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Avatar thumbs-up — armed when assistant says Ok / Baik. */
  const thumbsUpPoseActiveRef = useRef(false);
  const [thumbsUpPoseActive, setThumbsUpPoseActive] = useState(false);
  const thumbsUpPoseEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** One thumbs-up per assistant turn (avoid re-fire on streaming chunks). */
  const thumbsUpFiredForTurnRef = useRef(false);
  /** Avatar talking hand gesture — random while assistant speaks. */
  const talkingHandPoseActiveRef = useRef(false);
  const [talkingHandPoseActive, setTalkingHandPoseActive] = useState(false);
  const talkingHandPoseEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** One talking-hand roll per assistant speaking turn. */
  const talkingHandFiredForTurnRef = useRef(false);
  const setVisionGreetingPendingBoth = useCallback((pending: boolean) => {
    visionGreetingPendingRef.current = pending;
    setVisionGreetingPending(pending);
  }, []);
  const clearGreetingPoseTimer = useCallback(() => {
    if (greetingPoseEndTimerRef.current) {
      clearTimeout(greetingPoseEndTimerRef.current);
      greetingPoseEndTimerRef.current = null;
    }
  }, []);
  const clearThumbsUpPoseTimer = useCallback(() => {
    if (thumbsUpPoseEndTimerRef.current) {
      clearTimeout(thumbsUpPoseEndTimerRef.current);
      thumbsUpPoseEndTimerRef.current = null;
    }
  }, []);
  const clearTalkingHandPoseTimer = useCallback(() => {
    if (talkingHandPoseEndTimerRef.current) {
      clearTimeout(talkingHandPoseEndTimerRef.current);
      talkingHandPoseEndTimerRef.current = null;
    }
  }, []);
  const setGreetingPoseActiveBoth = useCallback(
    (active: boolean) => {
      greetingPoseActiveRef.current = active;
      setGreetingPoseActive(active);
      clearGreetingPoseTimer();
    },
    [clearGreetingPoseTimer],
  );
  const setThumbsUpPoseActiveBoth = useCallback(
    (active: boolean) => {
      thumbsUpPoseActiveRef.current = active;
      setThumbsUpPoseActive(active);
      clearThumbsUpPoseTimer();
    },
    [clearThumbsUpPoseTimer],
  );
  const setTalkingHandPoseActiveBoth = useCallback(
    (active: boolean) => {
      talkingHandPoseActiveRef.current = active;
      setTalkingHandPoseActive(active);
      clearTalkingHandPoseTimer();
    },
    [clearTalkingHandPoseTimer],
  );
  /** Start a short hello wave when greeting audio begins (matches clip period). */
  const triggerGreetingWave = useCallback(() => {
    if (greetingPoseActiveRef.current) return;
    greetingAwaitingSpeechRef.current = false;
    setThumbsUpPoseActiveBoth(false);
    setTalkingHandPoseActiveBoth(false);
    setGreetingPoseActiveBoth(true);
    greetingPoseEndTimerRef.current = setTimeout(() => {
      greetingPoseEndTimerRef.current = null;
      setGreetingPoseActiveBoth(false);
    }, Math.round(GREETING_WAVE_CLIP.period * 1000));
  }, [setGreetingPoseActiveBoth, setTalkingHandPoseActiveBoth, setThumbsUpPoseActiveBoth]);
  /** Thumbs-up when the assistant acknowledges (Ok / Baik). */
  const triggerThumbsUp = useCallback(() => {
    if (thumbsUpPoseActiveRef.current) return;
    if (greetingPoseActiveRef.current || greetingAwaitingSpeechRef.current) return;
    setGreetingPoseActiveBoth(false);
    setTalkingHandPoseActiveBoth(false);
    setThumbsUpPoseActiveBoth(true);
    thumbsUpPoseEndTimerRef.current = setTimeout(() => {
      thumbsUpPoseEndTimerRef.current = null;
      setThumbsUpPoseActiveBoth(false);
    }, Math.round(THUMBS_UP_CLIP.period * 1000));
  }, [setGreetingPoseActiveBoth, setTalkingHandPoseActiveBoth, setThumbsUpPoseActiveBoth]);
  /** Occasional talking hand gesture while the AI is speaking. */
  const triggerTalkingHandGesture = useCallback(() => {
    if (talkingHandPoseActiveRef.current) return;
    if (
      greetingPoseActiveRef.current ||
      greetingAwaitingSpeechRef.current ||
      thumbsUpPoseActiveRef.current
    ) {
      return;
    }
    setGreetingPoseActiveBoth(false);
    setThumbsUpPoseActiveBoth(false);
    setTalkingHandPoseActiveBoth(true);
    talkingHandPoseEndTimerRef.current = setTimeout(() => {
      talkingHandPoseEndTimerRef.current = null;
      setTalkingHandPoseActiveBoth(false);
    }, Math.round(TALKING_HAND_GESTURE_CLIP.period * 1000));
  }, [setGreetingPoseActiveBoth, setTalkingHandPoseActiveBoth, setThumbsUpPoseActiveBoth]);
  const maybeTriggerTalkingHandOnSpeech = useCallback(() => {
    if (talkingHandFiredForTurnRef.current) return;
    talkingHandFiredForTurnRef.current = true;
    if (Math.random() >= TALKING_HAND_GESTURE_CHANCE) return;
    triggerTalkingHandGesture();
  }, [triggerTalkingHandGesture]);
  const maybeTriggerThumbsUpFromText = useCallback(
    (text: string) => {
      if (thumbsUpFiredForTurnRef.current) return;
      if (!ACKNOWLEDGE_WORD_RE.test(text)) return;
      // One roll per turn so streaming chunks don't re-trigger.
      thumbsUpFiredForTurnRef.current = true;
      if (Math.random() >= THUMBS_UP_CHANCE) return;
      triggerThumbsUp();
    },
    [triggerThumbsUp],
  );
  const connectGenerationRef = useRef(0);
  const assistantFullTextRef = useRef("");
  const assistantAudioStartedRef = useRef(false);
  const visionGreetingTextRef = useRef(false);
  const serverSessionReadyRef = useRef(false);
  const serverSessionReadyResolveRef = useRef<(() => void) | null>(null);
  const revealLoopRef = useRef<number | null>(null);
  const chatResetPendingRef = useRef(false);
  const chatResetGenerationRef = useRef(0);
  const {
    status,
    isTalking,
    freshOrderRequest,
    paymentCompleteRequest,
    setStatus,
    setTalking,
    setError,
    addTranscript,
    setAssistantDisplayText,
    markAssistantTurnBoundary,
    setOrder,
    revealPaymentAfterNamePrompt,
    setPhotoSouvenirConsent,
    reset,
    faqMode,
    setConversationPhase,
    clearTranscript,
    startNewConversation,
    voicePreset,
  } = useSessionStore();

  const ensureAudioEngine = useCallback((): VoiceAudioEngine => {
    if (!audioRef.current) {
      audioRef.current = new VoiceAudioEngine();
    }
    audioRef.current.setVoicePreset(voicePreset);
    return audioRef.current;
  }, [voicePreset]);

  useEffect(() => {
    audioRef.current?.setVoicePreset(voicePreset);
  }, [voicePreset]);

  const resetAssistantSync = useCallback(() => {
    assistantFullTextRef.current = "";
    assistantAudioStartedRef.current = false;
    visionGreetingTextRef.current = false;
    thumbsUpFiredForTurnRef.current = false;
    talkingHandFiredForTurnRef.current = false;
    if (revealLoopRef.current !== null) {
      cancelAnimationFrame(revealLoopRef.current);
      revealLoopRef.current = null;
    }
  }, []);

  const runRevealTick = useCallback(() => {
    const fullText = assistantFullTextRef.current;
    if (!fullText) {
      revealLoopRef.current = null;
      return;
    }

    const engine = audioRef.current;
    const hasAudio = engine?.hasActivePlayback() ?? false;
    const progress = engine?.getRevealProgress() ?? 1;

    let visibleText: string;
    if (!assistantAudioStartedRef.current && !hasAudio) {
      visibleText = "";
    } else if (!hasAudio || progress >= 1) {
      visibleText = fullText;
    } else {
      visibleText = fullText.slice(0, computeRevealLength(fullText, progress));
    }

    setAssistantDisplayText(visibleText);

    if (visibleText.length < fullText.length && hasAudio && progress < 1) {
      revealLoopRef.current = requestAnimationFrame(runRevealTick);
    } else {
      if (visibleText.length < fullText.length) {
        setAssistantDisplayText(fullText);
      }
      revealLoopRef.current = null;
    }
  }, [setAssistantDisplayText]);

  const startRevealLoop = useCallback(() => {
    if (revealLoopRef.current !== null) return;
    revealLoopRef.current = requestAnimationFrame(runRevealTick);
  }, [runRevealTick]);

  const bufferAssistantTranscript = useCallback(
    (incoming: string) => {
      const { transcript, forceNewAssistantBubble } = useSessionStore.getState();
      const lastRole = transcript.at(-1)?.role;
      if (lastRole !== "assistant" || forceNewAssistantBubble) {
        assistantFullTextRef.current = incoming;
      } else {
        assistantFullTextRef.current = mergeTranscriptChunk(
          assistantFullTextRef.current,
          incoming,
        );
      }
      maybeTriggerThumbsUpFromText(assistantFullTextRef.current);
      startRevealLoop();
    },
    [maybeTriggerThumbsUpFromText, startRevealLoop],
  );

  const deferChatReset = useCallback(() => {
    if (chatResetPendingRef.current) return;
    chatResetPendingRef.current = true;
    const generation = ++chatResetGenerationRef.current;

    const hasAudio = audioRef.current?.hasActivePlayback() ?? false;
    const fullText = assistantFullTextRef.current;

    if (fullText && !hasAudio) {
      setAssistantDisplayText(fullText);
    } else if (fullText && hasAudio && revealLoopRef.current === null) {
      startRevealLoop();
    }

    const waitForChatFinish = (): Promise<void> =>
      new Promise((resolve) => {
        const startedAt = Date.now();

        const tick = () => {
          if (generation !== chatResetGenerationRef.current) {
            resolve();
            return;
          }

          const activeAudio = audioRef.current?.hasActivePlayback() ?? false;
          const revealing = revealLoopRef.current !== null;
          const timedOut = Date.now() - startedAt >= CHAT_RESET_TIMEOUT_MS;

          if (timedOut || (!activeAudio && !revealing)) {
            resolve();
            return;
          }

          requestAnimationFrame(tick);
        };

        tick();
      });

    void (async () => {
      await waitForChatFinish();
      if (generation !== chatResetGenerationRef.current) return;

      await new Promise((resolve) => setTimeout(resolve, CHAT_FINISH_GRACE_MS));
      if (generation !== chatResetGenerationRef.current) return;

      resetAssistantSync();
      startNewConversation();
      chatResetPendingRef.current = false;
    })();
  }, [
    resetAssistantSync,
    setAssistantDisplayText,
    startNewConversation,
    startRevealLoop,
  ]);

  const resetServerSessionReady = useCallback(() => {
    serverSessionReadyRef.current = false;
    serverSessionReadyResolveRef.current = null;
  }, []);

  const markServerSessionReady = useCallback(() => {
    if (serverSessionReadyRef.current) return;
    serverSessionReadyRef.current = true;
    serverSessionReadyResolveRef.current?.();
    serverSessionReadyResolveRef.current = null;
  }, []);

  const waitForServerSessionReady = useCallback((timeoutMs = 15000): Promise<boolean> => {
    if (serverSessionReadyRef.current) return Promise.resolve(true);

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        serverSessionReadyResolveRef.current = null;
        resolve(false);
      }, timeoutMs);

      serverSessionReadyResolveRef.current = () => {
        window.clearTimeout(timeout);
        resolve(true);
      };
    });
  }, []);

  const teardownSocket = useCallback(() => {
    unregisterOrderSyncHandler();
    greetingDispatchedRef.current = false;
    setVisionGreetingPendingBoth(false);
    setSessionWarm(false);
    // Do NOT clear greetingPoseActive here — connect() tears down the old
    // socket right after arming the wave for Order Now / vision greetings.
    resetServerSessionReady();
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, [resetServerSessionReady, setVisionGreetingPendingBoth]);

  const clearContinuousSilenceTimer = useCallback(() => {
    if (continuousSilenceTimerRef.current) {
      clearInterval(continuousSilenceTimerRef.current);
      continuousSilenceTimerRef.current = null;
    }
  }, []);

  const signalUtteranceEnd = useCallback(() => {
    if (!utteranceOpenRef.current) return;

    utteranceOpenRef.current = false;
    clearContinuousSilenceTimer();
    setTalking(false);

    if (wsRef.current?.readyState === WebSocket.OPEN && sentAudioRef.current) {
      sendControl(wsRef.current, "audio.activity_end");
      sendControl(wsRef.current, "audio.stream_end");
    }
    sentAudioRef.current = false;
  }, [clearContinuousSilenceTimer, setTalking]);

  const signalUtteranceStartRef = useRef<() => void>(() => undefined);

  const signalUtteranceStart = useCallback(() => {
    if (!continuousListenRef.current) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (utteranceOpenRef.current) return;
    if (audioRef.current?.hasActivePlayback()) return;

    utteranceOpenRef.current = true;
    sentAudioRef.current = false;
    lastSpeechAtRef.current = Date.now();
    setTalking(true);
    setConversationPhase("active");
    sendControl(wsRef.current, "audio.activity_start");

    clearContinuousSilenceTimer();
    continuousSilenceTimerRef.current = setInterval(() => {
      if (!utteranceOpenRef.current || !continuousListenRef.current) return;
      if (!sentAudioRef.current) return;
      if (Date.now() - lastSpeechAtRef.current >= CONTINUOUS_SILENCE_MS) {
        signalUtteranceEnd();
      }
    }, 150);
  }, [clearContinuousSilenceTimer, setConversationPhase, setTalking, signalUtteranceEnd]);

  signalUtteranceStartRef.current = signalUtteranceStart;

  const processContinuousChunk = useCallback(
    (chunk: ArrayBuffer) => {
      if (!continuousListenRef.current) return;
      if (visionGreetingPendingRef.current) return;

      const suppressUplink = audioRef.current?.hasActivePlayback() ?? false;

      if (utteranceOpenRef.current) {
        if (!suppressUplink) {
          if (chunkRms(chunk) > CONTINUOUS_SPEECH_RMS) {
            lastSpeechAtRef.current = Date.now();
          }
          sentAudioRef.current = true;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(chunk);
          }
        }
        return;
      }

      if (suppressUplink) return;

      if (chunkRms(chunk) > CONTINUOUS_SPEECH_RMS) {
        signalUtteranceStartRef.current();
        if (utteranceOpenRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
          sentAudioRef.current = true;
          lastSpeechAtRef.current = Date.now();
          wsRef.current.send(chunk);
        }
      }
    },
    [],
  );

  const signalReadyForUserTurn = useCallback(() => {
    if (!continuousListenRef.current) return;
    utteranceOpenRef.current = false;
    clearContinuousSilenceTimer();
    setTalking(false);
    sentAudioRef.current = false;
  }, [clearContinuousSilenceTimer, setTalking]);

  const teardownContinuousCapture = useCallback(() => {
    continuousListenRef.current = false;
    continuousListenActiveRef.current = false;
    continuousCaptureRunningRef.current = false;
    setVisionGreetingPendingBoth(false);
    greetingAwaitingSpeechRef.current = false;
    setGreetingPoseActiveBoth(false);
    setThumbsUpPoseActiveBoth(false);
    setTalkingHandPoseActiveBoth(false);
    setContinuousListenActive(false);
    utteranceOpenRef.current = false;
    clearContinuousSilenceTimer();
    setTalking(false);
    sentAudioRef.current = false;
    audioRef.current?.stopCapture();
  }, [
    clearContinuousSilenceTimer,
    setGreetingPoseActiveBoth,
    setTalkingHandPoseActiveBoth,
    setThumbsUpPoseActiveBoth,
    setTalking,
    setVisionGreetingPendingBoth,
  ]);

  const ensureContinuousCapture = useCallback(async () => {
    if (continuousCaptureRunningRef.current) return;

    const audio = ensureAudioEngine();
    await audio.prepareMicrophone();
    await audio.beginRecording(processContinuousChunk);
    continuousCaptureRunningRef.current = true;
    continuousListenActiveRef.current = true;
    setContinuousListenActive(true);
    setMicPrimed(true);
  }, [ensureAudioEngine, processContinuousChunk]);

  const startContinuousListening = useCallback(async () => {
    continuousListenRef.current = true;
    if (visionGreetingPendingRef.current) {
      return;
    }
    try {
      await ensureContinuousCapture();
    } catch (error) {
      continuousListenRef.current = false;
      continuousListenActiveRef.current = false;
      setContinuousListenActive(false);
      setError(micErrorMessage(error));
    }
  }, [ensureContinuousCapture, setError]);

  const finishVisionGreeting = useCallback(() => {
    if (!visionGreetingPendingRef.current) return;
    setVisionGreetingPendingBoth(false);
    greetingAwaitingSpeechRef.current = false;
    setConversationPhase("active");
    signalReadyForUserTurn();
  }, [setConversationPhase, setVisionGreetingPendingBoth, signalReadyForUserTurn]);

  const openVisionMicrophone = useCallback(async (): Promise<boolean> => {
    if (!continuousListenRef.current) {
      return continuousCaptureRunningRef.current;
    }
    if (continuousCaptureRunningRef.current) {
      return true;
    }

    try {
      await ensureContinuousCapture();
      return true;
    } catch (error) {
      continuousListenRef.current = false;
      continuousListenActiveRef.current = false;
      setContinuousListenActive(false);
      setError(micErrorMessage(error));
      return false;
    }
  }, [ensureContinuousCapture, setError]);

  const activateMicAfterVisionGreeting = useCallback(async (): Promise<boolean> => {
    const opened = await openVisionMicrophone();
    if (!opened) {
      return false;
    }

    if (
      visionGreetingPendingRef.current &&
      !(audioRef.current?.hasActivePlayback() ?? false)
    ) {
      finishVisionGreeting();
    }

    return true;
  }, [finishVisionGreeting, openVisionMicrophone]);

  const stopContinuousListening = useCallback(() => {
    if (utteranceOpenRef.current) {
      signalUtteranceEnd();
    }
    teardownContinuousCapture();
  }, [signalUtteranceEnd, teardownContinuousCapture]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    connectGenerationRef.current += 1;
    setTalking(false);
    utteranceOpenRef.current = false;
    clearContinuousSilenceTimer();
    teardownContinuousCapture();
    connectPromiseRef.current = null;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session.end" }));
    }

    teardownSocket();
    setConversationPhase("wrapping_up");
    setStatus("disconnected");
    deferChatReset();
  }, [
    clearContinuousSilenceTimer,
    deferChatReset,
    setConversationPhase,
    setStatus,
    setTalking,
    teardownSocket,
    teardownContinuousCapture,
  ]);

  const sendGoodbye = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session.goodbye" }));
    } else {
      disconnect();
    }
  }, [disconnect]);

  const dispatchGreeting = useCallback(
    (ws: WebSocket): boolean => {
      if (greetingDispatchedRef.current || !pendingGreetingRef.current) {
        return greetingDispatchedRef.current;
      }
      if (ws.readyState !== WebSocket.OPEN) return false;

      greetingDispatchedRef.current = true;
      pendingGreetingRef.current = false;
      prefetchModeRef.current = false;
      setSessionWarm(false);
      assistantAudioStartedRef.current = false;
      assistantFullTextRef.current = "";
      visionGreetingTextRef.current = false;

      const greetingPayload: Record<string, string> = { type: "session.greeting" };
      if (pendingGreetingSourceRef.current === "vision") {
        greetingPayload.source = "vision";
      }
      ws.send(JSON.stringify(greetingPayload));
      setStatus("connected");
      if (pendingGreetingSourceRef.current === "vision") {
        setConversationPhase("active");
      }
      return true;
    },
    [setConversationPhase, setStatus],
  );

  const flushPendingGreeting = useCallback(async (): Promise<boolean> => {
    let ws = wsRef.current;
    if (ws?.readyState === WebSocket.CONNECTING) {
      try {
        await waitForSocketOpen(ws);
      } catch {
        return false;
      }
      ws = wsRef.current;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    if (greetingDispatchedRef.current || !pendingGreetingRef.current) {
      return greetingDispatchedRef.current;
    }

    const audio = ensureAudioEngine();
    // Unlock only — don't block greeting on worklet fetch.
    await audio.unlockPlayback();

    const serverReady = await waitForServerSessionReady();
    if (!serverReady) {
      return false;
    }

    const dispatched = dispatchGreeting(ws);

    // Do NOT open the mic during the greeting. getUserMedia / permission UI
    // suspends AudioContext on many browsers → silent PCM while chat still works.
    // Vision opens the mic after the greeting finishes; manual uses Hold to talk.

    return dispatched;
  }, [dispatchGreeting, ensureAudioEngine, waitForServerSessionReady]);

  const beginVisionListening = useCallback(async (): Promise<boolean> => {
    continuousListenRef.current = true;
    return openVisionMicrophone();
  }, [openVisionMicrophone]);

  const waitForVisionMicReady = useCallback(async (timeoutMs = 25000): Promise<boolean> => {
    continuousListenRef.current = true;
    const started = Date.now();
    let greetingRetryUsed = false;

    const greetingResponseStarted = () =>
      assistantAudioStartedRef.current || visionGreetingTextRef.current;

    // Open mic as soon as possible — uplink stays muted while visionGreetingPendingRef is set.
    let opened = await openVisionMicrophone();
    if (opened) {
      return true;
    }

    while (Date.now() - started < timeoutMs) {
      if (continuousCaptureRunningRef.current) {
        return true;
      }

      if (
        visionGreetingPendingRef.current &&
        greetingDispatchedRef.current &&
        !greetingRetryUsed &&
        !greetingResponseStarted() &&
        Date.now() - started > 8_000
      ) {
        greetingRetryUsed = true;
        greetingDispatchedRef.current = false;
        pendingGreetingRef.current = true;
        await flushPendingGreeting();
      }

      opened = await openVisionMicrophone();
      if (opened) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return continuousCaptureRunningRef.current;
  }, [flushPendingGreeting, openVisionMicrophone]);

  const connect = useCallback(async (options?: ConnectOptions) => {
    const requestGreeting = options?.requestGreeting ?? false;
    const isVisionGreeting = requestGreeting && options?.source === "vision";
    continuousListenRef.current = Boolean(options?.continuousListen);
    prefetchModeRef.current = Boolean(options?.prefetch) && !requestGreeting;

    // Vision greetings always need a fresh voice session — never reuse a socket that
    // is still OPEN during the post-conversation.complete shutdown grace window.
    if (isVisionGreeting && wsRef.current) {
      intentionalDisconnectRef.current = true;
      connectGenerationRef.current += 1;
      connectPromiseRef.current = null;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "session.end" }));
        } catch {
          // ignore
        }
      }
      teardownSocket();
      intentionalDisconnectRef.current = false;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Already warm — only leave prefetch mode when starting a real greeting.
      if (options?.prefetch && !requestGreeting) {
        setSessionWarm(true);
        return;
      }
      if (requestGreeting) {
        prefetchModeRef.current = false;
        setSessionWarm(false);
        greetingDispatchedRef.current = false;
        pendingGreetingRef.current = true;
        pendingGreetingSourceRef.current = options?.source === "vision" ? "vision" : "manual";
        greetingAwaitingSpeechRef.current = true;
        setVisionGreetingPendingBoth(
          options?.source === "vision" && Boolean(options?.continuousListen),
        );
        await ensureAudioEngine().unlockPlayback();
        await flushPendingGreeting();
      }
      return;
    }
    if (connectPromiseRef.current) {
      if (requestGreeting) {
        greetingDispatchedRef.current = false;
        pendingGreetingRef.current = true;
        pendingGreetingSourceRef.current = options?.source === "vision" ? "vision" : "manual";
        greetingAwaitingSpeechRef.current = true;
        setVisionGreetingPendingBoth(
          options?.source === "vision" && Boolean(options?.continuousListen),
        );
        prefetchModeRef.current = false;
        continuousListenRef.current = Boolean(options?.continuousListen);
      }
      return connectPromiseRef.current.then(async () => {
        await flushPendingGreeting();
      });
    }

    if (
      options?.prefetch &&
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.CONNECTING ||
        wsRef.current.readyState === WebSocket.OPEN)
    ) {
      return Promise.resolve();
    }

    const preserveSession = options?.preserveSession ?? false;
    pendingGreetingRef.current = requestGreeting;
    pendingGreetingSourceRef.current = options?.source === "vision" ? "vision" : "manual";
    greetingAwaitingSpeechRef.current = Boolean(requestGreeting);
    setGreetingPoseActiveBoth(false);
    setThumbsUpPoseActiveBoth(false);
    setTalkingHandPoseActiveBoth(false);
    setVisionGreetingPendingBoth(
      requestGreeting && options?.source === "vision" && Boolean(options?.continuousListen),
    );
    continuousListenActiveRef.current = false;
    utteranceOpenRef.current = false;
    clearContinuousSilenceTimer();
    chatResetGenerationRef.current += 1;
    chatResetPendingRef.current = false;

    const generation = ++connectGenerationRef.current;
    const hasExistingOrder = useSessionStore.getState().order.items.length > 0;
    const shouldPreserveSession = preserveSession || hasExistingOrder;
    const isPrefetch = prefetchModeRef.current;
    if (requestGreeting) {
      greetingDispatchedRef.current = false;
    }

    const promise = (async () => {
      if (shouldPreserveSession) {
        preserveSessionRef.current = true;
      } else {
        preserveSessionRef.current = false;
        reset();
      }
      if (!isPrefetch) {
        setStatus("connecting");
      }
      setError(null);
      sentAudioRef.current = false;
      teardownSocket();
      // Keep awaiting the greeting line after socket teardown — wave starts when AI speaks.
      if (requestGreeting) {
        greetingAwaitingSpeechRef.current = true;
      }
      resetServerSessionReady();

      // Never create AudioContext during background prefetch — that leaves it
      // suspended with no user gesture, and greeting PCM then plays silently.
      if (!isPrefetch) {
        await ensureAudioEngine().unlockPlayback();
      }

      if (generation !== connectGenerationRef.current) return;

      const ws = new WebSocket(
        buildWsUrl(businessSlug, useSessionStore.getState().language),
      );
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      registerOrderSyncHandler((action: OrderSyncAction) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify(action));
      });

      ws.onmessage = (event) => {
        if (generation !== connectGenerationRef.current || wsRef.current !== ws) {
          return;
        }
        const playBinary = (buffer: ArrayBuffer) => {
          assistantAudioStartedRef.current = true;
          setAssistantSpeaking(true);
          if (greetingAwaitingSpeechRef.current) {
            triggerGreetingWave();
          }
          void audioRef.current?.playPcm(buffer);
          startRevealLoop();
        };

        if (event.data instanceof ArrayBuffer) {
          playBinary(event.data);
          return;
        }
        if (typeof Blob !== "undefined" && event.data instanceof Blob) {
          void event.data.arrayBuffer().then(playBinary);
          return;
        }

        const payload = JSON.parse(event.data as string) as {
          type: string;
          text?: string;
          status?: string;
          order?: OrderState;
          error?: string;
          reason?: string;
          consent?: string;
        };

        switch (payload.type) {
          case "session.status":
            if (payload.status === "connected" || payload.status === "reconnecting") {
              markServerSessionReady();
              if (prefetchModeRef.current && !pendingGreetingRef.current) {
                setStatus("idle");
                setSessionWarm(true);
                break;
              }
              setStatus("connected");
              setSessionWarm(false);
              if (faqMode) {
                setConversationPhase("active");
              }
              if (
                pendingGreetingRef.current &&
                payload.status === "connected" &&
                ws.readyState === WebSocket.OPEN
              ) {
                void flushPendingGreeting();
              }
            }
            if (payload.status === "disconnected") setStatus("disconnected");
            break;
          case "transcript.user":
            if (payload.text) {
              resetAssistantSync();
              addTranscript("user", payload.text);
            }
            break;
          case "transcript.assistant":
            if (payload.text) {
              if (visionGreetingPendingRef.current) {
                visionGreetingTextRef.current = true;
              }
              // Fallback: Gemini sometimes streams text before/without PCM.
              // Wave still needs to fire so greeting pose matches the chat line.
              if (greetingAwaitingSpeechRef.current) {
                triggerGreetingWave();
              }
              const cleaned = stripVerbalizedToolCalls(payload.text);
              if (cleaned) bufferAssistantTranscript(cleaned);
            }
            break;
          case "turn_complete":
            if (
              visionGreetingPendingRef.current &&
              greetingDispatchedRef.current &&
              continuousListenRef.current &&
              continuousCaptureRunningRef.current &&
              (assistantAudioStartedRef.current || visionGreetingTextRef.current) &&
              !(audioRef.current?.hasActivePlayback() ?? false)
            ) {
              finishVisionGreeting();
            } else if (
              visionGreetingPendingRef.current &&
              greetingDispatchedRef.current &&
              continuousListenRef.current &&
              !continuousCaptureRunningRef.current &&
              (assistantAudioStartedRef.current || visionGreetingTextRef.current) &&
              !(audioRef.current?.hasActivePlayback() ?? false)
            ) {
              void activateMicAfterVisionGreeting();
            }
            {
              const assistantText = assistantFullTextRef.current.trim();
              const { order, menuCache, photoSouvenirConsent } = useSessionStore.getState();
              const photoOn = Boolean(
                menuCache?.smart_photo_moment?.active && menuCache?.smart_photo_moment?.enabled,
              );
              if (
                assistantText &&
                order.status === "confirmed" &&
                !order.customer_name?.trim() &&
                isStandaloneCustomerNameAsk(assistantText) &&
                (!photoOn || photoSouvenirConsent !== null)
              ) {
                revealPaymentAfterNamePrompt();
              }
            }
            if (continuousListenRef.current && !visionGreetingPendingRef.current) {
              signalReadyForUserTurn();
            }
            // Finalize this assistant turn so the next turn starts a new bubble
            // (prevents stacked goodbye scripts merging into one run-on message).
            if (assistantFullTextRef.current.trim()) {
              setAssistantDisplayText(assistantFullTextRef.current.trim());
            }
            assistantFullTextRef.current = "";
            assistantAudioStartedRef.current = false;
            visionGreetingTextRef.current = false;
            thumbsUpFiredForTurnRef.current = false;
            talkingHandFiredForTurnRef.current = false;
            markAssistantTurnBoundary();
            break;
          case "order.updated":
            if (payload.order) {
              if (preserveSessionRef.current) {
                const currentOrder = useSessionStore.getState().order;
                if (
                  payload.order.items.length === 0 &&
                  currentOrder.items.length > 0
                ) {
                  break;
                }
                preserveSessionRef.current = false;
              }
              setOrder(payload.order, { source: "server" });
            }
            break;
          case "checkout.prompt_payment":
            revealPaymentAfterNamePrompt();
            break;
          case "photo.consent": {
            const consent = String(payload.consent ?? "").toLowerCase();
            if (consent === "yes" || consent === "no") {
              setPhotoSouvenirConsent(consent);
            }
            break;
          }
          case "audio.interrupted":
          case "interrupted":
            audioRef.current?.stopPlayback();
            if (assistantFullTextRef.current) {
              setAssistantDisplayText(assistantFullTextRef.current);
            }
            if (revealLoopRef.current !== null) {
              cancelAnimationFrame(revealLoopRef.current);
              revealLoopRef.current = null;
            }
            if (continuousListenRef.current) {
              signalReadyForUserTurn();
            }
            break;
          case "conversation.complete":
            conversationCompletedRef.current = true;
            setConversationPhase("wrapping_up");
            if (payload.reason === "minutes_exhausted") {
              setError("You've reached your Lore Voice Minute limit.");
            }
            deferChatReset();
            break;
          case "error":
            preserveSessionRef.current = false;
            resetAssistantSync();
            clearTranscript();
            setError(payload.error ?? "Unknown error");
            setStatus("error");
            teardownSocket();
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        if (generation !== connectGenerationRef.current || wsRef.current !== ws) {
          return;
        }
        preserveSessionRef.current = false;
        setError("Unable to connect to voice server.");
        setStatus("error");
      };

      ws.onclose = () => {
        if (generation !== connectGenerationRef.current || wsRef.current !== ws) {
          return;
        }
        preserveSessionRef.current = false;
        setTalking(false);
        if (continuousCaptureRunningRef.current) {
          teardownContinuousCapture();
        } else {
          audioRef.current?.pauseRecording();
        }
        wsRef.current = null;
        greetingDispatchedRef.current = false;
        pendingGreetingRef.current = false;
        setVisionGreetingPendingBoth(false);
        greetingAwaitingSpeechRef.current = false;
        setGreetingPoseActiveBoth(false);
        setThumbsUpPoseActiveBoth(false);
        setTalkingHandPoseActiveBoth(false);
        prefetchModeRef.current = false;
        const { status: currentStatus, faqMode, orderingEnabled, bookingEnabled } =
          useSessionStore.getState();
        if (!preserveTranscriptRef.current && !chatResetPendingRef.current) {
          startNewConversation();
        }
        if (
          !intentionalDisconnectRef.current &&
          !conversationCompletedRef.current &&
          (currentStatus === "connected" || currentStatus === "connecting")
        ) {
          if (faqMode) {
            setError("Voice session ended. Tap Start conversation to begin again.");
          } else if (orderingEnabled) {
            setError("Voice session ended. Tap Order Now to reconnect.");
          } else if (bookingEnabled) {
            setError("Voice session ended. Tap Book appointment to reconnect.");
          } else {
            setError("Voice session ended. Tap Start conversation to begin again.");
          }
        }
        intentionalDisconnectRef.current = false;
        conversationCompletedRef.current = false;
        setStatus("disconnected");
      };

      await waitForSocketOpen(ws);

      if (generation !== connectGenerationRef.current || wsRef.current !== ws) {
        return;
      }

      if (shouldPreserveSession) {
        const { order, transcript } = useSessionStore.getState();
        const hasStateToRestore = order.items.length > 0 || transcript.length > 0;
        if (hasStateToRestore) {
          ws.send(
            JSON.stringify({
              type: "session.restore",
              order,
              transcript: transcript.map(({ role, text }: TranscriptMessage) => ({
                role,
                text,
              })),
            }),
          );
        } else {
          preserveSessionRef.current = false;
        }
      }

      if (generation !== connectGenerationRef.current || wsRef.current !== ws) {
        return;
      }

      if (!prefetchModeRef.current && useSessionStore.getState().status !== "connected") {
        setStatus("connected");
      }
    })();

    connectPromiseRef.current = promise;

    try {
      await promise;
      await flushPendingGreeting();
    } catch (error) {
      teardownSocket();
      setStatus("error");
      setError(error instanceof Error ? error.message : "Failed to connect.");
      throw error;
    } finally {
      connectPromiseRef.current = null;
    }
  }, [addTranscript, activateMicAfterVisionGreeting, bufferAssistantTranscript, businessSlug, clearContinuousSilenceTimer, clearTranscript, deferChatReset, dispatchGreeting, ensureAudioEngine, ensureContinuousCapture, faqMode, finishVisionGreeting, flushPendingGreeting, markAssistantTurnBoundary, markServerSessionReady, reset, resetAssistantSync, resetServerSessionReady, revealPaymentAfterNamePrompt, setAssistantDisplayText, setConversationPhase, setError, setGreetingPoseActiveBoth, setOrder, setPhotoSouvenirConsent, setStatus, setTalking, setTalkingHandPoseActiveBoth, setThumbsUpPoseActiveBoth, setVisionGreetingPendingBoth, signalReadyForUserTurn, startNewConversation, startRevealLoop, teardownContinuousCapture, teardownSocket, triggerGreetingWave]);

  const reconnectForLanguageChange = useCallback(async () => {
    intentionalDisconnectRef.current = true;
    preserveTranscriptRef.current = true;
    connectGenerationRef.current += 1;
    setTalking(false);
    resetAssistantSync();
    audioRef.current?.stopCapture();
    audioRef.current?.stopPlayback();
    sentAudioRef.current = false;
    connectPromiseRef.current = null;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session.end" }));
    }

    teardownSocket();
    intentionalDisconnectRef.current = true;
    try {
      await connect({ preserveSession: true });
    } finally {
      preserveTranscriptRef.current = false;
    }
  }, [connect, resetAssistantSync, setTalking, teardownSocket]);

  const cancelPrefetch = useCallback(() => {
    if (pendingGreetingRef.current || greetingDispatchedRef.current) return;

    const isPrefetched =
      prefetchModeRef.current ||
      (wsRef.current?.readyState === WebSocket.OPEN &&
        useSessionStore.getState().status === "idle");
    if (!isPrefetched) return;

    intentionalDisconnectRef.current = true;
    connectGenerationRef.current += 1;
    prefetchModeRef.current = false;
    connectPromiseRef.current = null;
    continuousListenRef.current = false;
    teardownContinuousCapture();

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session.end" }));
    }

    teardownSocket();
    intentionalDisconnectRef.current = false;
    setStatus("idle");
    setError(null);
  }, [setError, setStatus, teardownContinuousCapture, teardownSocket]);

  const startTalking = useCallback(async () => {
    try {
      setError(null);

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        await connect();
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setError("Voice session is not connected.");
        setStatus("error");
        return;
      }

      sentAudioRef.current = false;
      setTalking(true);
      sendControl(wsRef.current, "audio.activity_start");

      await audioRef.current?.beginRecording((chunk) => {
        sentAudioRef.current = true;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(chunk);
        }
      });
    } catch (error) {
      setError(micErrorMessage(error));
      setTalking(false);
    }
  }, [connect, setError, setTalking, setStatus]);

  const stopTalking = useCallback(async () => {
    setTalking(false);
    audioRef.current?.pauseRecording();

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    sendControl(wsRef.current, "audio.activity_end");
    if (sentAudioRef.current) {
      sendControl(wsRef.current, "audio.stream_end");
    }
  }, [setTalking]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      try {
        setError(null);

        if (isTalking) {
          await stopTalking();
        }

        audioRef.current?.stopPlayback();
        setAssistantSpeaking(false);
        setMouthOpen(0);

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          await connect();
        }

        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          setError("Voice session is not connected.");
          setStatus("error");
          return;
        }

        ws.send(JSON.stringify({ type: "input.text", text: trimmed }));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to send message.");
      }
    },
    [connect, isTalking, setError, setStatus, stopTalking],
  );

  const sendPhotoOffer = useCallback((prompt: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "session.photo_offer", prompt }));
  }, []);

  const sendPhotoReady = useCallback((prompt?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "session.photo_ready", prompt: prompt ?? "" }));
  }, []);

  const sendLuckySpinWin = useCallback((prizeName: string, voucherCode?: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const name = prizeName.trim();
    if (!name) return;
    ws.send(
      JSON.stringify({
        type: "session.lucky_spin_win",
        prize_name: name,
        voucher_code: voucherCode?.trim() || "",
      }),
    );
  }, []);

  const primeAudioOutput = useCallback(async () => {
    await ensureAudioEngine().unlockPlayback();
  }, [ensureAudioEngine]);

  /** Call synchronously inside click/tap handlers before any await. */
  const unlockAudioSync = useCallback(() => {
    ensureAudioEngine().unlockPlaybackSync();
  }, [ensureAudioEngine]);

  const primeMicrophone = useCallback(async () => {
    try {
      setError(null);
      await ensureAudioEngine().prepareMicrophone();
      setMicPrimed(true);

      if (
        continuousListenRef.current &&
        wsRef.current?.readyState === WebSocket.OPEN &&
        useSessionStore.getState().status === "connected"
      ) {
        void startContinuousListening();
      }
    } catch (error) {
      setError(micErrorMessage(error));
    }
  }, [ensureAudioEngine, setError, startContinuousListening]);

  const wasAssistantSpeakingRef = useRef(false);

  useEffect(() => {
    if (
      wasAssistantSpeakingRef.current &&
      !assistantSpeaking &&
      visionGreetingPendingRef.current &&
      continuousListenRef.current &&
      greetingDispatchedRef.current &&
      (assistantAudioStartedRef.current || visionGreetingTextRef.current)
    ) {
      if (continuousCaptureRunningRef.current) {
        finishVisionGreeting();
      } else {
        void activateMicAfterVisionGreeting();
      }
    }
    wasAssistantSpeakingRef.current = assistantSpeaking;
  }, [activateMicAfterVisionGreeting, assistantSpeaking, finishVisionGreeting]);

  // Order Now / vision greeting: wave for ~1s when the AI starts talking.
  useEffect(() => {
    if (assistantSpeaking && greetingAwaitingSpeechRef.current) {
      triggerGreetingWave();
    }
  }, [assistantSpeaking, triggerGreetingWave]);

  // Random talking hand gesture once per assistant speaking turn (~38%).
  useEffect(() => {
    if (assistantSpeaking) {
      maybeTriggerTalkingHandOnSpeech();
    }
  }, [assistantSpeaking, maybeTriggerTalkingHandOnSpeech]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const audio = audioRef.current;
      setAssistantSpeaking(audio?.hasActivePlayback() ?? false);
      setMouthOpen(audio?.getPlaybackLevel() ?? 0);
    }, 40);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (freshOrderRequest === 0) return;
    disconnect();
  }, [disconnect, freshOrderRequest]);

  useEffect(() => {
    if (paymentCompleteRequest === 0) return;
    const state = useSessionStore.getState();
    const photo = state.menuCache?.smart_photo_moment;
    // Keep voice alive for the ready cue whenever Smart Photo Moment will open
    // (skip only if the customer explicitly declined earlier).
    if (photo?.active && photo?.enabled && state.photoSouvenirConsent !== "no") {
      return;
    }
    disconnect();
  }, [disconnect, paymentCompleteRequest]);

  useEffect(() => {
    return () => {
      resetAssistantSync();
      teardownSocket();
      audioRef.current?.dispose();
    };
  }, [resetAssistantSync, teardownSocket]);

  return {
    status,
    isTalking,
    micPrimed,
    continuousListenActive,
    visionGreetingPending,
    greetingPoseActive,
    thumbsUpPoseActive,
    talkingHandPoseActive,
    assistantSpeaking,
    mouthOpen,
    /** Prefetched voice socket + Gemini session ready — Order Now can greet immediately. */
    sessionWarm,
    connect,
    disconnect,
    reconnectForLanguageChange,
    primeMicrophone,
    primeAudioOutput,
    unlockAudioSync,
    beginVisionListening,
    ensureVisionGreetingDispatched: flushPendingGreeting,
    waitForVisionMicReady,
    startTalking,
    stopTalking,
    sendText,
    sendPhotoOffer,
    sendPhotoReady,
    sendLuckySpinWin,
    startContinuousListening,
    stopContinuousListening,
    cancelPrefetch,
    sendGoodbye,
  };
}
