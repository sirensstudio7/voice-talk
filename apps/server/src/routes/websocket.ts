import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import {
  getBusinessCapabilities,
  getVoicePresetGeminiVoice,
  isCombinedCustomerNameAsk,
  isStandaloneCustomerNameAsk,
  mergeTranscriptChunk,
  parseVerbalizedEndConversation,
  shouldEndFaqConversation,
  stripVerbalizedToolCalls,
} from "@voicetalk/shared";
import { env } from "../env.js";
import {
  buildCombinedNameAskCorrectionPrompt,
  buildSessionGreetingPrompt,
  buildSystemInstruction,
  buildTranscriptContext,
  buildVisionGoodbyePrompt,
  buildVisionGreetingPrompt,
  buildVisionSilenceFollowUpPrompt,
  getActiveProducts,
  resolveAssistantName,
  resolveIdleTimeoutMs,
  resolveLanguage,
} from "../services/config-builder.js";
import {
  DEFAULT_PHOTO_READY_PROMPT,
  getSmartPhotoMomentPublicConfig,
} from "../services/addon-entitlement.js";
import { getOrCreateVisionSettings, ensureVisionHub, setKioskSessionActive, releaseKioskSession, getVisionHub } from "../services/vision-orchestrator.js";
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

const CONVERSATION_COMPLETION_GRACE_MS = 5_000;

type TranscriptRole = "user" | "assistant";

