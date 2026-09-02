"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useVoiceConnection } from "./use-voice-connection";
import { useTranscript } from "./use-transcript";
import { useAvatarGestures } from "./use-avatar-gestures";
import { useVoiceStore } from "@/store/voice-store";
import { VoiceAudioEngine } from "@/lib/voice-audio";
import { GREETING_WAVE_CLIP, THUMBS_UP_CLIP, TALKING_HAND_GESTURE_CLIP } from "@voicetalk/avatar";

export function useVoiceSession(businessSlug: string) {
  const connection = useVoiceConnection(businessSlug);
  const transcript = useTranscript();
  const gestures = useAvatarGestures();
  
  const status = useVoiceStore((state) => state.status);
  const isTalking = useVoiceStore((state) => state.isTalking);
  const setTalking = useVoiceStore((state) => state.setTalking);
  const setError = useVoiceStore((state) => state.setError);
  const voicePreset = useVoiceStore((state) => state.voicePreset);

  const [micPrimed, setMicPrimed] = useState(false);
  const [continuousListenActive, setContinuousListenActive] = useState(false);
  const [visionGreetingPending, setVisionGreetingPending] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [sessionWarm, setSessionWarm] = useState(false);

  const audioRef = useRef<VoiceAudioEngine | null>(null);

  const ensureAudioEngine = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new VoiceAudioEngine();
    }
    audioRef.current.setVoicePreset(voicePreset);
    return audioRef.current;
  }, [voicePreset]);

  useEffect(() => {
    audioRef.current?.setVoicePreset(voicePreset);
  }, [voicePreset]);

  // Handle client events for audio playback
  useEffect(() => {
    const client = connection.client;
    if (!client) return;

    const handleAudioChunk = (pcmData: ArrayBuffer) => {
      setAssistantSpeaking(true);
      void audioRef.current?.playPcm(pcmData);
    };

    const handleAssistantTurnBoundary = () => {
      gestures.maybeTriggerTalkingHandOnSpeech();
    };

    const handleTranscriptChunk = (role: string, text: string) => {
      if (role === "assistant") {
        gestures.maybeTriggerThumbsUpFromText(text);
      }
    };

    client.on("onAudioChunk", handleAudioChunk);
    client.on("onAssistantTurnBoundary", handleAssistantTurnBoundary);
    client.on("onTranscriptChunk", handleTranscriptChunk);

    return () => {
      client.off("onAudioChunk", handleAudioChunk);
      client.off("onAssistantTurnBoundary", handleAssistantTurnBoundary);
      client.off("onTranscriptChunk", handleTranscriptChunk);
    };
  }, [connection.client, gestures]);

  // Audio level monitoring loop
  useEffect(() => {
    const interval = window.setInterval(() => {
      const audio = audioRef.current;
      setAssistantSpeaking(audio?.hasActivePlayback() ?? false);
      setMouthOpen(audio?.getPlaybackLevel() ?? 0);
    }, 40);
    return () => window.clearInterval(interval);
  }, []);

  const primeAudioOutput = useCallback(async () => {
    await ensureAudioEngine().unlockPlayback();
  }, [ensureAudioEngine]);

  const unlockAudioSync = useCallback(() => {
    ensureAudioEngine().unlockPlaybackSync();
  }, [ensureAudioEngine]);

  const primeMicrophone = useCallback(async () => {
    try {
      setError(null);
      await ensureAudioEngine().prepareMicrophone();
      setMicPrimed(true);
    } catch (error: any) {
      setError(error?.message || "Microphone error");
    }
  }, [ensureAudioEngine, setError]);

  const startTalking = useCallback(async () => {
    try {
      setError(null);
      if (!connection.isConnected()) {
        connection.connect();
      }
      setTalking(true);
      connection.sendControl("audio.activity_start");
      
      await ensureAudioEngine().beginRecording((chunk) => {
        connection.sendAudio(chunk);
      });
    } catch (error: any) {
      setError(error?.message || "Failed to start talking");
      setTalking(false);
    }
  }, [connection, ensureAudioEngine, setError, setTalking]);

  const stopTalking = useCallback(async () => {
    setTalking(false);
    audioRef.current?.pauseRecording();
    if (!connection.isConnected()) return;
    
    await new Promise((resolve) => setTimeout(resolve, 200));
    connection.sendControl("audio.activity_end");
    connection.sendControl("audio.stream_end");
  }, [connection, setTalking]);

  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      if (isTalking) await stopTalking();
      audioRef.current?.stopPlayback();
      setAssistantSpeaking(false);
      setMouthOpen(0);
      
      if (!connection.isConnected()) connection.connect();
      
      connection.sendControl("input.text", { text: trimmed });
    } catch (err: any) {
      setError(err?.message || "Failed to send text");
    }
  }, [connection, isTalking, stopTalking, setError]);

  return {
    status,
    isTalking,
    micPrimed,
    transcript: transcript.messages,
    continuousListenActive,
    visionGreetingPending,
    greetingPoseActive: gestures.gestureClip === GREETING_WAVE_CLIP,
    thumbsUpPoseActive: gestures.gestureClip === THUMBS_UP_CLIP,
    talkingHandPoseActive: gestures.gestureClip === TALKING_HAND_GESTURE_CLIP,
    assistantSpeaking,
    mouthOpen,
    sessionWarm,
    connect: connection.connect,
    disconnect: connection.disconnect,
    reconnectForLanguageChange: () => connection.connect(),
    primeMicrophone,
    primeAudioOutput,
    unlockAudioSync,
    beginVisionListening: async () => false,
    ensureVisionGreetingDispatched: async () => false,
    waitForVisionMicReady: async () => false,
    startTalking,
    stopTalking,
    sendText,
    sendPhotoOffer: (prompt: string) => connection.sendControl("session.photo_offer", { prompt }),
    sendPhotoReady: (prompt?: string) => connection.sendControl("session.photo_ready", { prompt: prompt || "" }),
    startContinuousListening: async () => {},
    stopContinuousListening: () => {},
    cancelPrefetch: () => {},
    sendGoodbye: () => connection.sendControl("session.goodbye"),
  };
}
