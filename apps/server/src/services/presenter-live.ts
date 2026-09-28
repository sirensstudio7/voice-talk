import { GoogleGenAI, Modality } from "@google/genai";

import { env } from "../env.js";
import { withDirectConnectionAsync } from "./networking.js";

export const PRESENTER_SHUTDOWN = Symbol("PRESENTER_SHUTDOWN");

export type PresenterCueMode = "slide" | "continue" | "stage";

export type PresenterCue = {
  text: string;
  mode?: PresenterCueMode;
  label?: string;
};

export type PresenterQueueItem = PresenterCue | string | typeof PRESENTER_SHUTDOWN;

function normalizeCue(item: string | PresenterCue): PresenterCue | null {
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { text, mode: "slide" } : null;
  }
  const text = item.text.trim();
  if (!text) return null;
  const mode: PresenterCueMode =
    item.mode === "continue" || item.mode === "stage" ? item.mode : "slide";
  const label = item.label?.trim();
  return { text, mode, label: label || undefined };
}

/** Build the Gemini Live turn for a slide, stage, or mid-slide continue. */
export function formatPresenterTurn(cue: PresenterCue): string {
  const label = cue.label?.trim();
  const where = label ? ` (${label})` : "";
  const points = `Talking points:\n---\n${cue.text.trim()}\n---`;

  if (cue.mode === "continue") {
    return `Continue the SAME current segment${where}. You already started speaking.

Do not apologize. Do not say there was a mistake. Do not go back to a previous slide. Do not restart from the beginning.

Cover only remaining points you have not spoken yet. Same natural presenting style. Stop when every key point below is covered.

${points}`;
  }

  if (cue.mode === "stage") {
    return `Speak this ${label || "stage"} now. Do not apologize. Do not mention other slides. Cover it fully, then stop.

${points}`;
  }

  return `Present THIS slide now${where}. This is the current slide — not a previous slide and not a skip-ahead.

Use the talking points as an outline — speak like a skilled human presenter, not a read-aloud. Paraphrase naturally.

Cover EVERY key point, fact, number, and name before you stop. Do not cut the slide short. Do not invent claims. Do not ask questions. Do not apologize. Do not restart a previous slide.

${points}`;
}

/**
 * Minimal Gemini Live session for AI Presenter narration (no tools / no mic).
 * Client pushes text scripts; server streams PCM binary + turn_complete events.
 */
export async function runPresenterLiveSession(input: {
  apiKey: string;
  systemInstruction: string;
  voiceName?: string;
  model?: string;
  textQueue: AsyncIterable<PresenterQueueItem>;
  onAudio: (pcm: Buffer) => void | Promise<void>;
  onEvent: (event: Record<string, unknown>) => void;
}): Promise<void> {
  if (!input.apiKey) {
    input.onEvent({ type: "error", error: "GEMINI_API_KEY is not configured." });
    return;
  }

  await withDirectConnectionAsync(async () => {
    const ai = new GoogleGenAI({ apiKey: input.apiKey });
    let closed = false;
    /** Debounce turn_complete so trailing PCM after the flag still flushes. */
    let turnCompleteTimer: ReturnType<typeof setTimeout> | null = null;

    const flushTurnComplete = () => {
      if (turnCompleteTimer) {
        clearTimeout(turnCompleteTimer);
        turnCompleteTimer = null;
      }
      turnCompleteTimer = setTimeout(() => {
        turnCompleteTimer = null;
        if (!closed) input.onEvent({ type: "turn_complete" });
      }, 220);
    };

    const session = await ai.live.connect({
      model: input.model ?? env.GEMINI_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: input.voiceName?.trim() || "Aoede",
            },
          },
        },
        systemInstruction: input.systemInstruction,
        outputAudioTranscription: {},
        tools: [],
      },
      callbacks: {
        onmessage: async (message) => {
          if (closed) return;

          if (message.setupComplete) {
            input.onEvent({ type: "session.status", status: "connected" });
            return;
          }

          const serverContent = message.serverContent;
          if (!serverContent) return;

          if (serverContent.modelTurn?.parts) {
            for (const part of serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                // More audio after a premature turn_complete — cancel debounce.
                if (turnCompleteTimer) {
                  clearTimeout(turnCompleteTimer);
                  turnCompleteTimer = null;
                }
                await input.onAudio(Buffer.from(part.inlineData.data, "base64"));
              }
            }
          }

          if (serverContent.outputTranscription?.text?.trim()) {
            input.onEvent({
              type: "transcript.assistant",
              text: serverContent.outputTranscription.text.trimEnd(),
            });
          }

          if (serverContent.turnComplete) {
            flushTurnComplete();
          }

          if (serverContent.interrupted) {
            if (turnCompleteTimer) {
              clearTimeout(turnCompleteTimer);
              turnCompleteTimer = null;
            }
            input.onEvent({ type: "audio.interrupted" });
          }
        },
        onerror: (e) => {
          input.onEvent({ type: "error", error: String(e) });
        },
        onclose: () => {
          closed = true;
          if (turnCompleteTimer) {
            clearTimeout(turnCompleteTimer);
            turnCompleteTimer = null;
          }
        },
      },
    });

    try {
      for await (const item of input.textQueue) {
        if (item === PRESENTER_SHUTDOWN) break;
        const cue = normalizeCue(item);
        if (!cue) continue;
        await session.sendRealtimeInput({
          text: formatPresenterTurn(cue),
        });
      }
    } finally {
      closed = true;
      if (turnCompleteTimer) {
        clearTimeout(turnCompleteTimer);
        turnCompleteTimer = null;
      }
      try {
        session.close();
      } catch {
        // ignore
      }
    }
  });
}

export function createTextQueue(): {
  push: (item: PresenterQueueItem) => void;
  iterable: AsyncIterable<PresenterQueueItem>;
} {
  const queue: PresenterQueueItem[] = [];
  let resolveNext: ((value: IteratorResult<PresenterQueueItem>) => void) | null = null;
  let done = false;

  const iterable: AsyncIterable<PresenterQueueItem> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<PresenterQueueItem>> {
          if (queue.length) {
            return { value: queue.shift()!, done: false };
          }
          if (done) return { value: undefined, done: true };
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
      };
    },
  };

  return {
    push(item) {
      if (item === PRESENTER_SHUTDOWN) done = true;
      if (resolveNext) {
        resolveNext({ value: item, done: false });
        resolveNext = null;
      } else {
        queue.push(item);
      }
    },
    iterable,
  };
}
