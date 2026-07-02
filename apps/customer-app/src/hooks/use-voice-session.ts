"use client";

import { useCallback, useEffect, useRef } from "react";

import { VoiceAudioEngine } from "@/lib/voice-audio";
import { useSessionStore } from "@/store/session-store";
import { OrderState } from "@/types/voice";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/session";

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
      reject(new Error("Connection timed out. Is the API running on port 8000?"));
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

export function useVoiceSession() {
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<VoiceAudioEngine | null>(null);
  const sentAudioRef = useRef(false);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const {
    status,
    isTalking,
    setStatus,
    setTalking,
    setError,
    addTranscript,
    setOrder,
    reset,
  } = useSessionStore();

  const teardownSocket = useCallback(() => {
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
    setTalking(false);
    audioRef.current?.stopCapture();
    audioRef.current?.stopPlayback();
    sentAudioRef.current = false;
    connectPromiseRef.current = null;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session.end" }));
    }

    teardownSocket();
    setStatus("disconnected");
  }, [setStatus, setTalking, teardownSocket]);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    const promise = (async () => {
      reset();
      setStatus("connecting");
      setError(null);
      sentAudioRef.current = false;
      teardownSocket();

      if (!audioRef.current) {
        audioRef.current = new VoiceAudioEngine();
      }

      await audioRef.current.initialize();

      const ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          audioRef.current?.playPcm(event.data);
          return;
        }

        const payload = JSON.parse(event.data as string) as {
          type: string;
          text?: string;
          status?: string;
          order?: OrderState;
          error?: string;
        };

        switch (payload.type) {
          case "session.status":
            if (payload.status === "connected") setStatus("connected");
            if (payload.status === "disconnected") setStatus("disconnected");
            break;
          case "transcript.user":
            if (payload.text) addTranscript("user", payload.text);
            break;
          case "transcript.assistant":
            if (payload.text) addTranscript("assistant", payload.text);
            break;
          case "order.updated":
            if (payload.order) setOrder(payload.order);
            break;
          case "audio.interrupted":
          case "interrupted":
            audioRef.current?.stopPlayback();
            break;
          case "error":
            setError(payload.error ?? "Unknown error");
            setStatus("error");
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        setError("Unable to connect to voice server.");
        setStatus("error");
      };

      ws.onclose = () => {
        setTalking(false);
        audioRef.current?.pauseRecording();
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setStatus("disconnected");
      };

      await waitForSocketOpen(ws);
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
  }, [addTranscript, reset, setError, setOrder, setStatus, setTalking, teardownSocket]);

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

    if (sentAudioRef.current) {
      sendControl(wsRef.current, "audio.stream_end");
    }
  }, [setTalking]);

  useEffect(() => {
    return () => {
      teardownSocket();
      audioRef.current?.dispose();
    };
  }, [teardownSocket]);

  return {
    status,
    isTalking,
    connect,
    disconnect,
    startTalking,
    stopTalking,
  };
}