function createTranscriptTurnBuffer() {
  const pending: Record<TranscriptRole, string> = { user: "", assistant: "" };

  return {
    append(role: TranscriptRole, text: string) {
      const trimmed = text.trim();
      if (!trimmed) return;
      pending[role] = mergeTranscriptChunk(pending[role], trimmed);
    },
    has(role: TranscriptRole) {
      return pending[role].trim().length > 0;
    },
    peek(role: TranscriptRole) {
      return pending[role].trim();
    },
    async flush(role: TranscriptRole, sessionId: string) {
      const text = pending[role].trim();
      if (!text) return;
      pending[role] = "";
      await saveTranscriptMessage(sessionId, role, text);
    },
    async flushAll(sessionId: string) {
      await this.flush("user", sessionId);
      await this.flush("assistant", sessionId);
    },
  };
}

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

  const capabilities = getBusinessCapabilities(
    tenant.primaryUseCase,
    tenant.businessType,
  );
  const orderingEnabled = capabilities.ordering_enabled;
  const bookingEnabled = capabilities.booking_enabled;
  const faqEnabled = !orderingEnabled && !bookingEnabled;
  const idleTimeoutMs = resolveIdleTimeoutMs(tenant.aiRules);

  const voiceSession = await createVoiceSession(tenant.id);
  const voiceSessionId = voiceSession.id;
  const productList: ProductInfo[] = capabilities.menu_enabled
    ? getActiveProducts(tenant).map((p) => ({
        id: p.productId,
        name: p.name,
        price: p.price,
        discount_percent: p.discountPercent,
        category: p.category,
        description: p.description,
        image_url: p.imageUrl,
        duration_min: p.durationMin,
      }))
    : [];

  const orderStore = new OrderStore();
  const audioQueue = createAudioQueue();
  const restorePayload: Record<string, unknown> = {};
  let restoreResolved = false;
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;
  let endReason: string | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let completionScheduled = false;
  let lastAssistantTurn = "";
  let lastNameCorrectionTurn = "";
  let visionMode = false;
  let visionSilenceStage: "none" | "follow_up" | "goodbye" = "none";
  let visionSettingsCache: Awaited<ReturnType<typeof getOrCreateVisionSettings>> | null = null;
  const transcriptBuffer = createTranscriptTurnBuffer();

  const maybeCompleteAfterUserTurn = (userText: string) => {
    if (!faqEnabled || completionScheduled || !lastAssistantTurn) return false;
    const reason = shouldEndFaqConversation(lastAssistantTurn, userText);
    if (!reason) return false;
    void transcriptBuffer.flush("user", voiceSessionId);
    completeConversation(reason);
    return true;
  };

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const isAwaitingCheckoutName = () => {
    const snap = orderStore.snapshot();
    return snap.status === "confirmed" && !String(snap.customer_name ?? "").trim();
  };

  const scheduleIdleTimeout = () => {
    if (completionScheduled) return;

    // During confirmed checkout (waiting for name), do not inject vision
    // silence follow-ups — they cause the model to restart checkout questions.
    if (orderingEnabled && isAwaitingCheckoutName()) {
      clearIdleTimer();
      return;
    }

    if (visionMode && visionSettingsCache) {
      clearIdleTimer();
      const silenceMs = visionSettingsCache.silenceTimeoutSeconds * 1000;
      if (visionSilenceStage === "none") {
        idleTimer = setTimeout(() => {
          if (completionScheduled) return;
          if (orderingEnabled && isAwaitingCheckoutName()) {
            visionSilenceStage = "none";
            return;
          }
          visionSilenceStage = "follow_up";
          audioQueue.push(
            new ClientTextEvent(buildVisionSilenceFollowUpPrompt(resolvedLanguage)),
          );
          scheduleIdleTimeout();
        }, silenceMs);
        return;
      }
      if (visionSilenceStage === "follow_up") {
        const goodbyeMs = visionSettingsCache.autoGoodbyeTimeoutSeconds * 1000;
        idleTimer = setTimeout(() => {
          if (completionScheduled) return;
          if (orderingEnabled && isAwaitingCheckoutName()) {
            visionSilenceStage = "none";
            return;
          }
          visionSilenceStage = "goodbye";
          audioQueue.push(
            new ClientTextEvent(
              buildVisionGoodbyePrompt(
                resolvedLanguage,
                visionSettingsCache?.goodbyeScript,
              ),
            ),
          );
          completeConversation("vision_silence_timeout");
        }, goodbyeMs);
        return;
      }
      return;
    }

    if (!faqEnabled || idleTimeoutMs === null) return;
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      completeConversation("idle_timeout");
    }, idleTimeoutMs);
  };

  const completeConversation = (reason: string) => {
    if (completionScheduled) return;
    completionScheduled = true;
    clearIdleTimer();
    visionSilenceStage = "none";
    endReason = reason;
    safeSendJson(socket, { type: "conversation.complete", reason });

    // After goodbye audio grace, free the vision hub if the kiosk never sent released.
    setTimeout(() => {
      audioQueue.push(SHUTDOWN);
      if (!visionMode) return;
      void (async () => {
        try {
          const hub = getVisionHub(slug) ?? (await ensureVisionHub(tenant.id, slug));
          if (hub.sessionActive) {
            console.info(
              `Vision session released after conversation.complete business=${slug} reason=${reason}`,
            );
            releaseKioskSession(hub);
          }
        } catch (err) {
          console.warn(`Vision release on conversation.complete failed business=${slug}`, err);
        }
      })();
    }, CONVERSATION_COMPLETION_GRACE_MS);
  };

  const resolvedLanguage = resolveLanguage(tenant.aiRules, query.language);

  const maybeCorrectCombinedNameAsk = () => {
    if (!orderingEnabled || completionScheduled) return;
    const snap = orderStore.snapshot();
    if (snap.status !== "confirmed" || snap.customer_name) return;
    if (!lastAssistantTurn || !isCombinedCustomerNameAsk(lastAssistantTurn)) return;
    if (lastNameCorrectionTurn === lastAssistantTurn) return;
    lastNameCorrectionTurn = lastAssistantTurn;
    audioQueue.push(
      new ClientTextEvent(
        buildCombinedNameAskCorrectionPrompt(resolvedLanguage, {
          photoMomentEnabled,
          photoConsentRecorded: photoSouvenirConsent !== null,
          voicePrompt: photoVoicePrompt,
        }),
      ),
    );
  };

  const maybePromptPaymentAfterNameAsk = () => {
    if (!orderingEnabled || completionScheduled) return;
    const snap = orderStore.snapshot();
    if (snap.status !== "confirmed" || snap.customer_name) return;
    // Don't open Pay until souvenir-photo consent is recorded when SPM is on.
    if (photoMomentEnabled && photoSouvenirConsent === null) return;
    if (!lastAssistantTurn || !isStandaloneCustomerNameAsk(lastAssistantTurn)) return;
    safeSendJson(socket, { type: "checkout.prompt_payment" });
  };

  let resolveRestore: () => void = () => undefined;
  const waitRestore = new Promise<void>((resolve) => {
    resolveRestore = resolve;
    restoreTimer = setTimeout(resolve, 50);
  });

  const onConfirm = (orderSnapshot: Record<string, unknown>) => {
    void persistConfirmedOrder(tenant.id, voiceSessionId, orderSnapshot);
  };

  const onSetCustomerName = (name: string) => {
    void updateOrderCustomerName(voiceSessionId, name);
  };

  const onPhotoConsent = (consent: "yes" | "no") => {
    photoSouvenirConsent = consent;
    safeSendJson(socket, { type: "photo.consent", consent });
  };

  // Loaded before Gemini connect so tools/instructions match entitlement.
  let photoMomentEnabled = false;
  let photoVoicePrompt = "";
  let photoSouvenirConsent: "yes" | "no" | null = null;
  const photoConfigPromise = getSmartPhotoMomentPublicConfig(tenant.id).then((cfg) => {
    photoMomentEnabled = Boolean(cfg.active && cfg.enabled);
    photoVoicePrompt = cfg.voice_prompt;
    return cfg;
  });

  socket.on("message", (raw, isBinary) => {
    if (isBinary) {
      audioQueue.push(Buffer.from(raw as Buffer));
      return;
    }

    try {
      const payload = JSON.parse(String(raw)) as Record<string, unknown>;
      const msgType = payload.type as string;

      if (msgType === "session.end") {
        endReason = "manual";
        audioQueue.push(SHUTDOWN);
        return;
      }
      if (msgType === "audio.activity_start") {
        clearIdleTimer();
        visionSilenceStage = "none";
        audioQueue.push(ACTIVITY_START);
      } else if (msgType === "audio.activity_end") {
        audioQueue.push(ACTIVITY_END);
      } else if (msgType === "audio.stream_end") {
        audioQueue.push(AUDIO_STREAM_END);
      } else if (msgType === "input.text") {
        const text = String(payload.text ?? "").trim();
        if (!text) return;
        clearIdleTimer();
        visionSilenceStage = "none";
        safeSendJson(socket, { type: "transcript.user", text });
        audioQueue.push(new ClientTextEvent(text));
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
        const greetingSource = String(payload.source ?? "manual");
        console.info(`Vision session.greeting business=${slug} source=${greetingSource}`);
        if (greetingSource === "vision") {
          void (async () => {
            const hub = await ensureVisionHub(tenant.id, slug);
            if (!hub.sessionActive) {
              setKioskSessionActive(hub, true);
            }
          })();
        }
        void (async () => {
          const source = greetingSource;
          visionMode = source === "vision";
          if (visionMode) {
            visionSettingsCache = await getOrCreateVisionSettings(tenant.id);
          }
          const assistantName = resolveAssistantName(tenant.aiRules);
          const greetingPrompt = visionMode
            ? buildVisionGreetingPrompt(
                resolvedLanguage,
                tenant.name,
                assistantName,
                visionSettingsCache?.greetingTriggerMode ?? "presence",
                visionSettingsCache?.greetingScript,
              )
            : buildSessionGreetingPrompt(
                resolvedLanguage,
                tenant.name,
                assistantName,
                orderingEnabled,
              );
          audioQueue.push(new ClientTextEvent(greetingPrompt));
        })();
      } else if (msgType === "session.photo_offer") {
        // Legacy post-payment offer — kept for compatibility; preferred flow asks before name.
        const promptText = String(payload.prompt ?? "").trim();
        if (!promptText) return;
        clearIdleTimer();
        visionSilenceStage = "none";
        audioQueue.push(
          new ClientTextEvent(
            `Speak this photo invitation naturally in the conversation language, then wait for a short yes/no answer. Do not ask about anything else. Say: "${promptText.replace(/"/g, '\\"')}"`,
          ),
        );
      } else if (msgType === "session.photo_ready") {
        const promptText =
          String(payload.prompt ?? "").trim() || DEFAULT_PHOTO_READY_PROMPT;
        clearIdleTimer();
        visionSilenceStage = "none";
        audioQueue.push(
          new ClientTextEvent(
            `The customer just completed payment successfully and already agreed to a souvenir photo. ` +
              `Speak this short ready cue naturally in the conversation language, then stop and wait. ` +
              `Do not ask questions. Say: "${promptText.replace(/"/g, '\\"')}"`,
          ),
        );
      } else if (msgType === "session.goodbye") {
        void (async () => {
          if (completionScheduled) return;
          visionMode = true;
          if (!visionSettingsCache) {
            visionSettingsCache = await getOrCreateVisionSettings(tenant.id);
          }
          if (!completionScheduled) {
            audioQueue.push(
              new ClientTextEvent(
                buildVisionGoodbyePrompt(resolvedLanguage, visionSettingsCache!.goodbyeScript),
              ),
            );
          }
          completeConversation("vision_goodbye");
        })();
      } else if (
        orderingEnabled &&
        (msgType === "order.add_item" ||
          msgType === "order.decrement_item" ||
          msgType === "order.remove_item")
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
  await photoConfigPromise;

  const transcript = (restorePayload.transcript as Array<{ role?: string; text?: string }>) ?? [];
  let systemInstruction = buildSystemInstruction(tenant, query.language, {
    photoMomentEnabled: orderingEnabled && photoMomentEnabled,
    photoVoicePrompt,
  });
  if (transcript.length) {
    systemInstruction += buildTranscriptContext(transcript, resolvedLanguage);
  }

  if (orderingEnabled) {
    if (!safeSendJson(socket, { type: "order.updated", order: orderStore.snapshot() })) return;
  }

  try {
    // "connecting" was already sent. "connected" is emitted by Gemini setupComplete
    // inside startGeminiSession — do not claim ready before the live session exists.
    for await (const event of startGeminiSession(
      {
        apiKey: env.GEMINI_API_KEY,
        model: getGeminiModel(tenant),
        systemInstruction,
        orderStore,
        products: productList,
        orderingEnabled,
        bookingEnabled,
        faqEnabled,
        photoMomentEnabled,
        businessId: tenant.id,
        voiceSessionId,
        voiceName: getVoicePresetGeminiVoice(tenant.aiRules?.voicePreset),
        onConfirm,
        onSetCustomerName,
        onPhotoConsent,
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
        if (event.name === "end_conversation") {
          const result = event.result as Record<string, unknown> | undefined;
          const reason = String(result?.reason ?? "question_answered");
          completeConversation(reason);
          continue;
        }

        if (event.name === "set_photo_souvenir_consent") {
          const result = event.result as Record<string, unknown> | undefined;
          // May auto-confirm the order when photo was asked before confirm_order.
          if (result && typeof result === "object" && "order" in result) {
            safeSendJson(socket, {
              type: "order.updated",
              order: (result as Record<string, unknown>).order,
            });
          }
          continue;
        }

        if (event.name === "prompt_payment") {
          const result = event.result as Record<string, unknown> | undefined;
          if (result?.error) continue;
          if (result && typeof result === "object" && "order" in result) {
            safeSendJson(socket, {
              type: "order.updated",
              order: (result as Record<string, unknown>).order,
            });
          }
          if (photoMomentEnabled && photoSouvenirConsent === null) continue;
          const snap = orderStore.snapshot();
          if (snap.status === "confirmed") {
            if (String(snap.customer_name ?? "").trim()) {
              safeSendJson(socket, { type: "checkout.prompt_payment" });
            } else if (
              lastAssistantTurn &&
              isStandaloneCustomerNameAsk(lastAssistantTurn) &&
              !isCombinedCustomerNameAsk(lastAssistantTurn)
            ) {
              safeSendJson(socket, { type: "checkout.prompt_payment" });
            }
          }
          continue;
        }

        if (event.name === "set_customer_name") {
          const result = event.result as Record<string, unknown> | undefined;
          if (result?.error) continue;
          if (result && typeof result === "object" && "order" in result) {
            safeSendJson(socket, {
              type: "order.updated",
              order: (result as Record<string, unknown>).order,
            });
            if (result.success) {
              safeSendJson(socket, { type: "checkout.prompt_payment" });
            }
          }
          continue;
        }

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
        const role: TranscriptRole =
          eventType === "transcript.user" ? "user" : "assistant";
        let text = String(event.text ?? "");

        if (role === "assistant") {
          const verbalizedReason = parseVerbalizedEndConversation(text);
          text = stripVerbalizedToolCalls(text);
          if (verbalizedReason && faqEnabled) {
            completeConversation(verbalizedReason);
          }
          if (!text) continue;
        }

        transcriptBuffer.append(role, text);

        if (role === "assistant" && transcriptBuffer.has("user")) {
          const userText = transcriptBuffer.peek("user");
          if (!maybeCompleteAfterUserTurn(userText)) {
            void transcriptBuffer.flush("user", voiceSessionId);
          }
        }

        if (!safeSendJson(socket, { ...event, text })) break;

        if (role === "assistant") {
          lastAssistantTurn = transcriptBuffer.peek("assistant");
          maybeCorrectCombinedNameAsk();
        }

        if (role === "user" && maybeCompleteAfterUserTurn(transcriptBuffer.peek("user"))) {
          continue;
        }
        continue;
      }

      if (event.type === "turn_complete") {
        if (transcriptBuffer.has("assistant")) {
          const assistantText = stripVerbalizedToolCalls(transcriptBuffer.peek("assistant"));
          lastAssistantTurn = assistantText;
        }
        void transcriptBuffer.flush("assistant", voiceSessionId);
        if (maybeCompleteAfterUserTurn(transcriptBuffer.peek("user"))) {
          continue;
        }
        if (faqEnabled || visionMode) {
          scheduleIdleTimeout();
        }
        maybeCorrectCombinedNameAsk();
        maybePromptPaymentAfterNameAsk();
        safeSendJson(socket, { type: "turn_complete" });
        continue;
      }

      if (event.type === "interrupted") {
        if (transcriptBuffer.has("assistant")) {
          lastAssistantTurn = stripVerbalizedToolCalls(transcriptBuffer.peek("assistant"));
        }
        void transcriptBuffer.flush("assistant", voiceSessionId);
        maybeCorrectCombinedNameAsk();
        maybePromptPaymentAfterNameAsk();
      }

      if (!safeSendJson(socket, event)) break;
    }
  } catch (err) {
    console.error("Gemini session failed:", err);
    safeSendJson(socket, { type: "error", error: formatConnectionError(err) });
  } finally {
    clearIdleTimer();
    audioQueue.push(SHUTDOWN);
    await transcriptBuffer.flushAll(voiceSessionId);
    await endVoiceSession(voiceSessionId, endReason ?? (faqEnabled ? "disconnected" : null));
    safeSendJson(socket, { type: "session.status", status: "disconnected" });
    try {
      socket.close();
    } catch {
      // ignore
    }
  }
}
