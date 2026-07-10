import { GoogleGenAI, Modality } from "@google/genai";
import { formatConnectionError, withDirectConnectionAsync } from "./networking.js";
import { buildToolDeclarations, buildToolMapping, type ProductInfo } from "./tools.js";
import { buildBookingToolMapping } from "./booking-tools.js";
import { buildFaqToolMapping } from "./faq-tools.js";
import type { OrderStore } from "./order-store.js";

export const ACTIVITY_START = Symbol("ACTIVITY_START");
export const ACTIVITY_END = Symbol("ACTIVITY_END");
export const AUDIO_STREAM_END = Symbol("AUDIO_STREAM_END");
export const SESSION_RECONNECT = Symbol("SESSION_RECONNECT");
export const SHUTDOWN = Symbol("SHUTDOWN");

export class ClientTextEvent {
  constructor(public text: string) {}
}

const MAX_SESSION_RECONNECTS = 8;
const RECOVERABLE_MARKERS = [
  "keepalive ping timeout",
  "GoAway",
  "go away",
  "service is currently unavailable",
  "ConnectionClosed",
];

type SessionEvent = Record<string, unknown> | typeof SESSION_RECONNECT | null;

function isRecoverable(exc: unknown): boolean {
  const message = String(exc);
  return RECOVERABLE_MARKERS.some((marker) => message.toLowerCase().includes(marker.toLowerCase()));
}

export interface GeminiLiveOptions {
  apiKey: string;
  model: string;
  systemInstruction: string;
  orderStore: OrderStore;
  products: ProductInfo[];
  orderingEnabled?: boolean;
  bookingEnabled?: boolean;
  faqEnabled?: boolean;
  businessId?: string;
  voiceSessionId?: string;
  onConfirm?: (order: Record<string, unknown>) => void;
  onSetCustomerName?: (name: string) => void;
  inputSampleRate?: number;
}

export async function* startGeminiSession(
  options: GeminiLiveOptions,
  audioInputQueue: AsyncIterable<unknown>,
  callbacks: {
    audioOutput: (data: Buffer) => Promise<void>;
    audioInterrupt?: () => Promise<void>;
    orderUpdate?: (order: Record<string, unknown>) => Promise<void>;
  },
): AsyncGenerator<Record<string, unknown>> {
  const toolMapping = options.bookingEnabled
    ? buildBookingToolMapping({
        businessId: options.businessId ?? "",
        products: options.products,
        voiceSessionId: options.voiceSessionId,
      })
    : options.faqEnabled
      ? buildFaqToolMapping({})
      : buildToolMapping(options.orderStore, options.products, {
          onConfirm: options.onConfirm,
          onSetCustomerName: options.onSetCustomerName,
          orderingEnabled: options.orderingEnabled ?? true,
        });

  let reconnects = 0;
  while (reconnects <= MAX_SESSION_RECONNECTS) {
    if (reconnects > 0) {
      yield { type: "session.status", status: "reconnecting" };
      await new Promise((r) => setTimeout(r, 400));
    }

    try {
      yield* runSingleSession(options, audioInputQueue, callbacks, toolMapping);
      return;
    } catch (exc) {
      if (isRecoverable(exc)) {
        reconnects += 1;
        if (reconnects > MAX_SESSION_RECONNECTS) {
          yield {
            type: "error",
            error: "Sesi suara terputus. Ketuk Order Now untuk menyambung lagi.",
          };
          return;
        }
        continue;
      }
      throw exc;
    }
  }
}

type ToolHandlerResult = Record<string, unknown> | Promise<Record<string, unknown>>;
type ToolMapping = Record<string, (args: Record<string, unknown>) => ToolHandlerResult>;

