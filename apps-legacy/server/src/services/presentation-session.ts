import { and, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  presentationEmbeddings,
  presentationQuestions,
  presentations,
  presentationSessions,
  presentationSlides,
} from "../db/schema.js";
import { answerPresentationQuestion } from "./presentation-ai.js";
import { moderateAudienceQuestion } from "./presentation-moderation.js";

export const SESSION_STATUSES = [
  "initializing",
  "greeting",
  "presenting",
  "paused",
  "closing",
  "qna_waiting",
  "thinking",
  "answering",
  "completed",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

async function touchSession(
  sessionId: string,
  patch: Partial<typeof presentationSessions.$inferInsert>,
) {
  const [row] = await db
    .update(presentationSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(presentationSessions.id, sessionId))
    .returning();
  return row;
}

export async function advanceSession(
  sessionId: string,
  action: "start" | "pause" | "resume" | "next" | "previous" | "end" | "finish_stage",
) {
  const session = await db.query.presentationSessions.findFirst({
    where: eq(presentationSessions.id, sessionId),
  });
  if (!session) throw Object.assign(new Error("Session not found"), { statusCode: 404 });

  const presentation = await db.query.presentations.findFirst({
    where: eq(presentations.id, session.presentationId),
  });
  if (!presentation) throw Object.assign(new Error("Presentation not found"), { statusCode: 404 });

  const slides = await db
    .select()
    .from(presentationSlides)
    .where(eq(presentationSlides.presentationId, session.presentationId))
    .orderBy(presentationSlides.slideNumber);

  if (action === "end") {
    await db
      .update(presentations)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(presentations.id, presentation.id));
    return touchSession(sessionId, { status: "completed", endedAt: new Date() });
  }

  if (action === "pause") {
    if (session.status === "presenting" || session.status === "greeting") {
      return touchSession(sessionId, { status: "paused" });
    }
    return session;
  }

  if (action === "resume") {
    if (session.status === "paused") {
      const nextStatus =
        session.currentSlideNumber > 0 ? "presenting" : "greeting";
      return touchSession(sessionId, { status: nextStatus });
    }
    return session;
  }

  if (action === "start") {
    await db
      .update(presentations)
      .set({ status: "live", updatedAt: new Date() })
      .where(eq(presentations.id, presentation.id));
    // Voice is streamed via Gemini Live on the client — no pre-generated WAVs.
    return touchSession(sessionId, {
      status: "greeting",
      currentSlideNumber: 0,
      startedAt: session.startedAt ?? new Date(),
    });
  }

  if (action === "next" || action === "finish_stage") {
    if (session.status === "greeting") {
      const first = slides[0];
      return touchSession(sessionId, {
        status: "presenting",
        currentSlideNumber: first?.slideNumber ?? 1,
      });
    }
    if (session.status === "presenting" || session.status === "paused") {
      const idx = slides.findIndex((s) => s.slideNumber === session.currentSlideNumber);
      const next = slides[idx + 1];
      if (next) {
        return touchSession(sessionId, {
          status: "presenting",
          currentSlideNumber: next.slideNumber,
        });
      }
      return touchSession(sessionId, { status: "closing" });
    }
    if (session.status === "closing") {
      if (session.enableQna) {
        return touchSession(sessionId, { status: "qna_waiting" });
      }
      await db
        .update(presentations)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(presentations.id, presentation.id));
      return touchSession(sessionId, { status: "completed", endedAt: new Date() });
    }
    if (session.status === "answering" || session.status === "thinking") {
      return touchSession(sessionId, { status: "qna_waiting" });
    }
    return session;
  }

  if (action === "previous") {
    if (session.status === "presenting" || session.status === "paused") {
      const idx = slides.findIndex((s) => s.slideNumber === session.currentSlideNumber);
      const prev = slides[idx - 1];
      if (prev) {
        return touchSession(sessionId, {
          status: "presenting",
          currentSlideNumber: prev.slideNumber,
        });
      }
      return touchSession(sessionId, { status: "greeting", currentSlideNumber: 0 });
    }
    return session;
  }

  return session;
}

export async function submitSessionQuestion(sessionId: string, questionText: string) {
  const session = await db.query.presentationSessions.findFirst({
    where: eq(presentationSessions.id, sessionId),
  });
  if (!session) throw Object.assign(new Error("Session not found"), { statusCode: 404 });
  if (!session.enableQna) {
    throw Object.assign(new Error("Q&A is disabled for this session"), { statusCode: 400 });
  }
  if (!["qna_waiting", "answering", "thinking"].includes(session.status) && session.status !== "completed") {
    // Allow questions once in Q&A stage primarily
    if (session.status !== "qna_waiting" && session.status !== "thinking" && session.status !== "answering") {
      throw Object.assign(new Error("Session is not accepting questions yet"), { statusCode: 400 });
    }
  }

  const moderation = moderateAudienceQuestion(questionText);
  const [question] = await db
    .insert(presentationQuestions)
    .values({
      sessionId,
      question: questionText.trim(),
      status: moderation.allowed ? "incoming" : "blocked",
      moderationResult: JSON.stringify(moderation),
    })
    .returning();

  await touchSession(sessionId, {
    questionCount: session.questionCount + 1,
  });

  if (!moderation.allowed || !question) {
    return question;
  }

  await touchSession(sessionId, { status: "thinking" });

  const presentation = await db.query.presentations.findFirst({
    where: eq(presentations.id, session.presentationId),
  });
  const chunks = await db
    .select()
    .from(presentationEmbeddings)
    .where(eq(presentationEmbeddings.presentationId, session.presentationId));

  const { answer, sources } = await answerPresentationQuestion({
    language: presentation?.language ?? "en",
    question: questionText,
    chunks: chunks.map((c) => ({
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      chunkText: c.chunkText,
    })),
  });

  const [updated] = await db
    .update(presentationQuestions)
    .set({
      answer,
      status: "answered",
      sourceReferences: JSON.stringify(sources),
      answeredAt: new Date(),
    })
    .where(eq(presentationQuestions.id, question.id))
    .returning();

  await touchSession(sessionId, { status: "answering" });
  // Return to waiting after answer is delivered (client calls finish_stage)
  return updated;
}

export async function getSessionBundle(sessionId: string) {
  const session = await db.query.presentationSessions.findFirst({
    where: eq(presentationSessions.id, sessionId),
  });
  if (!session) return null;

  const presentation = await db.query.presentations.findFirst({
    where: and(eq(presentations.id, session.presentationId)),
  });
  const slides = await db
    .select()
    .from(presentationSlides)
    .where(eq(presentationSlides.presentationId, session.presentationId))
    .orderBy(presentationSlides.slideNumber);
  const questions = await db
    .select()
    .from(presentationQuestions)
    .where(eq(presentationQuestions.sessionId, sessionId))
    .orderBy(presentationQuestions.createdAt);

  return { session, presentation, slides, questions };
}
