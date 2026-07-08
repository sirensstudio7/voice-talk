import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { env } from "../env.js";
import {
  buildSessionGreetingPrompt,
  buildSystemInstruction,
  buildTranscriptContext,
  getActiveProducts,
  resolveAssistantName,
  resolveLanguage,
} from "../services/config-builder.js";
import { handleClientOrderMessage } from "../services/client-order.js";
import {
  ACTIVITY_END,
  ACTIVITY_START,
  AUDIO_STREAM_END,
  ClientTextEvent,
  createAudioQueue,
  SHUTDOWN,
  startGeminiSession,
} from "../services/gemini-live.js";
import { formatConnectionError } from "../services/networking.js";
import {
  createVoiceSession,
  endVoiceSession,
  persistConfirmedOrder,
  saveTranscriptMessage,
  updateOrderCustomerName,
} from "../services/order-persistence.js";
import { OrderStore } from "../services/order-store.js";
import type { ProductInfo } from "../services/tools.js";
import { getBusinessBySlug } from "../services/tenant.js";

function safeSendJson(socket: WebSocket, payload: Record<string, unknown>): boolean {
  try {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function getGeminiModel(tenant: { geminiModel: string }): string {
  return tenant.geminiModel || env.GEMINI_MODEL;
}

export async function registerWebSocketRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws/session", { websocket: true }, (socket, request) => {
    void handleSession(socket, request.query as { business?: string; language?: string });
  });
}

async function handleSession(
  socket: WebSocket,
  query: { business?: string; language?: string },
): Promise<void> {
  const slug = query.business || env.DEFAULT_BUSINESS_SLUG;
  console.info(`Session websocket connected for business=${slug}`);

  if (!env.GEMINI_API_KEY) {
    safeSendJson(socket, { type: "error", error: "GEMINI_API_KEY is not configured." });
    socket.close();
    return;
  }

  const tenant = await getBusinessBySlug(slug);
  if (!tenant) {
    safeSendJson(socket, { type: "error", error: `Business '${slug}' not found.` });
    socket.close();
    return;
  }

  const voiceSession = await createVoiceSession(tenant.id);
  const voiceSessionId = voiceSession.id;
  const productList: ProductInfo[] = getActiveProducts(tenant).map((p) => ({
    id: p.productId,
    name: p.name,
    price: p.price,
    discount_percent: p.discountPercent,
    category: p.category,
    description: p.description,
    image_url: p.imageUrl,
  }));

  const orderStore = new OrderStore();
  const audioQueue = createAudioQueue();
  const restorePayload: Record<string, unknown> = {};
  let restoreResolved = false;
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;

  const resolvedLanguage = resolveLanguage(tenant.aiRules, query.language);

  let resolveRestore: () => void = () => undefined;
  const waitRestore = new Promise<void>((resolve) => {
    resolveRestore = resolve;
    restoreTimer = setTimeout(resolve, 750);
  });

  const onConfirm = (orderSnapshot: Record<string, unknown>) => {
    void persistConfirmedOrder(tenant.id, voiceSessionId, orderSnapshot);
  };

  const onSetCustomerName = (name: string) => {
    void updateOrderCustomerName(voiceSessionId, name);
  };

  socket.on("message", (raw, isBinary) => {
    if (isBinary) {
      audioQueue.push(Buffer.from(raw as Buffer));
      return;
    }

    try {
      const payload = JSON.parse(String(raw)) as Record<string, unknown>;
      const msgType = payload.type as string;

      if (msgType === "session.end") {
        audioQueue.push(SHUTDOWN);
        return;
      }
      if (msgType === "audio.activity_start") {
        audioQueue.push(ACTIVITY_START);
      } else if (msgType === "audio.activity_end") {
        audioQueue.push(ACTIVITY_END);
      } else if (msgType === "audio.stream_end") {
        audioQueue.push(AUDIO_STREAM_END);
      } else if (msgType === "session.restore") {
        Object.keys(restorePayload).forEach((k) => delete restorePayload[k]);
        Object.assign(restorePayload, payload);
        orderStore.loadSnapshot((payload.order as Record<string, unknown>) ?? {});
        if (!restoreResolved) {
          restoreResolved = true;
          if (restoreTimer) clearTimeout(restoreTimer);
          resolveRestore();
        }
      } else if (msgType === "session.greeting") {
        audioQueue.push(
          new ClientTextEvent(
            buildSessionGreetingPrompt(
              resolvedLanguage,
              tenant.name,
              resolveAssistantName(tenant.aiRules),
            ),
          ),
        );
      } else if (
        msgType === "order.add_item" ||
        msgType === "order.decrement_item" ||
        msgType === "order.remove_item"
      ) {
        void handleClientOrderMessage(
          msgType,
          payload,
          orderStore,
          async (order) => {
            safeSendJson(socket, { type: "order.updated", order });
          },
          {
            notifyAssistant: async (text) => {
              audioQueue.push(new ClientTextEvent(text));
            },
            language: resolvedLanguage,
          },
        );
      }
    } catch (err) {
      console.error("Client receive error:", err);
      audioQueue.push(SHUTDOWN);
    }
  });

  socket.on("close", () => {
    audioQueue.push(SHUTDOWN);
  });

  if (!safeSendJson(socket, { type: "session.status", status: "connecting" })) return;

  await waitRestore;

  const transcript = (restorePayload.transcript as Array<{ role?: string; text?: string }>) ?? [];
  let systemInstruction = buildSystemInstruction(tenant, query.language);
  if (transcript.length) {
    systemInstruction += buildTranscriptContext(transcript, resolvedLanguage);
  }

  if (!safeSendJson(socket, { type: "order.updated", order: orderStore.snapshot() })) return;

  try {
    if (!safeSendJson(socket, { type: "session.status", status: "connected" })) return;

    for await (const event of startGeminiSession(
      {
        apiKey: env.GEMINI_API_KEY,
        model: getGeminiModel(tenant),
        systemInstruction,
        orderStore,
        products: productList,
        onConfirm,
        onSetCustomerName,
      },
      audioQueue.iterable,
      {
        audioOutput: async (data) => {
          if (socket.readyState === socket.OPEN) socket.send(data);
        },
        audioInterrupt: async () => {
          safeSendJson(socket, { type: "audio.interrupted" });
        },
        orderUpdate: async (order) => {
          safeSendJson(socket, { type: "order.updated", order });
        },
      },
    )) {
      if (event.type === "tool_call") {
        const result = event.result;
        if (result && typeof result === "object" && "order" in (result as object)) {
          safeSendJson(socket, {
            type: "order.updated",
            order: (result as Record<string, unknown>).order,
          });
          continue;
        }
      }

      const eventType = event.type as string;
      if (eventType === "transcript.user" || eventType === "transcript.assistant") {
        const role = eventType === "transcript.user" ? "user" : "assistant";
        void saveTranscriptMessage(voiceSessionId, role, String(event.text ?? ""));
      }

      if (!safeSendJson(socket, event)) break;
    }
  } catch (err) {
    console.error("Gemini session failed:", err);
    safeSendJson(socket, { type: "error", error: formatConnectionError(err) });
  } finally {
    audioQueue.push(SHUTDOWN);
    await endVoiceSession(voiceSessionId);
    safeSendJson(socket, { type: "session.status", status: "disconnected" });
    try {
      socket.close();
    } catch {
      // ignore
    }
  }
}
