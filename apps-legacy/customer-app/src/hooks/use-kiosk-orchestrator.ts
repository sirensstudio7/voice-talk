"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useBrowserVision } from "@/hooks/use-browser-vision";
import { useBusinessSlug } from "@/context/business-context";
import { useKioskStore } from "@/store/kiosk-store";
import { useSessionStore } from "@/store/session-store";
import type { BrowserVisionEventType } from "@/lib/browser-vision/types";
import type { KioskPhase, VisionConfig } from "@/types/kiosk";

function buildKioskWsUrl(businessSlug: string): string {
  // NEXT_PUBLIC_WS_URL points at /ws/session for voice — kiosk uses a separate route.
  let url: URL;
  if (process.env.NEXT_PUBLIC_API_URL) {
    const api = new URL(process.env.NEXT_PUBLIC_API_URL);
    api.protocol = api.protocol === "https:" ? "wss:" : "ws:";
    api.pathname = "/ws/kiosk";
    api.search = "";
    url = api;
  } else if (process.env.NEXT_PUBLIC_WS_URL) {
    url = new URL(process.env.NEXT_PUBLIC_WS_URL);
    url.pathname = "/ws/kiosk";
    url.search = "";
  } else {
    url = new URL("ws://localhost:8000/ws/kiosk");
  }

  url.searchParams.set("business", businessSlug);
  url.searchParams.set("kiosk_id", "default");
  return url.toString();
}

type VoiceSessionApi = {
  connect: (options?: {
    requestGreeting?: boolean;
    source?: "vision";
    continuousListen?: boolean;
    prefetch?: boolean;
  }) => Promise<void>;
  disconnect: () => void;
  cancelPrefetch: () => void;
  startContinuousListening: () => Promise<void>;
  stopContinuousListening: () => void;
  sendGoodbye: () => void;
  primeMicrophone: () => Promise<void>;
  primeAudioOutput: () => Promise<void>;
  ensureVisionGreetingDispatched: () => Promise<boolean>;
  waitForVisionMicReady: (timeoutMs?: number) => Promise<boolean>;
  beginVisionListening: () => Promise<boolean>;
};

type KioskVisionSignals = {
  assistantSpeaking: boolean;
  continuousListenActive: boolean;
  /** True from vision greeting dispatch until the spoken greeting finishes. */
  visionGreetingPending: boolean;
};

const KIOSK_RECONNECT_MS = 800;

async function waitForVoiceConnected(maxMs = 20000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const status = useSessionStore.getState().status;
    if (status === "connected") return true;
    if (status === "error") return false;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return useSessionStore.getState().status === "connected";
}

