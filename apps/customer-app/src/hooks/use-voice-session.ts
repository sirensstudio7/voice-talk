"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const [micPrimed, setMicPrimed] = useState(false);
  const [continuousListenActive, setContinuousListenActive] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const greetingDispatchedRef = useRef(false);
  const visionGreetingPendingRef = useRef(false);
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
    setOrder,
    revealPaymentAfterNamePrompt,
    reset,
    faqMode,
    setConversationPhase,
    clearTranscript,
    startNewConversation,
  } = useSessionStore();

  const resetAssistantSync = useCallback(() => {
    assistantFullTextRef.current = "";
    assistantAudioStartedRef.current = false;
    visionGreetingTextRef.current = false;
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
      const lastRole = useSessionStore.getState().transcript.at(-1)?.role;
      if (lastRole !== "assistant") {
        assistantFullTextRef.current = incoming;
      } else {
        assistantFullTextRef.current = mergeTranscriptChunk(
          assistantFullTextRef.current,
          incoming,
        );
      }
      startRevealLoop();
    },
    [startRevealLoop],
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
    visionGreetingPendingRef.current = false;
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
  }, [resetServerSessionReady]);

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
    visionGreetingPendingRef.current = false;
    setContinuousListenActive(false);
    utteranceOpenRef.current = false;
    clearContinuousSilenceTimer();
    setTalking(false);
    sentAudioRef.current = false;
    audioRef.current?.stopCapture();
  }, [clearContinuousSilenceTimer, setTalking]);

  const ensureContinuousCapture = useCallback(async () => {
    if (continuousCaptureRunningRef.current) return;

    if (!audioRef.current) {
      audioRef.current = new VoiceAudioEngine();
    }

    await audioRef.current.prepareMicrophone();
    await audioRef.current.beginRecording(processContinuousChunk);
    continuousCaptureRunningRef.current = true;
    continuousListenActiveRef.current = true;
    setContinuousListenActive(true);
    setMicPrimed(true);
  }, [processContinuousChunk]);

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
    visionGreetingPendingRef.current = false;
    setConversationPhase("active");
    signalReadyForUserTurn();
  }, [setConversationPhase, signalReadyForUserTurn]);

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

    if (!audioRef.current) {
      audioRef.current = new VoiceAudioEngine();
    }
    await audioRef.current.initialize();

    const serverReady = await waitForServerSessionReady();
    if (!serverReady) {
      return false;
    }

    const dispatched = dispatchGreeting(ws);

    // Vision kiosk opens the mic only after the greeting plays.
    if (!visionGreetingPendingRef.current) {
      void audioRef.current
        .prepareMicrophone()
        .then(() => setMicPrimed(true))
        .catch(() => {
          // Mic opens later via ensureContinuousCapture.
        });
    }

    return dispatched;
  }, [dispatchGreeting, waitForServerSessionReady]);

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
    continuousListenRef.current = Boolean(options?.continuousListen);
    prefetchModeRef.current = Boolean(options?.prefetch) && !requestGreeting;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      prefetchModeRef.current = false;
      if (requestGreeting) {
        greetingDispatchedRef.current = false;
        pendingGreetingRef.current = true;
        pendingGreetingSourceRef.current = options?.source === "vision" ? "vision" : "manual";
        visionGreetingPendingRef.current =
          options?.source === "vision" && Boolean(options?.continuousListen);
        if (!audioRef.current) {
          audioRef.current = new VoiceAudioEngine();
        }
        await audioRef.current.initialize();
        await flushPendingGreeting();
      }
      return;
    }
    if (connectPromiseRef.current) {
      if (requestGreeting) {
        greetingDispatchedRef.current = false;
        pendingGreetingRef.current = true;
        pendingGreetingSourceRef.current = options?.source === "vision" ? "vision" : "manual";
        visionGreetingPendingRef.current =
          options?.source === "vision" && Boolean(options?.continuousListen);
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
    visionGreetingPendingRef.current =
      requestGreeting && options?.source === "vision" && Boolean(options?.continuousListen);
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
      resetServerSessionReady();

      if (!audioRef.current) {
        audioRef.current = new VoiceAudioEngine();
      }

      await audioRef.current.initialize();

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
        if (event.data instanceof ArrayBuffer) {
          assistantAudioStartedRef.current = true;
          setAssistantSpeaking(true);
          void audioRef.current?.playPcm(event.data);
          startRevealLoop();
          return;
        }

        const payload = JSON.parse(event.data as string) as {
          type: string;
          text?: string;
          status?: string;
          order?: OrderState;
          error?: string;
          reason?: string;
        };

        switch (payload.type) {
          case "session.status":
            if (payload.status === "connected" || payload.status === "reconnecting") {
              markServerSessionReady();
              if (prefetchModeRef.current && !pendingGreetingRef.current) {
                setStatus("idle");
                break;
              }
              setStatus("connected");
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
              const { order } = useSessionStore.getState();
              if (
                assistantText &&
                order.status === "confirmed" &&
                !order.customer_name?.trim() &&
                isStandaloneCustomerNameAsk(assistantText)
              ) {
                revealPaymentAfterNamePrompt();
              }
            }
            if (continuousListenRef.current && !visionGreetingPendingRef.current) {
              signalReadyForUserTurn();
            }
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
        visionGreetingPendingRef.current = false;
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
  }, [addTranscript, activateMicAfterVisionGreeting, bufferAssistantTranscript, businessSlug, clearContinuousSilenceTimer, clearTranscript, deferChatReset, dispatchGreeting, ensureContinuousCapture, faqMode, finishVisionGreeting, flushPendingGreeting, markServerSessionReady, reset, resetAssistantSync, resetServerSessionReady, revealPaymentAfterNamePrompt, setAssistantDisplayText, setConversationPhase, setError, setOrder, setStatus, setTalking, signalReadyForUserTurn, startNewConversation, startRevealLoop, teardownContinuousCapture, teardownSocket]);

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

  const primeAudioOutput = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = new VoiceAudioEngine();
    }
    await audioRef.current.initialize();
  }, []);

  const primeMicrophone = useCallback(async () => {
    try {
      setError(null);
      if (!audioRef.current) {
        audioRef.current = new VoiceAudioEngine();
      }
      await audioRef.current.prepareMicrophone();
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
  }, [setError, startContinuousListening]);

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setAssistantSpeaking(audioRef.current?.hasActivePlayback() ?? false);
    }, 100);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (freshOrderRequest === 0) return;
    disconnect();
  }, [disconnect, freshOrderRequest]);

  useEffect(() => {
    if (paymentCompleteRequest === 0) return;
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
    assistantSpeaking,
    connect,
    disconnect,
    reconnectForLanguageChange,
    primeMicrophone,
    primeAudioOutput,
    beginVisionListening,
    ensureVisionGreetingDispatched: flushPendingGreeting,
    waitForVisionMicReady,
    startTalking,
    stopTalking,
    startContinuousListening,
    stopContinuousListening,
    cancelPrefetch,
    sendGoodbye,
  };
}