async function* runSingleSession(
  options: GeminiLiveOptions,
  audioInputQueue: AsyncIterable<unknown>,
  callbacks: {
    audioOutput: (data: Buffer) => Promise<void>;
    audioInterrupt?: () => Promise<void>;
    orderUpdate?: (order: Record<string, unknown>) => Promise<void>;
  },
  toolMapping: ToolMapping,
): AsyncGenerator<Record<string, unknown>> {
  const sampleRate = options.inputSampleRate ?? 16000;
  const eventQueue: SessionEvent[] = [];
  let resolveEvent: (() => void) | null = null;
  let sessionClosed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveSession: any = null;

  const pushEvent = (event: SessionEvent) => {
    eventQueue.push(event);
    resolveEvent?.();
    resolveEvent = null;
  };

  const waitEvent = (): Promise<void> =>
    new Promise((resolve) => {
      if (eventQueue.length) {
        resolve();
        return;
      }
      resolveEvent = resolve;
    });

  const sendAudioLoop = async () => {
    try {
      for await (const chunk of audioInputQueue) {
        if (!liveSession || sessionClosed) break;
        if (chunk === SHUTDOWN) {
          pushEvent(null);
          break;
        }
        if (chunk === ACTIVITY_START) {
          await liveSession.sendRealtimeInput({ activityStart: {} });
        } else if (chunk === ACTIVITY_END) {
          await liveSession.sendRealtimeInput({ activityEnd: {} });
        } else if (chunk === AUDIO_STREAM_END) {
          await liveSession.sendRealtimeInput({ audioStreamEnd: true });
        } else if (chunk instanceof ClientTextEvent) {
          await liveSession.sendClientContent({
            turns: [{ role: "user", parts: [{ text: chunk.text }] }],
            turnComplete: true,
          });
        } else if (chunk instanceof Buffer || chunk instanceof Uint8Array) {
          if (chunk.length > 0) {
            await liveSession.sendRealtimeInput({
              audio: {
                data: Buffer.from(chunk).toString("base64"),
                mimeType: `audio/pcm;rate=${sampleRate}`,
              },
            });
          }
        }
      }
    } catch {
      // cancelled
    }
  };

  await withDirectConnectionAsync(async () => {
    const ai = new GoogleGenAI({ apiKey: options.apiKey });
    liveSession = await ai.live.connect({
      model: options.model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
        systemInstruction: options.systemInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: buildToolDeclarations({
          orderingEnabled: options.orderingEnabled ?? true,
          bookingEnabled: options.bookingEnabled ?? false,
          faqEnabled: options.faqEnabled ?? false,
        }) as never,
      },
      callbacks: {
        onmessage: async (message) => {
          if (sessionClosed) return;

          if (message.goAway) {
            pushEvent(SESSION_RECONNECT);
            return;
          }

          const serverContent = message.serverContent;
          const toolCall = message.toolCall;

          if (serverContent) {
            if (serverContent.modelTurn?.parts) {
              for (const part of serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const data = Buffer.from(part.inlineData.data, "base64");
                  await callbacks.audioOutput(data);
                }
              }
            }

            if (serverContent.inputTranscription?.text?.trim()) {
              pushEvent({
                type: "transcript.user",
                text: serverContent.inputTranscription.text.trimEnd(),
              });
            }

            if (serverContent.outputTranscription?.text?.trim()) {
              pushEvent({
                type: "transcript.assistant",
                text: serverContent.outputTranscription.text.trimEnd(),
              });
            }

            if (serverContent.turnComplete) {
              pushEvent({ type: "turn_complete" });
            }

            if (serverContent.interrupted) {
              await callbacks.audioInterrupt?.();
              pushEvent({ type: "interrupted" });
            }
          }

          if (toolCall?.functionCalls) {
            const functionResponses = [];
            for (const fc of toolCall.functionCalls) {
              const funcName = fc.name ?? "";
              const args = (fc.args ?? {}) as Record<string, unknown>;
              let result: Record<string, unknown> | string;

              if (toolMapping[funcName]) {
                try {
                  const rawResult = toolMapping[funcName](args);
                  result =
                    rawResult instanceof Promise ? await rawResult : (rawResult as Record<string, unknown>);
                } catch (exc) {
                  result = { error: String(exc) };
                }
              } else {
                result = { error: `Unknown tool '${funcName}'.` };
              }

              functionResponses.push({
                name: funcName,
                id: fc.id,
                response: { result },
              });

              pushEvent({
                type: "tool_call",
                name: funcName,
                args,
                result,
              });

              if (callbacks.orderUpdate && typeof result === "object" && result && "order" in result) {
                await callbacks.orderUpdate(result.order as Record<string, unknown>);
              }
            }

            await liveSession?.sendToolResponse({ functionResponses });
          }
        },
        onerror: (e) => {
          if (isRecoverable(e)) {
            pushEvent(SESSION_RECONNECT);
          } else {
            pushEvent({ type: "error", error: formatConnectionError(e) });
            pushEvent(null);
          }
        },
        onclose: () => {
          pushEvent(null);
        },
      },
    });
  });

  const sendTask = sendAudioLoop();

  try {
    while (true) {
      await waitEvent();
      const event = eventQueue.shift();
      if (event === SESSION_RECONNECT) {
        throw new Error("Gemini session ended");
      }
      if (event === null) break;
      if (event && typeof event === "object") {
        yield event as Record<string, unknown>;
      }
    }
  } finally {
    sessionClosed = true;
    try {
      liveSession?.close();
    } catch {
      // ignore
    }
    await sendTask.catch(() => undefined);
  }
}

export function createAudioQueue(): {
  push: (item: unknown) => void;
  iterable: AsyncIterable<unknown>;
} {
  const queue: unknown[] = [];
  let resolveNext: ((value: IteratorResult<unknown>) => void) | null = null;
  let done = false;

  const iterable: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<unknown>> {
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
    push(item: unknown) {
      if (resolveNext) {
        resolveNext({ value: item, done: false });
        resolveNext = null;
      } else {
        queue.push(item);
      }
      if (item === SHUTDOWN) done = true;
    },
    iterable,
  };
}
