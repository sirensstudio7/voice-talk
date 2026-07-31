import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  getAuthUserId,
  requireBusinessAccess,
  sendAuthError,
} from "../auth/jwt.js";
import { db } from "../db/client.js";
import {
  presentationAudioAssets,
  presentationFiles,
  presentationQuestions,
  presentations,
  presentationSessions,
  presentationSlides,
} from "../db/schema.js";
import { enqueuePresentationProcessing } from "../services/presentation-pipeline.js";
import {
  advanceSession,
  getSessionBundle,
  submitSessionQuestion,
} from "../services/presentation-session.js";
import { serializeUtcDatetime } from "../services/pricing.js";
import { detectPresentationFileType } from "../services/pptx-parser.js";
import {
  downloadFromStorage,
  MAX_PRESENTATION_UPLOAD_BYTES,
  PRESENTATION_BUCKET,
  uploadToStorage,
} from "../storage/index.js";

function presentationOut(row: typeof presentations.$inferSelect) {
  return {
    id: row.id,
    business_id: row.businessId,
    created_by: row.createdBy,
    title: row.title,
    description: row.description,
    language: row.language,
    category: row.category,
    status: row.status,
    processing_step: row.processingStep,
    processing_error: row.processingError,
    total_slides: row.totalSlides,
    estimated_duration: row.estimatedDuration,
    greeting_script: row.greetingScript,
    closing_script: row.closingScript,
    created_at: serializeUtcDatetime(row.createdAt),
    updated_at: serializeUtcDatetime(row.updatedAt),
  };
}

function fileOut(row: typeof presentationFiles.$inferSelect) {
  return {
    id: row.id,
    presentation_id: row.presentationId,
    file_name: row.fileName,
    file_type: row.fileType,
    size_bytes: row.sizeBytes,
    storage_path: row.storagePath,
    status: row.status,
    created_at: serializeUtcDatetime(row.createdAt),
  };
}

function slideOut(row: typeof presentationSlides.$inferSelect) {
  let content: unknown = {};
  try {
    content = JSON.parse(row.contentJson || "{}");
  } catch {
    content = {};
  }
  return {
    id: row.id,
    presentation_id: row.presentationId,
    slide_number: row.slideNumber,
    title: row.title,
    content,
    notes: row.notes,
    script: row.script,
    image_url: row.imageUrl,
    duration_seconds: row.durationSeconds,
  };
}

function sessionOut(row: typeof presentationSessions.$inferSelect) {
  return {
    id: row.id,
    presentation_id: row.presentationId,
    business_id: row.businessId,
    name: row.name,
    status: row.status,
    current_slide_number: row.currentSlideNumber,
    enable_qna: row.enableQna,
    auto_start: row.autoStart,
    audience_count: row.audienceCount,
    question_count: row.questionCount,
    started_at: row.startedAt ? serializeUtcDatetime(row.startedAt) : null,
    ended_at: row.endedAt ? serializeUtcDatetime(row.endedAt) : null,
    created_at: serializeUtcDatetime(row.createdAt),
    updated_at: serializeUtcDatetime(row.updatedAt),
  };
}

function questionOut(row: typeof presentationQuestions.$inferSelect) {
  let moderation: unknown = {};
  let sources: unknown = [];
  try {
    moderation = JSON.parse(row.moderationResult || "{}");
  } catch {
    moderation = {};
  }
  try {
    sources = JSON.parse(row.sourceReferences || "[]");
  } catch {
    sources = [];
  }
  return {
    id: row.id,
    session_id: row.sessionId,
    question: row.question,
    answer: row.answer,
    status: row.status,
    moderation_result: moderation,
    source_references: sources,
    created_at: serializeUtcDatetime(row.createdAt),
    answered_at: row.answeredAt ? serializeUtcDatetime(row.answeredAt) : null,
  };
}

async function loadPresentationForBusiness(businessId: string, presentationId: string) {
  const row = await db.query.presentations.findFirst({
    where: and(
      eq(presentations.id, presentationId),
      eq(presentations.businessId, businessId),
      isNull(presentations.deletedAt),
    ),
  });
  return row ?? null;
}