export function useKioskOrchestrator(
  voice: VoiceSessionApi,
  visionSignals: KioskVisionSignals = {
    assistantSpeaking: false,
    continuousListenActive: false,
    visionGreetingPending: false,
  },
) {
  const businessSlug = useBusinessSlug();
  const visionEnabled = useKioskStore((s) => s.visionEnabled);
  const visionConfigSynced = useKioskStore((s) => s.visionConfigSynced);
  const visionConfig = useKioskStore((s) => s.visionConfig);
  const kioskConnected = useKioskStore((s) => s.kioskConnected);
  const pythonVisionConnected = useKioskStore((s) => s.pythonVisionConnected);
  const setPythonVisionConnected = useKioskStore((s) => s.setPythonVisionConnected);
  const setBrowserVisionError = useKioskStore((s) => s.setBrowserVisionError);
  const lostTimeoutSecondsRef = useRef(visionConfig.lost_timeout_seconds);
  lostTimeoutSecondsRef.current = visionConfig.lost_timeout_seconds;
  const setKioskPhase = useKioskStore((s) => s.setKioskPhase);
  const setVisionConfig = useKioskStore((s) => s.setVisionConfig);
  const kioskPhase = useKioskStore((s) => s.kioskPhase);
  const setKioskConnected = useKioskStore((s) => s.setKioskConnected);
  const status = useSessionStore((s) => s.status);
  const conversationPhase = useSessionStore((s) => s.conversationPhase);
  const isTalking = useSessionStore((s) => s.isTalking);

  const wsRef = useRef<WebSocket | null>(null);
  const lostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionActiveRef = useRef(false);
  const hadVisionSessionRef = useRef(false);
  const sessionReleaseSentRef = useRef(false);
  const prevConversationPhaseRef = useRef(conversationPhase);
  const greetingStartedRef = useRef(false);
  /** True once the AI actually started playing the greeting audio. */
  const greetingAudioHeardRef = useRef(false);
  const prefetchActiveRef = useRef(false);
  const [visionSessionActive, setVisionSessionActive] = useState(false);
  const sendVisionEvent = useCallback((event: BrowserVisionEventType, trackId = 1) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: "kiosk.vision.event",
        event,
        track_id: trackId,
      }),
    );
  }, []);

  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const handleBrowserCameraReady = useCallback(() => {
    window.setTimeout(() => {
      void voiceRef.current.primeMicrophone?.();
    }, 0);
  }, []);

  const { releaseCamera: releaseBrowserCamera } = useBrowserVision({
    visionEnabled,
    visionConfigSynced,
    kioskConnected,
    pythonVisionConnected,
    visionConfig,
    sessionActive: visionSessionActive,
    sendVisionEvent,
    onError: setBrowserVisionError,
    onCameraReady: handleBrowserCameraReady,
  });

  const clearLostTimer = useCallback(() => {
    if (lostTimerRef.current) {
      clearTimeout(lostTimerRef.current);
      lostTimerRef.current = null;
    }
  }, []);

  const sessionStartedAckPendingRef = useRef(false);
  const sessionReleasePendingRef = useRef(false);

  const sendSessionStartedAck = useCallback(() => {
    hadVisionSessionRef.current = true;
    sessionReleaseSentRef.current = false;
    sessionReleasePendingRef.current = false;
    sessionActiveRef.current = true;
    setVisionSessionActive(true);

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "kiosk.session.started" }));
      sessionStartedAckPendingRef.current = false;
      return;
    }
    sessionStartedAckPendingRef.current = true;
  }, []);

  const flushPendingSessionStartedAck = useCallback(() => {
    if (!sessionActiveRef.current && !sessionStartedAckPendingRef.current) {
      return;
    }
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) {
      sessionStartedAckPendingRef.current = true;
      return;
    }
    ws.send(JSON.stringify({ type: "kiosk.session.started" }));
    sessionStartedAckPendingRef.current = false;
  }, []);

  const flushPendingSessionRelease = useCallback(() => {
    if (!sessionReleasePendingRef.current) return;
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "kiosk.session.released" }));
    sessionReleasePendingRef.current = false;
    sessionReleaseSentRef.current = true;
  }, []);

  const notifySessionEnded = useCallback(() => {
    const shouldSendRelease = !sessionReleaseSentRef.current;
    sessionReleaseSentRef.current = true;
    hadVisionSessionRef.current = false;
    sessionActiveRef.current = false;
    sessionStartedAckPendingRef.current = false;
    setVisionSessionActive(false);
    greetingStartedRef.current = false;
    greetingAudioHeardRef.current = false;
    prefetchActiveRef.current = false;
    if (shouldSendRelease) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // released (not ended) — keep camera detection armed without post-session cooldown
        wsRef.current.send(JSON.stringify({ type: "kiosk.session.released" }));
        sessionReleasePendingRef.current = false;
      } else {
        // Retry on kiosk WS reconnect so the server does not stay sessionActive.
        sessionReleasePendingRef.current = true;
        sessionReleaseSentRef.current = false;
      }
    }
    setKioskPhase("idle");
  }, [setKioskPhase]);

  const endWithGoodbye = useCallback(() => {
    setKioskPhase("goodbye");
    voiceRef.current.sendGoodbye();
  }, [setKioskPhase]);

  const scheduleLostTimeout = useCallback(
    (seconds: number) => {
      clearLostTimer();
      lostTimerRef.current = setTimeout(() => {
        if (sessionActiveRef.current) {
          endWithGoodbye();
        }
      }, seconds * 1000);
    },
    [clearLostTimer, endWithGoodbye],
  );

  const handleVisionTrigger = useCallback(async () => {
    const voiceStatus = useSessionStore.getState().status;
    const isLive = voiceStatus === "connected" || voiceStatus === "connecting";

    if (sessionActiveRef.current && isLive) return;

    if (greetingStartedRef.current && isLive && sessionActiveRef.current) return;

    if (greetingStartedRef.current && !isLive) {
      greetingStartedRef.current = false;
      greetingAudioHeardRef.current = false;
      sessionActiveRef.current = false;
    }

    greetingStartedRef.current = true;
    greetingAudioHeardRef.current = false;
    prefetchActiveRef.current = false;
    setKioskPhase("greeting");
    // Ack the vision server immediately so the 12s release timer does not fire
    // while voice connect + greeting dispatch runs (kiosk WS may reconnect in dev).
    sendSessionStartedAck();
    // Release browser camera before voice connect — avoids getUserMedia hanging
    // when camera + mic are requested at the same time.
    releaseBrowserCamera();
    // Give the browser a moment to release the camera device before opening the mic.
    await new Promise((resolve) => setTimeout(resolve, 350));

    try {
      await voiceRef.current.beginVisionListening().catch(() => false);

      await voiceRef.current.connect({
        requestGreeting: true,
        source: "vision",
        continuousListen: true,
      });

      const greetingSent = await voiceRef.current.ensureVisionGreetingDispatched();
      if (!greetingSent) {
        throw new Error("Vision greeting was not sent to the voice server");
      }

      // Re-send in case the kiosk socket dropped and reconnected during connect().
      sendSessionStartedAck();
      // Keep greetingStartedRef true until the AI finishes speaking the greeting
      // so the avatar wave pose stays active for the whole line.

      const micReady = await voiceRef.current.waitForVisionMicReady(20_000);
      if (!micReady) {
        const detail = useSessionStore.getState().error;
        useSessionStore.getState().setError(
          detail ??
            "Microphone failed to open after greeting. Tap the screen once, then raise your hand again.",
        );
      }
    } catch {
      greetingStartedRef.current = false;
      greetingAudioHeardRef.current = false;
      prefetchActiveRef.current = false;
      setVisionSessionActive(false);
      voiceRef.current.stopContinuousListening();
      voiceRef.current.cancelPrefetch();
      notifySessionEnded();
      useSessionStore.getState().setError(
        "Greeting failed to start. Hard-refresh the page and try again.",
      );
      setKioskPhase("idle");
    }
  }, [notifySessionEnded, releaseBrowserCamera, sendSessionStartedAck, setKioskPhase]);

  const handleVisionTriggerRef = useRef(handleVisionTrigger);
  handleVisionTriggerRef.current = handleVisionTrigger;

  // Reset if stuck on "preparing greeting" without voice ever starting.
  useEffect(() => {
    if (!visionEnabled || kioskPhase !== "waiting") return;

    const timer = window.setTimeout(() => {
      const voiceStatus = useSessionStore.getState().status;
      const isLive = voiceStatus === "connected" || voiceStatus === "connecting";
      if (!isLive) {
        greetingStartedRef.current = false;
        greetingAudioHeardRef.current = false;
        sessionActiveRef.current = false;
        setKioskPhase("idle");
      }
    }, 20_000);

    return () => window.clearTimeout(timer);
  }, [kioskPhase, setKioskPhase, visionEnabled]);

  // Reset if greeting never finishes (no audio/mic) — avoids infinite "Assistant greeting you…"
  useEffect(() => {
    if (!visionEnabled || kioskPhase !== "greeting") return;

    const timer = window.setTimeout(() => {
      if (!greetingStartedRef.current) return;
      // Mic is often already open during greeting — only skip timeout while the
      // spoken greeting is still pending.
      if (visionSignals.visionGreetingPending) return;

      greetingStartedRef.current = false;
      greetingAudioHeardRef.current = false;
      voiceRef.current.stopContinuousListening();
      voiceRef.current.cancelPrefetch();
      notifySessionEnded();
      useSessionStore.getState().setError(
        "Greeting timed out. Allow microphone access, hard-refresh, and try again.",
      );
      setKioskPhase("idle");
    }, 35_000);

    return () => window.clearTimeout(timer);
  }, [
    kioskPhase,
    notifySessionEnded,
    setKioskPhase,
    visionEnabled,
    visionSignals.visionGreetingPending,
  ]);

  useEffect(() => {
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const attachHandlers = (ws: WebSocket) => {
      ws.onopen = () => {
        if (!active) return;
        setKioskConnected(true);
        flushPendingSessionRelease();
        flushPendingSessionStartedAck();
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as Record<string, unknown>;
          const type = payload.type as string;

          if (type === "vision.config") {
            const config = payload.config as VisionConfig | undefined;
            if (config) {
              setVisionConfig(config);
            }
            setPythonVisionConnected(payload.python_vision_connected === true);
            const voiceStatus = useSessionStore.getState().status;
            const voiceLive =
              voiceStatus === "connected" || voiceStatus === "connecting";
            const conversationStillLive = (() => {
              const phase = useSessionStore.getState().conversationPhase;
              return phase === "active" || phase === "wrapping_up";
            })();

            if (payload.session_active === true && voiceLive) {
              sessionActiveRef.current = true;
              setVisionSessionActive(true);
            } else if (payload.session_active === true && !voiceLive) {
              // Voice may drop before the client sends session.released — keep the
              // vision session latched until conversation.complete finishes.
              if (!conversationStillLive) {
                sessionActiveRef.current = false;
                setVisionSessionActive(false);
                greetingStartedRef.current = false;
                greetingAudioHeardRef.current = false;
                prefetchActiveRef.current = false;
              }
            } else if (payload.session_active === false) {
              // Server may still report inactive while greeting is starting locally.
              if (greetingStartedRef.current) {
                return;
              }
              const phase = useKioskStore.getState().kioskPhase;
              if (
                voiceLive &&
                (phase === "greeting" || phase === "listening" || phase === "talking")
              ) {
                return;
              }
              sessionActiveRef.current = false;
              setVisionSessionActive(false);
              prefetchActiveRef.current = false;
            }
            return;
          }

          const visionActive = useKioskStore.getState().visionEnabled;

          if (type === "vision.event") {
            if (!visionActive) return;
            const visionEvent = payload.event as string;
            if (visionEvent === "PERSON_ENTER" && !sessionActiveRef.current) {
              const triggerMode =
                useKioskStore.getState().visionConfig.greeting_trigger_mode;
              const handTriggerMode =
                triggerMode === "gesture" || triggerMode === "raise_hand";

              // Hand-gesture modes: only start voice after the gesture (vision.trigger).
              // Do not prefetch or prime the mic — the assistant greets first, not the visitor.
              if (handTriggerMode) {
                return;
              }

              setKioskPhase("waiting");
              void voiceRef.current.primeMicrophone().catch(() => {
                // Mic is required after greeting; prime early when possible.
              });
              if (!prefetchActiveRef.current) {
                prefetchActiveRef.current = true;
                void voiceRef.current
                  .connect({ prefetch: true })
                  .catch(() => {
                    prefetchActiveRef.current = false;
                  });
              }
            }
            if (visionEvent === "PERSON_EXIT" && !sessionActiveRef.current) {
              // Arm movement during a wave can briefly drop detection — keep voice warm.
              if (greetingStartedRef.current) return;
              const handTriggerMode =
                useKioskStore.getState().visionConfig.greeting_trigger_mode === "gesture" ||
                useKioskStore.getState().visionConfig.greeting_trigger_mode === "raise_hand";
              const phase = useKioskStore.getState().kioskPhase;
              if (handTriggerMode && (phase === "waiting" || prefetchActiveRef.current)) {
                return;
              }
              setKioskPhase("idle");
              prefetchActiveRef.current = false;
              voiceRef.current.cancelPrefetch();
            }
          }

          if (type === "vision.trigger" && payload.action === "start_greeting") {
            void handleVisionTriggerRef.current();
          }

          if (type === "vision.person_lost" && sessionActiveRef.current) {
            if (!visionActive) return;
            const timeout =
              typeof payload.lost_timeout_seconds === "number"
                ? payload.lost_timeout_seconds
                : lostTimeoutSecondsRef.current;
            scheduleLostTimeout(timeout);
          }

          if (type === "vision.person_returned" && sessionActiveRef.current) {
            if (!visionActive) return;
            clearLostTimer();
          }

          if (type === "vision.session.ended") {
            sessionReleaseSentRef.current = true;
            sessionReleasePendingRef.current = false;
            hadVisionSessionRef.current = false;
            sessionActiveRef.current = false;
            sessionStartedAckPendingRef.current = false;
            setVisionSessionActive(false);
            greetingStartedRef.current = false;
            greetingAudioHeardRef.current = false;
            prefetchActiveRef.current = false;
            setKioskPhase("idle");
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setKioskConnected(false);
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (active) {
          reconnectTimer = setTimeout(connectKiosk, KIOSK_RECONNECT_MS);
        }
      };

      ws.onerror = () => {
        setKioskConnected(false);
      };
    };

    const connectKiosk = () => {
      if (!active) return;

      const existing = wsRef.current;
      if (
        existing &&
        (existing.readyState === WebSocket.OPEN ||
          existing.readyState === WebSocket.CONNECTING)
      ) {
        attachHandlers(existing);
        if (existing.readyState === WebSocket.OPEN) {
          setKioskConnected(true);
        }
        return;
      }

      const ws = new WebSocket(buildKioskWsUrl(businessSlug));
      wsRef.current = ws;
      attachHandlers(ws);
    };

    connectKiosk();

    return () => {
      active = false;
      clearLostTimer();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      wsRef.current?.close();
      wsRef.current = null;
      setKioskConnected(false);
    };
  }, [
    businessSlug,
    clearLostTimer,
    flushPendingSessionRelease,
    flushPendingSessionStartedAck,
    scheduleLostTimeout,
    setKioskConnected,
    setKioskPhase,
    setVisionConfig,
    setPythonVisionConnected,
  ]);

  useEffect(() => {
    if (visionEnabled) return;

    voiceRef.current.cancelPrefetch();
  }, [visionEnabled]);

  useEffect(() => {
    if (!visionEnabled) return;

    const currentPhase = useKioskStore.getState().kioskPhase;
    if (
      currentPhase === "waiting" &&
      !greetingStartedRef.current &&
      !sessionActiveRef.current
    ) {
      return;
    }

    let phase: KioskPhase = "idle";
    if (status === "connecting") {
      phase = greetingStartedRef.current ? "greeting" : "idle";
    } else if (conversationPhase === "complete") {
      greetingStartedRef.current = false;
      greetingAudioHeardRef.current = false;
      phase = "idle";
    } else if (status === "connected") {
      if (conversationPhase === "wrapping_up") {
        phase = "goodbye";
      } else if (greetingStartedRef.current || visionSignals.visionGreetingPending) {
        if (visionSignals.assistantSpeaking) {
          greetingAudioHeardRef.current = true;
        }
        // Mic opens early (muted uplink) while visionGreetingPending — do NOT
        // treat continuousListenActive as end-of-greeting.
        if (
          !visionSignals.visionGreetingPending &&
          greetingAudioHeardRef.current &&
          !visionSignals.assistantSpeaking
        ) {
          greetingStartedRef.current = false;
          greetingAudioHeardRef.current = false;
          phase = "listening";
        } else {
          phase = "greeting";
        }
      } else if (isTalking) {
        phase = "listening";
      } else if (conversationPhase === "active") {
        phase = visionSignals.assistantSpeaking ? "talking" : "listening";
      } else {
        phase = "idle";
      }
    }

    setKioskPhase(phase);
  }, [
    conversationPhase,
    isTalking,
    setKioskPhase,
    status,
    visionEnabled,
    visionSignals.assistantSpeaking,
    visionSignals.continuousListenActive,
    visionSignals.visionGreetingPending,
  ]);

  useEffect(() => {
    const previousPhase = prevConversationPhaseRef.current;
    prevConversationPhaseRef.current = conversationPhase;

    if (conversationPhase !== "complete") return;
    if (previousPhase === "complete") return;
    if (!hadVisionSessionRef.current && !sessionActiveRef.current) return;
    notifySessionEnded();
  }, [conversationPhase, notifySessionEnded]);

  return {
    visionEnabled,
    notifySessionStarted: sendSessionStartedAck,
    notifySessionEnded,
  };
}
