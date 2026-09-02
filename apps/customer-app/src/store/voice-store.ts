import { create } from "zustand";
import { mergeTranscriptChunk } from "@voicetalk/shared";
import {
  AiLanguage,
  ConnectionStatus,
  ConversationPhase,
  TranscriptMessage,
} from "@/types/voice";
import { KioskPhase } from "@/types/kiosk";
import {
  normalizeVoiceGender,
  normalizeVoicePreset,
  type VoiceGender,
  type VoicePreset,
} from "@voicetalk/shared";

const LANGUAGE_STORAGE_KEY = "voicetalk-language";

function readStoredLanguage(): AiLanguage | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === "en" || stored === "id" ? stored : null;
}

interface VoiceStore {
  status: ConnectionStatus;
  isTalking: boolean;
  error: string | null;
  language: AiLanguage;
  transcript: TranscriptMessage[];
  conversationPhase: ConversationPhase;
  assistantName: string;
  avatarUrl: string;
  avatarModelPath: string;
  avatarCacheBust: number;
  voicePreset: VoicePreset;
  voiceGender: VoiceGender;
  forceNewAssistantBubble: boolean;
  kioskPhase: KioskPhase;
  kioskConnected: boolean;

  setStatus: (status: ConnectionStatus) => void;
  setTalking: (isTalking: boolean) => void;
  setError: (error: string | null) => void;
  setLanguage: (language: AiLanguage) => void;
  addTranscript: (role: "user" | "assistant", text: string) => void;
  setAssistantDisplayText: (text: string) => void;
  markAssistantTurnBoundary: () => void;
  clearTranscript: () => void;
  setConversationPhase: (phase: ConversationPhase) => void;
  setAssistantName: (name: string) => void;
  setAvatarUrl: (url: string) => void;
  setAvatarModelPath: (path: string) => void;
  setVoicePreset: (preset: VoicePreset | string | null | undefined) => void;
  setVoiceGender: (gender: VoiceGender | string | null | undefined) => void;
  hydrateLanguageFromStorage: () => void;
  setKioskPhase: (phase: KioskPhase) => void;
  setKioskConnected: (connected: boolean) => void;
  startNewConversation: () => void;
  reset: (options?: { keepTranscript?: boolean }) => void;
}

export const useVoiceStore = create<VoiceStore>((set, get) => ({
  status: "idle",
  isTalking: false,
  error: null,
  language: "id",
  transcript: [],
  conversationPhase: "complete",
  assistantName: "Lorescale",
  avatarUrl: "",
  avatarModelPath: "",
  avatarCacheBust: 0,
  voicePreset: "natural",
  voiceGender: "female",
  forceNewAssistantBubble: false,
  kioskPhase: "idle",
  kioskConnected: false,

  setStatus: (status) => set({ status }),
  setTalking: (isTalking) => set({ isTalking }),
  setError: (error) => set({ error }),
  setLanguage: (language) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
    set({ language });
  },
  addTranscript: (role, text) =>
    set((state) => {
      if (!text.trim()) return state;

      const last = state.transcript[state.transcript.length - 1];
      if (last && last.role === role) {
        const merged = mergeTranscriptChunk(last.text, text);
        if (merged === last.text) return state;

        return {
          transcript: state.transcript.map((message, index) =>
            index === state.transcript.length - 1
              ? { ...message, text: merged }
              : message,
          ),
        };
      }

      return {
        transcript: [
          ...state.transcript,
          { id: crypto.randomUUID(), role, text: text.trimStart() },
        ],
      };
    }),
  setAssistantDisplayText: (text) =>
    set((state) => {
      const last = state.transcript[state.transcript.length - 1];
      let nextTranscript: TranscriptMessage[];
      const startNewBubble =
        state.forceNewAssistantBubble || last?.role !== "assistant";

      if (!startNewBubble && last?.role === "assistant") {
        if (last.text === text) {
          nextTranscript = state.transcript;
        } else {
          nextTranscript = state.transcript.map((message, index) =>
            index === state.transcript.length - 1
              ? { ...message, text }
              : message,
          );
        }
      } else if (!text) {
        return state;
      } else {
        nextTranscript = [
          ...state.transcript,
          { id: crypto.randomUUID(), role: "assistant", text },
        ];
      }

      return {
        transcript: nextTranscript,
        forceNewAssistantBubble: false,
      };
    }),
  markAssistantTurnBoundary: () => set({ forceNewAssistantBubble: true }),
  clearTranscript: () => set({ transcript: [] }),
  setConversationPhase: (conversationPhase) => set({ conversationPhase }),
  setAssistantName: (name) =>
    set({ assistantName: name.trim() || "Lorescale" }),
  setAvatarUrl: (url) =>
    set({ avatarUrl: url, avatarCacheBust: url ? Date.now() : 0 }),
  setAvatarModelPath: (path) => set({ avatarModelPath: path.trim() }),
  setVoicePreset: (preset) =>
    set({ voicePreset: normalizeVoicePreset(preset) }),
  setVoiceGender: (gender) =>
    set({ voiceGender: normalizeVoiceGender(gender) }),
  hydrateLanguageFromStorage: () => {
    const stored = readStoredLanguage();
    if (stored) {
      set({ language: stored });
    }
  },
  setKioskPhase: (phase) => set({ kioskPhase: phase }),
  setKioskConnected: (connected) => set({ kioskConnected: connected }),
  startNewConversation: () =>
    set({
      status: "idle",
      isTalking: false,
      error: null,
      transcript: [],
      conversationPhase: "complete",
      forceNewAssistantBubble: false,
    }),
  reset: (options) =>
    set((state) => ({
      status: "idle",
      isTalking: false,
      error: null,
      transcript: options?.keepTranscript ? state.transcript : [],
      conversationPhase: "active",
      forceNewAssistantBubble: false,
    })),
}));
