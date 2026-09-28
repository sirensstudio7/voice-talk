import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { and, eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { getVoicePresetGeminiVoice } from "@voicetalk/shared";

import { env } from "../env.js";
import { db } from "../db/client.js";
import {
  aiRules,
  businessMembers,
  presentationKnowledgeEntries,
  presentationSessions,
  presentationSlides,
  presentations,
} from "../db/schema.js";
import { AI_PRESENTER_CODE, hasActiveAddon } from "../services/addon-entitlement.js";
import {
  PRESENTER_SHUTDOWN,
  createTextQueue,
  runPresenterLiveSession,
  type PresenterCueMode,
} from "../services/presenter-live.js";
import { resolveGeminiApiKeyForBusiness } from "../services/user-api-keys.js";
import {
  assertSharedPresenterActive,
  loadPresentationByShareToken,
} from "../services/presentation-share.js";

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

function verifyUserIdFromToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as {
    sub?: string;
  };
  if (!payload.sub) throw new Error("Invalid token");
  return payload.sub;
}

async function assertBusinessMember(userId: string, businessId: string): Promise<void> {
  const [row] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(eq(businessMembers.userId, userId), eq(businessMembers.businessId, businessId)),
    )
    .limit(1);
  if (!row) throw new Error("No access to this business");
}

const STYLE_TITLE_RE =
  /\b(style|tone|delivery|presenting|presenter|speaking|cara\s*present|gaya|nada|penyampaian)\b/i;

function formatKnowledgeBlock(
  entries: Array<{ title: string; content: string }>,
  emptyLabel: string,
): string {
  if (entries.length === 0) return emptyLabel;
  return entries
    .map((k, i) => {
      const heading = k.title.trim() || `Note ${i + 1}`;
      return `### ${heading}\n${k.content.trim()}`;
    })
    .join("\n\n");
}

/** Split deck knowledge into delivery-style notes vs factual notes. */
export function splitPresentationKnowledge(
  knowledge: Array<{ title: string; content: string }>,
): {
  style: Array<{ title: string; content: string }>;
  facts: Array<{ title: string; content: string }>;
} {
  const style: Array<{ title: string; content: string }> = [];
  const facts: Array<{ title: string; content: string }> = [];
  for (const entry of knowledge) {
    const title = entry.title.trim();
    const content = entry.content.trim();
    if (!content) continue;
    if (STYLE_TITLE_RE.test(title) || STYLE_TITLE_RE.test(content.slice(0, 120))) {
      style.push({ title, content });
    } else {
      facts.push({ title, content });
    }
  }
  return { style, facts };
}

function buildPresenterSystemInstruction(input: {
  language: string;
  title: string;
  knowledge: Array<{ title: string; content: string }>;
}): string {
  const { style, facts } = splitPresentationKnowledge(input.knowledge);
  const styleBlock = formatKnowledgeBlock(
    style,
    "(none — use a warm, confident human presenting style by default)",
  );
  const factsBlock = formatKnowledgeBlock(facts, "(none)");

  return `You are a live AI presenter for the deck "${input.title}".
Language: ${input.language === "id" ? "Indonesian" : "English"}.

## How to present (important)
- Sound like a human presenter on stage — conversational, confident, and engaging.
- Do NOT recite the slide script word-for-word like reading a document.
- Treat each slide script as talking points / outline. Paraphrase in your own words.
- Keep every key fact, number, name, and claim from the script — do not invent or drop them.
- Use short spoken sentences, natural pacing, light emphasis, and brief connective phrases.
- Do not ask the audience questions during slide narration. Stop when the slide is covered.
- Follow any Delivery style notes below over the default tone.
- Never apologize or say you made a mistake. Never announce a correction.
- Never go back to a previous slide or re-read it unless the cue says that slide.
- When told to continue, pick up mid-segment. Do not restart from the beginning.

## Delivery style (from presentation knowledge)
${styleBlock}

## Deck facts (accuracy for Q&A and consistency)
${factsBlock}`;
}

export async function registerPresentationWebSocketRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/ws/presentation-session", { websocket: true }, (socket, request) => {
    void handlePresenterSession(socket, request.query as Record<string, string | undefined>);
  });
}

