import { GoogleGenAI, Modality } from "@google/genai";

import { env } from "../env.js";
import { withDirectConnectionAsync } from "./networking.js";

export const PRESENTER_SHUTDOWN = Symbol("PRESENTER_SHUTDOWN");

/**
 * Minimal Gemini Live session for AI Presenter narration (no tools / no mic).
 * Client pushes text scripts; server streams PCM binary + turn_complete events.
 */
export async function runPresenterLiveSession(input: {
  systemInstruction: string;
  voiceName?: string;
  model?: string;
  textQueue: AsyncIterable<string | typeof PRESENTER_SHUTDOWN>;
  onAudio: (pcm: Buffer) => void | Promise<void>;
  onEvent: (event: Record<string, unknown>) => void;
}): Promise<void> {
  if (!env.GEMINI_API_KEY) {
    input.onEvent({ type: "error", error: "GEMINI_API_KEY is not configured." });
    return;
  }

  await withDirectConnectionAsync(async () => {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY! });
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
        const text = String(item).trim();
        if (!text) continue;
        // Script = talking points. Cover every key point, but present like a human (not a read-aloud).
        await session.sendRealtimeInput({
          text: `Present the next slide now.

Use the talking points below as your outline — speak like a skilled human presenter, not like you are reading a script aloud. Paraphrase naturally. Follow the Delivery style rules from your system instructions.

Cover EVERY key point, fact, number, and name before you stop. Do not cut the slide short. Do not invent new claims. Do not ask questions. Only stop after the full slide is covered.

Talking points:
---
${text}
---`,
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
  push: (item: string | typeof PRESENTER_SHUTDOWN) => void;
  iterable: AsyncIterable<string | typeof PRESENTER_SHUTDOWN>;
} {
  const queue: Array<string | typeof PRESENTER_SHUTDOWN> = [];
  let resolveNext:
    | ((value: IteratorResult<string | typeof PRESENTER_SHUTDOWN>) => void)
    | null = null;
  let done = false;

  const iterable: AsyncIterable<string | typeof PRESENTER_SHUTDOWN> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<string | typeof PRESENTER_SHUTDOWN>> {
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
