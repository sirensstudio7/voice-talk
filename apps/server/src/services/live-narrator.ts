import { GoogleGenAI, Modality } from "@google/genai";

import { env } from "../env.js";
import { logger } from "../http/logger.js";
import { withDirectConnectionAsync } from "./networking.js";
import { createTextQueue, PRESENTER_SHUTDOWN } from "./presenter-live.js";

const log = logger.child({ component: "live" });

type HostVoice = {
  push: (text: string) => void;
  close: () => void;
  ready: Promise<boolean>;
};

const hosts = new Map<string, HostVoice>();

/**
 * Dedicated Gemini Live session for LORESCALE LIVE (text in, PCM out).
 * Separate from kiosk /ws/session and voice minutes.
 */
export function stopLiveHostVoice(sessionId: string) {
  const host = hosts.get(sessionId);
  if (!host) return;
  hosts.delete(sessionId);
  host.close();
}

export async function speakWithGeminiLive(input: {
  sessionId: string;
  apiKey?: string | null;
  text: string;
  voiceName: string;
  assistantName: string;
  onPcm: (pcm: Buffer) => void;
}): Promise<boolean> {
  const line = input.text.trim();
  const apiKey = input.apiKey?.trim();
  if (!line || !apiKey) return false;
  let host = hosts.get(input.sessionId);
  if (!host) {
    host = startHost({ ...input, apiKey });
    hosts.set(input.sessionId, host);
  }
  const ok = await Promise.race([
    host.ready,
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 8_000);
    }),
  ]);
  if (!ok) {
    host.close();
    hosts.delete(input.sessionId);
    return false;
  }
  host.push(line);
  return true;
}

function startHost(input: {
  sessionId: string;
  apiKey: string;
  voiceName: string;
  assistantName: string;
  onPcm: (pcm: Buffer) => void;
}): HostVoice {
  const queue = createTextQueue();
  let closed = false;
  let resolveReady: (ok: boolean) => void = () => undefined;
  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
  });
  let turnDone: (() => void) | null = null;

  const markTurnDone = () => {
    turnDone?.();
    turnDone = null;
  };

  void withDirectConnectionAsync(async () => {
    const ai = new GoogleGenAI({ apiKey: input.apiKey });
    const session = await ai.live.connect({
      model: env.GEMINI_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: input.voiceName.trim() || "Aoede" },
          },
        },
        systemInstruction: `You are ${input.assistantName}, the AI host of a LIVE shopping show.
When given a line, speak that line out loud in a natural host voice.
Do not add a welcome. Do not invent products. Do not ask questions. Speak only the given line.`,
        outputAudioTranscription: {},
        tools: [],
      },
      callbacks: {
        onmessage: async (message) => {
          if (closed) return;
          if (message.setupComplete) {
            resolveReady(true);
            return;
          }
          const serverContent = message.serverContent;
          if (!serverContent) return;
          if (serverContent.modelTurn?.parts) {
            for (const part of serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                input.onPcm(Buffer.from(part.inlineData.data, "base64"));
              }
            }
          }
          if (serverContent.turnComplete || serverContent.interrupted) {
            markTurnDone();
          }
        },
        onerror: (err) => {
          log.warn({ err, sessionId: input.sessionId, operation: "live_voice" }, "gemini.failed");
          resolveReady(false);
          markTurnDone();
        },
        onclose: () => {
          closed = true;
          hosts.delete(input.sessionId);
          resolveReady(false);
          markTurnDone();
        },
      },
    });

    // If setupComplete never arrives, still allow speaking after connect.
    windowSetTimeout(() => resolveReady(true), 2_500);

    try {
      for await (const item of queue.iterable) {
        if (item === PRESENTER_SHUTDOWN || closed) break;
        const text = (typeof item === "string" ? item : item.text).trim();
        if (!text) continue;
        const finished = new Promise<void>((resolve) => {
          turnDone = resolve;
          windowSetTimeout(resolve, 18_000);
        });
        await session.sendRealtimeInput({
          text: `Speak this LIVE host line now, same language, no extra pitch:\n${text}`,
        });
        await finished;
      }
    } finally {
      closed = true;
      hosts.delete(input.sessionId);
      try {
        session.close();
      } catch {
        // ignore
      }
    }
  }).catch((err) => {
    log.warn(
      { err, sessionId: input.sessionId, operation: "live_voice_start" },
      "gemini.failed",
    );
    resolveReady(false);
    hosts.delete(input.sessionId);
  });

  return {
    ready,
    push(text) {
      queue.push(text);
    },
    close() {
      closed = true;
      markTurnDone();
      queue.push(PRESENTER_SHUTDOWN);
    },
  };
}

function windowSetTimeout(fn: () => void, ms: number) {
  setTimeout(fn, ms);
}