async function handlePresenterSession(
  socket: WebSocket,
  query: { token?: string; shareToken?: string; businessId?: string; sessionId?: string },
): Promise<void> {
  const token = String(query.token ?? "").trim();
  const shareToken = String(query.shareToken ?? "").trim();
  const businessId = String(query.businessId ?? "").trim();
  const sessionId = String(query.sessionId ?? "").trim();

  if ((!token && !shareToken) || !businessId || !sessionId) {
    safeSendJson(socket, {
      type: "error",
      error: "token or shareToken, businessId, and sessionId are required",
    });
    socket.close();
    return;
  }

  const geminiApiKey = await resolveGeminiApiKeyForBusiness(businessId);
  if (!geminiApiKey) {
    safeSendJson(socket, { type: "error", error: "GEMINI_API_KEY is not configured." });
    socket.close();
    return;
  }

  let sharedPresentationId: string | null = null;
  try {
    if (shareToken) {
      const shared = await loadPresentationByShareToken(shareToken);
      if (!shared || shared.businessId !== businessId) {
        throw new Error("Invalid share link");
      }
      await assertSharedPresenterActive(businessId);
      sharedPresentationId = shared.id;
    } else {
      const userId = verifyUserIdFromToken(token);
      await assertBusinessMember(userId, businessId);
      if (!(await hasActiveAddon(businessId, AI_PRESENTER_CODE))) {
        throw new Error("AI Presenter add-on is not active");
      }
    }
  } catch (err) {
    safeSendJson(socket, {
      type: "error",
      error: err instanceof Error ? err.message : "Unauthorized",
    });
    socket.close();
    return;
  }

  const session = await db.query.presentationSessions.findFirst({
    where: and(
      eq(presentationSessions.id, sessionId),
      eq(presentationSessions.businessId, businessId),
    ),
  });
  if (!session || (sharedPresentationId && session.presentationId !== sharedPresentationId)) {
    safeSendJson(socket, { type: "error", error: "Session not found" });
    socket.close();
    return;
  }

  const presentation = await db.query.presentations.findFirst({
    where: eq(presentations.id, session.presentationId),
  });
  if (!presentation) {
    safeSendJson(socket, { type: "error", error: "Presentation not found" });
    socket.close();
    return;
  }

  const [knowledge, slides, rules] = await Promise.all([
    db
      .select()
      .from(presentationKnowledgeEntries)
      .where(eq(presentationKnowledgeEntries.presentationId, presentation.id))
      .orderBy(presentationKnowledgeEntries.sortOrder),
    db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.presentationId, presentation.id))
      .orderBy(presentationSlides.slideNumber),
    db.query.aiRules.findFirst({ where: eq(aiRules.businessId, businessId) }),
  ]);

  const textQueue = createTextQueue();
  let closed = false;

  socket.on("message", (raw) => {
    if (closed) return;
    try {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      const msg = JSON.parse(text) as {
        type?: string;
        text?: string;
        mode?: string;
        label?: string;
      };
      if (msg.type === "speak") {
        const script = String(msg.text ?? "").trim();
        if (!script) return;
        const mode: PresenterCueMode =
          msg.mode === "continue" || msg.mode === "stage" ? msg.mode : "slide";
        textQueue.push({
          text: script,
          mode,
          label: String(msg.label ?? "").trim() || undefined,
        });
        return;
      }
      if (msg.type === "close") {
        textQueue.push(PRESENTER_SHUTDOWN);
      }
    } catch (err) {
      console.warn("[presentation-ws] bad client message", err);
    }
  });

  socket.on("close", () => {
    closed = true;
    textQueue.push(PRESENTER_SHUTDOWN);
  });

  safeSendJson(socket, { type: "session.status", status: "connecting" });

  const slideOutline = slides
    .map((s) => `${s.slideNumber}. ${s.title || "Untitled"}`)
    .join("\n");

  const systemInstruction =
    buildPresenterSystemInstruction({
      language: presentation.language || "en",
      title: presentation.title,
      knowledge: knowledge.map((k) => ({ title: k.title, content: k.content })),
    }) + (slideOutline ? `\n\nSlide outline:\n${slideOutline}` : "");

  try {
    await runPresenterLiveSession({
      apiKey: geminiApiKey,
      systemInstruction,
      voiceName: getVoicePresetGeminiVoice(rules?.voicePreset, rules?.voiceGender),
      textQueue: textQueue.iterable,
      onAudio: (pcm) => {
        if (socket.readyState === socket.OPEN) socket.send(pcm);
      },
      onEvent: (event) => {
        safeSendJson(socket, event);
      },
    });
  } catch (err) {
    console.error("[presentation-ws] live session failed", err);
    safeSendJson(socket, {
      type: "error",
      error: err instanceof Error ? err.message : "Live session failed",
    });
  } finally {
    closed = true;
    try {
      socket.close();
    } catch {
      // ignore
    }
  }
}
