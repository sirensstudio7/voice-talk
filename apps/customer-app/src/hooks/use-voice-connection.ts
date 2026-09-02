"use client";

import { useEffect, useRef, useCallback } from "react";
import { VoiceStreamClient } from "@/lib/voice-stream-client";
import { useVoiceStore } from "@/store/voice-store";
import { useCommerceStore } from "@/store/commerce-store";
import { useUiStore } from "@/store/ui-store";

export function useVoiceConnection(businessSlug: string) {
  const clientRef = useRef<VoiceStreamClient | null>(null);
  
  const setStatus = useVoiceStore((state) => state.setStatus);
  const addTranscript = useVoiceStore((state) => state.addTranscript);
  const markAssistantTurnBoundary = useVoiceStore((state) => state.markAssistantTurnBoundary);
  const setTalking = useVoiceStore((state) => state.setTalking);
  const setError = useVoiceStore((state) => state.setError);
  const setOrder = useCommerceStore((state) => state.setOrder);

  // Initialize client once
  if (!clientRef.current) {
    clientRef.current = new VoiceStreamClient();
  }

  const connect = useCallback((language: string = "en") => {
    clientRef.current?.connect(businessSlug, language);
  }, [businessSlug]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const sendAudio = useCallback((pcmData: ArrayBuffer) => {
    clientRef.current?.sendAudio(pcmData);
  }, []);

  const sendControl = useCallback((type: string, payload?: Record<string, unknown>) => {
    clientRef.current?.sendControl(type, payload);
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    client.on("onStatusChange", setStatus);
    client.on("onTranscriptChunk", (role, text) => {
      addTranscript(role, text);
    });
    client.on("onAssistantTurnBoundary", markAssistantTurnBoundary);
    client.on("onTalkingChange", setTalking);
    client.on("onOrderUpdate", (order) => {
      setOrder(order, { source: "server" });
    });
    client.on("onError", setError);
    
    // Note: onAudioChunk, onToolCall, onConversationEnd, onSilenceTimeout
    // can be handled here or inside other hooks that need them.

    return () => {
      client.off("onStatusChange", setStatus);
      client.disconnect();
    };
  }, [setStatus, addTranscript, markAssistantTurnBoundary, setTalking, setOrder, setError]);

  return {
    client: clientRef.current,
    connect,
    disconnect,
    sendAudio,
    sendControl,
    isConnected: () => clientRef.current?.isConnected() ?? false,
  };
}