export async function registerPresentationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/businesses/:businessId/presentations", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await db
        .select()
        .from(presentations)
        .where(and(eq(presentations.businessId, businessId), isNull(presentations.deletedAt)))
        .orderBy(desc(presentations.updatedAt));
      return rows.map(presentationOut);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post("/admin/businesses/:businessId/presentations", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const userId = getAuthUserId(request);
      const body = request.body as Record<string, unknown>;
      const title = String(body.title ?? "").trim();
      if (!title) return reply.status(400).send({ detail: "Title is required" });

      const [row] = await db
        .insert(presentations)
        .values({
          businessId,
          createdBy: userId,
          title,
          description: String(body.description ?? ""),
          language: String(body.language ?? "en"),
          category: String(body.category ?? ""),
          status: "draft",
        })
        .returning();
      return reply.status(201).send(presentationOut(row!));
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/presentations/:presentationId", async (request, reply) => {
    try {
      const { businessId, presentationId } = request.params as {
        businessId: string;
        presentationId: string;
      };
      await requireBusinessAccess(request, businessId);
      const row = await loadPresentationForBusiness(businessId, presentationId);
      if (!row) return reply.status(404).send({ detail: "Presentation not found" });

      const files = await db
        .select()
        .from(presentationFiles)
        .where(eq(presentationFiles.presentationId, presentationId));
      const slides = await db
        .select()
        .from(presentationSlides)
        .where(eq(presentationSlides.presentationId, presentationId))
        .orderBy(presentationSlides.slideNumber);

      const slideIds = slides.map((s) => s.id);
      const audioForSlides =
        slideIds.length === 0
          ? []
          : await db
              .select()
              .from(presentationAudioAssets)
              .where(inArray(presentationAudioAssets.slideId, slideIds));

      const pptxFile = files.find((f) => f.fileType === "pptx");
      return {
        ...presentationOut(row),
        files: files.map(fileOut),
        slides: slides.map(slideOut),
        pptx_url: pptxFile?.storagePath ?? null,
        audio_assets: audioForSlides.map((a) => ({
          id: a.id,
          slide_id: a.slideId,
          kind: a.kind,
          provider: a.provider,
          storage_path: a.storagePath,
          duration_seconds: a.durationSeconds,
        })),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.patch("/admin/businesses/:businessId/presentations/:presentationId", async (request, reply) => {
    try {
      const { businessId, presentationId } = request.params as {
        businessId: string;
        presentationId: string;
      };
      await requireBusinessAccess(request, businessId);
      const row = await loadPresentationForBusiness(businessId, presentationId);
      if (!row) return reply.status(404).send({ detail: "Presentation not found" });
      const body = request.body as Record<string, unknown>;
      const updates: Partial<typeof presentations.$inferInsert> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = String(body.title);
      if (body.description !== undefined) updates.description = String(body.description);
      if (body.language !== undefined) updates.language = String(body.language);
      if (body.category !== undefined) updates.category = String(body.category);
      const [updated] = await db
        .update(presentations)
        .set(updates)
        .where(eq(presentations.id, presentationId))
        .returning();
      return presentationOut(updated!);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.delete("/admin/businesses/:businessId/presentations/:presentationId", async (request, reply) => {
    try {
      const { businessId, presentationId } = request.params as {
        businessId: string;
        presentationId: string;
      };
      await requireBusinessAccess(request, businessId);
      const row = await loadPresentationForBusiness(businessId, presentationId);
      if (!row) return reply.status(404).send({ detail: "Presentation not found" });
      await db
        .update(presentations)
        .set({ deletedAt: new Date(), status: "archived", updatedAt: new Date() })
        .where(eq(presentations.id, presentationId));
      return reply.status(204).send();
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/files",
    async (request, reply) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requireBusinessAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return reply.status(404).send({ detail: "Presentation not found" });

        const data = await request.file();
        if (!data) return reply.status(400).send({ detail: "File is required" });

        const buffer = await data.toBuffer();
        if (buffer.length > MAX_PRESENTATION_UPLOAD_BYTES) {
          return reply.status(400).send({ detail: "File exceeds 50MB limit" });
        }

        const fileType = detectPresentationFileType(data.filename, data.mimetype);
        if (!fileType) {
          return reply
            .status(400)
            .send({ detail: "Unsupported file type. Use PPTX, PDF, DOCX, or TXT." });
        }

        const objectPath = `${businessId}/${presentationId}/${randomUUID()}-${data.filename}`;
        const storagePath = await uploadToStorage(
          PRESENTATION_BUCKET,
          objectPath,
          buffer,
          data.mimetype || "application/octet-stream",
        );

        const [file] = await db
          .insert(presentationFiles)
          .values({
            presentationId,
            fileName: data.filename,
            fileType,
            sizeBytes: buffer.length,
            storagePath: storagePath.startsWith("http") || storagePath.startsWith("/")
              ? storagePath
              : objectPath,
            status: "uploaded",
          })
          .returning();

        await db
          .update(presentations)
          .set({ status: "draft", updatedAt: new Date() })
          .where(eq(presentations.id, presentationId));

        return reply.status(201).send(fileOut(file!));
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  /** Authenticated PPTX download for the in-browser deck viewer (avoids storage CORS issues). */
  app.get(
    "/admin/businesses/:businessId/presentations/:presentationId/pptx",
    async (request, reply) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requireBusinessAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return reply.status(404).send({ detail: "Presentation not found" });

        const files = await db
          .select()
          .from(presentationFiles)
          .where(eq(presentationFiles.presentationId, presentationId));
        const pptx = files.find((f) => f.fileType === "pptx");
        if (!pptx) return reply.status(404).send({ detail: "PPTX not found" });

        const buffer = await downloadFromStorage(PRESENTATION_BUCKET, pptx.storagePath);
        if (!buffer) return reply.status(404).send({ detail: "PPTX file missing from storage" });

        return reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          )
          .header("Content-Disposition", `inline; filename="${pptx.fileName || "deck.pptx"}"`)
          .header("Cache-Control", "private, max-age=86400")
          .send(buffer);
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  /** Authenticated audio stream for greeting / slide / closing narration. */
  app.get(
    "/admin/businesses/:businessId/presentations/:presentationId/audio/:assetId",
    async (request, reply) => {
      try {
        const { businessId, presentationId, assetId } = request.params as {
          businessId: string;
          presentationId: string;
          assetId: string;
        };
        await requireBusinessAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return reply.status(404).send({ detail: "Presentation not found" });

        const [asset] = await db
          .select()
          .from(presentationAudioAssets)
          .where(eq(presentationAudioAssets.id, assetId))
          .limit(1);
        if (!asset) return reply.status(404).send({ detail: "Audio not found" });

        // Greeting/closing/slide audio is anchored on a slide row for this deck.
        const [slide] = await db
          .select()
          .from(presentationSlides)
          .where(eq(presentationSlides.id, asset.slideId))
          .limit(1);
        if (!slide || slide.presentationId !== presentationId) {
          return reply.status(404).send({ detail: "Audio not found" });
        }

        const buffer = await downloadFromStorage(PRESENTATION_BUCKET, asset.storagePath);
        if (!buffer) {
          return reply.status(404).send({ detail: "Audio file missing from storage" });
        }

        return reply
          .header("Content-Type", "audio/wav")
          .header("Cache-Control", "private, max-age=3600")
          .header("Accept-Ranges", "bytes")
          .send(buffer);
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/process",
    async (request, reply) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requireBusinessAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return reply.status(404).send({ detail: "Presentation not found" });

        const files = await db
          .select()
          .from(presentationFiles)
          .where(eq(presentationFiles.presentationId, presentationId));
        if (files.length === 0) {
          return reply.status(400).send({ detail: "Upload a file before processing" });
        }

        await db
          .update(presentations)
          .set({
            status: "processing",
            processingStep: "queued",
            processingError: "",
            updatedAt: new Date(),
          })
          .where(eq(presentations.id, presentationId));

        enqueuePresentationProcessing(presentationId);
        const updated = await loadPresentationForBusiness(businessId, presentationId);
        return presentationOut(updated!);
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/regenerate-scripts",
    async (request, reply) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requireBusinessAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return reply.status(404).send({ detail: "Presentation not found" });
        enqueuePresentationProcessing(presentationId);
        return { ok: true };
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/sessions",
    async (request, reply) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requireBusinessAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return reply.status(404).send({ detail: "Presentation not found" });
        if (row.status !== "ready" && row.status !== "completed") {
          return reply
            .status(400)
            .send({ detail: "Presentation must be ready before launching a session" });
        }

        const body = (request.body ?? {}) as Record<string, unknown>;
        const [session] = await db
          .insert(presentationSessions)
          .values({
            presentationId,
            businessId,
            name: String(body.name ?? row.title),
            enableQna: body.enable_qna !== false,
            autoStart: body.auto_start !== false,
            status: "initializing",
          })
          .returning();

        if (session!.autoStart) {
          const started = await advanceSession(session!.id, "start");
          return reply.status(201).send(sessionOut(started!));
        }
        return reply.status(201).send(sessionOut(session!));
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  app.get("/admin/businesses/:businessId/sessions", async (request, reply) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await db
        .select()
        .from(presentationSessions)
        .where(eq(presentationSessions.businessId, businessId))
        .orderBy(desc(presentationSessions.createdAt));
      return rows.map(sessionOut);
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.get("/admin/businesses/:businessId/sessions/:sessionId", async (request, reply) => {
    try {
      const { businessId, sessionId } = request.params as {
        businessId: string;
        sessionId: string;
      };
      await requireBusinessAccess(request, businessId);
      const bundle = await getSessionBundle(sessionId);
      if (!bundle || bundle.session.businessId !== businessId) {
        return reply.status(404).send({ detail: "Session not found" });
      }

      const slideIds = bundle.slides.map((s) => s.id);
      const audio =
        slideIds.length === 0
          ? []
          : await db
              .select()
              .from(presentationAudioAssets)
              .where(inArray(presentationAudioAssets.slideId, slideIds));

      const files = await db
        .select()
        .from(presentationFiles)
        .where(eq(presentationFiles.presentationId, bundle.session.presentationId));
      const pptxFile = files.find((f) => f.fileType === "pptx");

      return {
        session: sessionOut(bundle.session),
        presentation: bundle.presentation ? presentationOut(bundle.presentation) : null,
        slides: bundle.slides.map(slideOut),
        questions: bundle.questions.map(questionOut),
        pptx_url: pptxFile?.storagePath ?? null,
        audio_assets: audio.map((a) => ({
          id: a.id,
          slide_id: a.slideId,
          kind: a.kind,
          storage_path: a.storagePath,
          duration_seconds: a.durationSeconds,
        })),
      };
    } catch (err) {
      return sendAuthError(reply, err);
    }
  });

  app.post(
    "/admin/businesses/:businessId/sessions/:sessionId/control",
    async (request, reply) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        const session = await db.query.presentationSessions.findFirst({
          where: eq(presentationSessions.id, sessionId),
        });
        if (!session || session.businessId !== businessId) {
          return reply.status(404).send({ detail: "Session not found" });
        }
        const body = request.body as { action?: string };
        const action = String(body.action ?? "");
        const allowed = ["start", "pause", "resume", "next", "previous", "end", "finish_stage"] as const;
        if (!allowed.includes(action as (typeof allowed)[number])) {
          return reply.status(400).send({ detail: "Invalid action" });
        }
        const updated = await advanceSession(sessionId, action as (typeof allowed)[number]);
        return sessionOut(updated!);
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/sessions/:sessionId/questions",
    async (request, reply) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        const session = await db.query.presentationSessions.findFirst({
          where: eq(presentationSessions.id, sessionId),
        });
        if (!session || session.businessId !== businessId) {
          return reply.status(404).send({ detail: "Session not found" });
        }
        const body = request.body as { question?: string };
        const question = String(body.question ?? "").trim();
        if (!question) return reply.status(400).send({ detail: "Question is required" });
        const row = await submitSessionQuestion(sessionId, question);
        return reply.status(201).send(questionOut(row!));
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  app.get(
    "/admin/businesses/:businessId/sessions/:sessionId/analytics",
    async (request, reply) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        const bundle = await getSessionBundle(sessionId);
        if (!bundle || bundle.session.businessId !== businessId) {
          return reply.status(404).send({ detail: "Session not found" });
        }
        const { session, questions, slides } = bundle;
        const started = session.startedAt?.getTime() ?? session.createdAt.getTime();
        const ended = session.endedAt?.getTime() ?? Date.now();
        const durationSeconds = Math.max(0, Math.round((ended - started) / 1000));
        const answered = questions.filter((q) => q.status === "answered").length;
        const blocked = questions.filter((q) => q.status === "blocked").length;
        const completionRate =
          session.status === "completed" ? 100 : slides.length === 0 ? 0 : Math.min(
            99,
            Math.round((session.currentSlideNumber / slides.length) * 100),
          );

        return {
          session_id: session.id,
          status: session.status,
          audience_count: session.audienceCount,
          question_count: session.questionCount,
          answered_count: answered,
          blocked_count: blocked,
          session_duration_seconds: durationSeconds,
          completion_rate: completionRate,
          total_slides: slides.length,
          current_slide_number: session.currentSlideNumber,
        };
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );

  // Public-ish audience question endpoint (token still required for MVP security)
  app.patch(
    "/admin/businesses/:businessId/sessions/:sessionId/audience-count",
    async (request, reply) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requireBusinessAccess(request, businessId);
        const body = request.body as { audience_count?: number };
        const [updated] = await db
          .update(presentationSessions)
          .set({
            audienceCount: Math.max(0, Number(body.audience_count ?? 0)),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(presentationSessions.id, sessionId),
              eq(presentationSessions.businessId, businessId),
            ),
          )
          .returning();
        if (!updated) return reply.status(404).send({ detail: "Session not found" });
        return sessionOut(updated);
      } catch (err) {
        return sendAuthError(reply, err);
      }
    },
  );
}
