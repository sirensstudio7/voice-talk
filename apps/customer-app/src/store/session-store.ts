import { create } from "zustand";

import {
  ConnectionStatus,
  OrderState,
  TranscriptMessage,
  emptyOrder,
} from "@/types/voice";

function mergeTranscriptChunk(existing: string, incoming: string): string {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (incoming.startsWith(existing)) return incoming;
  if (existing.startsWith(incoming)) return existing;
  if (existing.endsWith(incoming)) return existing;

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (existing.slice(-size) === incoming.slice(0, size)) {
      return existing + incoming.slice(size);
    }
  }

  const needsSpace =
    !/\s$/.test(existing) &&
    !/^\s/.test(incoming) &&
    !/^[.,!?;:'"')\]}>—-]/.test(incoming);

  return needsSpace ? `${existing} ${incoming}` : `${existing}${incoming}`;
}

interface SessionStore {
  status: ConnectionStatus;
  isTalking: boolean;
  error: string | null;
  transcript: TranscriptMessage[];
  order: OrderState;
  setStatus: (status: ConnectionStatus) => void;
  setTalking: (isTalking: boolean) => void;
  setError: (error: string | null) => void;
  addTranscript: (role: "user" | "assistant", text: string) => void;
  setOrder: (order: OrderState) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  status: "idle",
  isTalking: false,
  error: null,
  transcript: [],
  order: emptyOrder(),
  setStatus: (status) => set({ status }),
  setTalking: (isTalking) => set({ isTalking }),
  setError: (error) => set({ error }),
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
  setOrder: (order) => set({ order }),
  reset: () =>
    set({
      status: "idle",
      isTalking: false,
      error: null,
      transcript: [],
      order: emptyOrder(),
    }),
}));
