"use client";

import { useCallback, useEffect, useRef } from "react";

import { VoiceAudioEngine } from "@/lib/voice-audio";
import { mergeTranscriptChunk, stripVerbalizedToolCalls } from "@voicetalk/shared";
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
};

const CHAT_FINISH_GRACE_MS = 400;
const CHAT_RESET_TIMEOUT_MS = 15_000;

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
  const connectGenerationRef = useRef(0);
  const assistantFullTextRef = useRef("");
  const assistantAudioStartedRef = useRef(false);
  const revealLoopRef = useRef<number | null>(null);
  const chatResetPendingRef = useRef(false);
  const chatResetGenerationRef = useRef(0);
  const {
    status,
    isTalking,
    freshOrderRequest,
    setStatus,
    setTalking,
    setError,
    addTranscript,
    setAssistantDisplayText,
    setOrder,
    reset,
    faqMode,
    setConversationPhase,
    clearTranscript,
    startNewConversation,
  } = useSessionStore();

  const resetAssistantSync = useCallback(() => {
    assistantFullTextRef.current = "";
    assistantAudioStartedRef.current = false;
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

  const teardownSocket = useCallback(() => {
    unregisterOrderSyncHandler();
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
  }, []);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    connectGenerationRef.current += 1;
    setTalking(false);
    audioRef.current?.stopCapture();
    sentAudioRef.current = false;
    connectPromiseRef.current = null;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session.end" }));
    }

    teardownSocket();
    setConversationPhase("wrapping_up");
    setStatus("disconnected");
    deferChatReset();
  }, [deferChatReset, setConversationPhase, setStatus, setTalking, teardownSocket]);

  const connect = useCallback(async (options?: ConnectOptions) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    const preserveSession = options?.preserveSession ?? false;
    const requestGreeting = options?.requestGreeting ?? false;
    pendingGreetingRef.current = requestGreeting;
    chatResetGenerationRef.current += 1;
    chatResetPendingRef.current = false;

    const generation = ++connectGenerationRef.current;
    const hasExistingOrder = useSessionStore.getState().order.items.length > 0;
    const shouldPreserveSession = preserveSession || hasExistingOrder;

    const promise = (async () => {
      if (shouldPreserveSession) {
        preserveSessionRef.current = true;
      } else {
        preserveSessionRef.current = false;
        reset();
      }
      setStatus("connecting");
      setError(null);
      sentAudioRef.current = false;
      teardownSocket();

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
          audioRef.current?.playPcm(event.data);
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
              setStatus("connected");
              if (faqMode) {
                setConversationPhase("active");
              }
              if (
                pendingGreetingRef.current &&
                payload.status === "connected" &&
                ws.readyState === WebSocket.OPEN
              ) {
                pendingGreetingRef.current = false;
                ws.send(JSON.stringify({ type: "session.greeting" }));
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
              const cleaned = stripVerbalizedToolCalls(payload.text);
              if (cleaned) bufferAssistantTranscript(cleaned);
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
        audioRef.current?.pauseRecording();
        wsRef.current = null;
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

      setStatus("connected");
    })();

    connectPromiseRef.current = promise;

    try {
      await promise;
    } catch (error) {
      teardownSocket();
      setStatus("error");
      setError(error instanceof Error ? error.message : "Failed to connect.");
    } finally {
      connectPromiseRef.current = null;
    }
  }, [addTranscript, bufferAssistantTranscript, businessSlug, clearTranscript, deferChatReset, faqMode, reset, resetAssistantSync, setAssistantDisplayText, setConversationPhase, setError, setOrder, setStatus, setTalking, startNewConversation, startRevealLoop, teardownSocket]);

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

  useEffect(() => {
    if (freshOrderRequest === 0) return;
    disconnect();
  }, [disconnect, freshOrderRequest]);

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
    connect,
    disconnect,
    reconnectForLanguageChange,
    startTalking,
    stopTalking,
  };
}
