import { randomUUID } from "node:crypto";
import { t, type Elysia } from "elysia";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  getAuthUserId,
  requireBusinessAccess,
  sendAuthError,
} from "../auth/jwt.js";
import { db } from "../db/client.js";
import { logger } from "../http/logger.js";
import {
  AI_PRESENTER_CODE,
  assertLanguageAllowed,
  hasActiveAddon,
} from "../services/addon-entitlement.js";
import {
  presentationAudioAssets,
  presentationFiles,
  presentationKnowledgeEntries,
  type presentationQuestions,
  presentations,
  presentationSessions,
  presentationSlides,
} from "../db/schema.js";
import {
  cancelPresentationProcessing,
  enqueuePresentationProcessing,
} from "../services/presentation-pipeline.js";
import {
  deleteKnowledgeEmbedding,
  listPresentationKnowledge,
  syncKnowledgeEmbedding,
} from "../services/presentation-knowledge.js";
import {
  advanceSession,
  getSessionBundle,
  submitSessionQuestion,
} from "../services/presentation-session.js";
import { serializeUtcDatetime } from "../services/pricing.js";
import {
  assertSharedPresenterActive,
  ensurePresentationShareToken,
  loadPresentationByShareToken,
  presentationSharePageUrl,
} from "../services/presentation-share.js";
import { transcribeAudienceQuestion } from "../services/presentation-ai.js";
import { resolveGeminiApiKeyForBusiness } from "../services/user-api-keys.js";
import { detectPresentationFileType } from "../services/pptx-parser.js";
import {
  enqueueMissingThumbnails,
  persistPresentationThumbnail,
} from "../services/presentation-thumbnail.js";
import {
  downloadFromStorage,
  MAX_PRESENTATION_UPLOAD_BYTES,
  PRESENTATION_BUCKET,
  uploadToStorage,
} from "../storage/index.js";
import { readUploadedFile } from "../http/multipart.js";
import { nonEmptyString, optionalBoolean, optionalNonEmptyString, optionalNumberLike, optionalString } from "../http/validation.js";

export const presentationCreateBody = t.Object({
  title: nonEmptyString,
  description: optionalString,
  language: optionalString,
  category: optionalString,
});

export const presentationUpdateBody = t.Object({
  title: optionalString,
  description: optionalString,
  language: optionalString,
  category: optionalString,
});

export const presentationSessionBody = t.Object({
  name: optionalString,
  enable_qna: optionalBoolean,
  auto_start: optionalBoolean,
});

export const presentationKnowledgeCreateBody = t.Object({
  title: optionalString,
  content: nonEmptyString,
  sort_order: optionalNumberLike,
});

export const presentationKnowledgeUpdateBody = t.Object({
  title: optionalString,
  content: optionalNonEmptyString,
  sort_order: optionalNumberLike,
});

export const sessionControlBody = t.Object({
  action: t.Union([
    t.Literal("start"),
    t.Literal("pause"),
    t.Literal("resume"),
    t.Literal("next"),
    t.Literal("previous"),
    t.Literal("end"),
    t.Literal("finish_stage"),
  ]),
});

export const sessionQuestionBody = t.Object({
  question: nonEmptyString,
});

export const sessionTranscribeBody = t.Object({
  audio_base64: nonEmptyString,
  mime_type: optionalString,
});

export const sessionAudienceCountBody = t.Object({
  audience_count: t.Optional(t.Number()),
});

async function requirePresenterAccess(
  request: Parameters<typeof requireBusinessAccess>[0],
  businessId: string,
): Promise<void> {
  await requireBusinessAccess(request, businessId);
  if (!(await hasActiveAddon(businessId, AI_PRESENTER_CODE))) {
    const err = new Error("AI Presenter add-on is not active") as Error & {
      statusCode: number;
    };
    err.statusCode = 403;
    throw err;
  }
}

async function transcribeQuestionAudio(
  businessId: string,
  language: string | null | undefined,
  body: { audio_base64?: string; mime_type?: string },
): Promise<string> {
  const audioBase64 = String(body.audio_base64 ?? "")
    .replace(/^data:.*?;base64,/, "")
    .trim();
  if (audioBase64.length < 80) {
    const err = new Error("Audio is too short") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  if (audioBase64.length > 4_000_000) {
    const err = new Error("Audio is too long") as Error & { statusCode: number };
    err.statusCode = 413;
    throw err;
  }
  const apiKey = await resolveGeminiApiKeyForBusiness(businessId);
  return transcribeAudienceQuestion({
    apiKey,
    language: language ?? "id",
    mimeType: String(body.mime_type ?? "audio/webm"),
    audioBase64,
  });
}

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
    thumbnail_url: row.thumbnailUrl || "",
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

function knowledgeOut(row: typeof presentationKnowledgeEntries.$inferSelect) {
  return {
    id: row.id,
    presentation_id: row.presentationId,
    title: row.title,
    content: row.content,
    sort_order: row.sortOrder,
    created_at: serializeUtcDatetime(row.createdAt),
    updated_at: serializeUtcDatetime(row.updatedAt),
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

export async function registerPresentationRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/presentations", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requirePresenterAccess(request, businessId);
      const rows = await db
        .select()
        .from(presentations)
        .where(and(eq(presentations.businessId, businessId), isNull(presentations.deletedAt)))
        .orderBy(desc(presentations.updatedAt));
      enqueueMissingThumbnails(rows);
      return rows.map(presentationOut);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/presentations", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requirePresenterAccess(request, businessId);
      const userId = getAuthUserId(request);
      const body = request.body;
      const title = body.title.trim();

      const [row] = await db
        .insert(presentations)
        .values({
          businessId,
          createdBy: userId,
          title,
          description: String(body.description ?? ""),
          language: await assertLanguageAllowed(businessId, String(body.language ?? "en")),
          category: String(body.category ?? ""),
          status: "draft",
        })
        .returning();
      return request.status(201, presentationOut(row!));
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: presentationCreateBody,
  });

  app.get("/admin/businesses/:businessId/presentations/:presentationId", async (request) => {
    try {
      const { businessId, presentationId } = request.params as {
        businessId: string;
        presentationId: string;
      };
      await requirePresenterAccess(request, businessId);
      const row = await loadPresentationForBusiness(businessId, presentationId);
      if (!row) return request.status(404, { detail: "Presentation not found" });

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

      const knowledge = await listPresentationKnowledge(presentationId);
      const pptxFile = files.find((f) => f.fileType === "pptx");
      return {
        ...presentationOut(row),
        files: files.map(fileOut),
        slides: slides.map(slideOut),
        knowledge: knowledge.map(knowledgeOut),
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
      return sendAuthError(request, err);
    }
  });

  app.get(
    "/admin/businesses/:businessId/presentations/:presentationId/knowledge",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });
        const knowledge = await listPresentationKnowledge(presentationId);
        return knowledge.map(knowledgeOut);
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/knowledge",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });

        const body = request.body;
        const content = body.content.trim();

        const [entry] = await db
          .insert(presentationKnowledgeEntries)
          .values({
            presentationId,
            title: String(body.title ?? "").trim(),
            content,
            sortOrder: Number(body.sort_order ?? 0),
          })
          .returning();

        await syncKnowledgeEmbedding(entry!);
        return request.status(201, knowledgeOut(entry!));
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
    {
      body: presentationKnowledgeCreateBody,
    },
  );

  app.patch(
    "/admin/businesses/:businessId/presentations/:presentationId/knowledge/:entryId",
    async (request) => {
      try {
        const { businessId, presentationId, entryId } = request.params as {
          businessId: string;
          presentationId: string;
          entryId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });

        const existing = await db.query.presentationKnowledgeEntries.findFirst({
          where: and(
            eq(presentationKnowledgeEntries.id, entryId),
            eq(presentationKnowledgeEntries.presentationId, presentationId),
          ),
        });
        if (!existing) return request.status(404, { detail: "Knowledge entry not found" });

        const body = request.body;
        const updates: Partial<typeof presentationKnowledgeEntries.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (body.title !== undefined) updates.title = String(body.title).trim();
        if (body.content !== undefined) updates.content = String(body.content).trim();
        if (body.sort_order !== undefined) updates.sortOrder = Number(body.sort_order);

        const [updated] = await db
          .update(presentationKnowledgeEntries)
          .set(updates)
          .where(eq(presentationKnowledgeEntries.id, entryId))
          .returning();

        await syncKnowledgeEmbedding(updated!);
        return knowledgeOut(updated!);
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
    {
      body: presentationKnowledgeUpdateBody,
    },
  );

  app.delete(
    "/admin/businesses/:businessId/presentations/:presentationId/knowledge/:entryId",
    async (request) => {
      try {
        const { businessId, presentationId, entryId } = request.params as {
          businessId: string;
          presentationId: string;
          entryId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });

        const existing = await db.query.presentationKnowledgeEntries.findFirst({
          where: and(
            eq(presentationKnowledgeEntries.id, entryId),
            eq(presentationKnowledgeEntries.presentationId, presentationId),
          ),
        });
        if (!existing) return request.status(404, { detail: "Knowledge entry not found" });

        await db
          .delete(presentationKnowledgeEntries)
          .where(eq(presentationKnowledgeEntries.id, entryId));
        await deleteKnowledgeEmbedding(presentationId, entryId);
        return request.status(204, );
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.patch("/admin/businesses/:businessId/presentations/:presentationId", async (request) => {
    try {
      const { businessId, presentationId } = request.params as {
        businessId: string;
        presentationId: string;
      };
      await requirePresenterAccess(request, businessId);
      const row = await loadPresentationForBusiness(businessId, presentationId);
      if (!row) return request.status(404, { detail: "Presentation not found" });
      const body = request.body;
      const updates: Partial<typeof presentations.$inferInsert> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = String(body.title);
      if (body.description !== undefined) updates.description = String(body.description);
      if (body.language !== undefined) {
        updates.language = await assertLanguageAllowed(businessId, String(body.language));
      }
      if (body.category !== undefined) updates.category = String(body.category);
      const [updated] = await db
        .update(presentations)
        .set(updates)
        .where(eq(presentations.id, presentationId))
        .returning();
      return presentationOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: presentationUpdateBody,
  });

  app.delete("/admin/businesses/:businessId/presentations/:presentationId", async (request) => {
    try {
      const { businessId, presentationId } = request.params as {
        businessId: string;
        presentationId: string;
      };
      await requirePresenterAccess(request, businessId);
      const row = await loadPresentationForBusiness(businessId, presentationId);
      if (!row) return request.status(404, { detail: "Presentation not found" });
      await db
        .update(presentations)
        .set({ deletedAt: new Date(), status: "archived", updatedAt: new Date() })
        .where(eq(presentations.id, presentationId));
      return request.status(204, );
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/files",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });

        const data = readUploadedFile(request.body);
        if (!data) return request.status(400, { detail: "File is required" });

        const buffer = await data.toBuffer();
        if (buffer.length > MAX_PRESENTATION_UPLOAD_BYTES) {
          return request.status(400, { detail: "File exceeds 50MB limit" });
        }

        const fileType = detectPresentationFileType(data.filename, data.mimetype);
        if (!fileType) {
          return request.status(400, { detail: "Unsupported file type. Use PPTX, PDF, DOCX, or TXT." });
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

        if (fileType === "pptx") {
          try {
            await persistPresentationThumbnail({
              businessId,
              presentationId,
              pptxBuffer: buffer,
            });
          } catch (thumbErr) {
            logger.warn(
              { err: thumbErr, presentationId },
              "presentation.thumbnail_failed",
            );
          }
        }

        return request.status(201, fileOut(file!));
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  /** Authenticated PPTX download for the in-browser deck viewer (avoids storage CORS issues). */
  app.get(
    "/admin/businesses/:businessId/presentations/:presentationId/pptx",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });

        const files = await db
          .select()
          .from(presentationFiles)
          .where(eq(presentationFiles.presentationId, presentationId));
        const pptx = files.find((f) => f.fileType === "pptx");
        if (!pptx) return request.status(404, { detail: "PPTX not found" });

        const buffer = await downloadFromStorage(PRESENTATION_BUCKET, pptx.storagePath);
        if (!buffer) return request.status(404, { detail: "PPTX file missing from storage" });

        return new Response(buffer as unknown as BodyInit, {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "Content-Disposition": `inline; filename="${pptx.fileName || "deck.pptx"}"`,
            "Cache-Control": "private, max-age=86400",
          },
        });
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  /** Authenticated audio stream for greeting / slide / closing narration. */
  app.get(
    "/admin/businesses/:businessId/presentations/:presentationId/audio/:assetId",
    async (request) => {
      try {
        const { businessId, presentationId, assetId } = request.params as {
          businessId: string;
          presentationId: string;
          assetId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });

        const [asset] = await db
          .select()
          .from(presentationAudioAssets)
          .where(eq(presentationAudioAssets.id, assetId))
          .limit(1);
        if (!asset) return request.status(404, { detail: "Audio not found" });

        // Greeting/closing/slide audio is anchored on a slide row for this deck.
        const [slide] = await db
          .select()
          .from(presentationSlides)
          .where(eq(presentationSlides.id, asset.slideId))
          .limit(1);
        if (!slide || slide.presentationId !== presentationId) {
          return request.status(404, { detail: "Audio not found" });
        }

        const buffer = await downloadFromStorage(PRESENTATION_BUCKET, asset.storagePath);
        if (!buffer) {
          return request.status(404, { detail: "Audio file missing from storage" });
        }

        return new Response(buffer as unknown as BodyInit, {
          headers: {
            "Content-Type": "audio/wav",
            "Cache-Control": "private, max-age=3600",
            "Accept-Ranges": "bytes",
          },
        });
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/process",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });

        const files = await db
          .select()
          .from(presentationFiles)
          .where(eq(presentationFiles.presentationId, presentationId));
        if (files.length === 0) {
          return request.status(400, { detail: "Upload a file before processing" });
        }

        await db
          .update(presentations)
          .set({
            status: "processing",
            processingStep: "parsing",
            processingError: "",
            updatedAt: new Date(),
          })
          .where(eq(presentations.id, presentationId));

        enqueuePresentationProcessing(presentationId, { force: true });
        const updated = await loadPresentationForBusiness(businessId, presentationId);
        return presentationOut(updated!);
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/process/cancel",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });

        await cancelPresentationProcessing(presentationId);
        const updated = await loadPresentationForBusiness(businessId, presentationId);
        return presentationOut(updated!);
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/regenerate-scripts",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });
        enqueuePresentationProcessing(presentationId);
        return { ok: true };
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/sessions",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });
        if (row.status !== "ready" && row.status !== "completed") {
          return request.status(400, { detail: "Presentation must be ready before launching a session" });
        }

        const body = request.body;
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
          return request.status(201, sessionOut(started!));
        }
        return request.status(201, sessionOut(session!));
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
    {
      body: presentationSessionBody,
    },
  );

  app.get("/admin/businesses/:businessId/sessions", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requirePresenterAccess(request, businessId);
      const rows = await db
        .select()
        .from(presentationSessions)
        .where(eq(presentationSessions.businessId, businessId))
        .orderBy(desc(presentationSessions.createdAt));
      return rows.map(sessionOut);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.get("/admin/businesses/:businessId/sessions/:sessionId", async (request) => {
    try {
      const { businessId, sessionId } = request.params as {
        businessId: string;
        sessionId: string;
      };
      await requirePresenterAccess(request, businessId);
      const bundle = await getSessionBundle(sessionId);
      if (!bundle || bundle.session.businessId !== businessId) {
        return request.status(404, { detail: "Session not found" });
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
      return sendAuthError(request, err);
    }
  });

  app.post(
    "/admin/businesses/:businessId/sessions/:sessionId/control",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requirePresenterAccess(request, businessId);
        const session = await db.query.presentationSessions.findFirst({
          where: eq(presentationSessions.id, sessionId),
        });
        if (!session || session.businessId !== businessId) {
          return request.status(404, { detail: "Session not found" });
        }
        const body = request.body;
        const updated = await advanceSession(sessionId, body.action);
        return sessionOut(updated!);
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
    {
      body: sessionControlBody,
    },
  );

  app.post(
    "/admin/businesses/:businessId/sessions/:sessionId/questions",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requirePresenterAccess(request, businessId);
        const session = await db.query.presentationSessions.findFirst({
          where: eq(presentationSessions.id, sessionId),
        });
        if (!session || session.businessId !== businessId) {
          return request.status(404, { detail: "Session not found" });
        }
        const body = request.body;
        const question = body.question.trim();
        if (!question) return request.status(400, { detail: "Question is required" });
        const row = await submitSessionQuestion(sessionId, question);
        return request.status(201, questionOut(row!));
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
    {
      body: sessionQuestionBody,
    },
  );

  app.post(
    "/admin/businesses/:businessId/sessions/:sessionId/transcribe",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requirePresenterAccess(request, businessId);
        const session = await db.query.presentationSessions.findFirst({
          where: eq(presentationSessions.id, sessionId),
        });
        if (!session || session.businessId !== businessId) {
          return request.status(404, { detail: "Session not found" });
        }
        const presentation = await db.query.presentations.findFirst({
          where: eq(presentations.id, session.presentationId),
        });
        const text = await transcribeQuestionAudio(
          businessId,
          presentation?.language,
          request.body,
        );
        return { text };
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
    {
      body: sessionTranscribeBody,
    },
  );

  app.get(
    "/admin/businesses/:businessId/sessions/:sessionId/analytics",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requirePresenterAccess(request, businessId);
        const bundle = await getSessionBundle(sessionId);
        if (!bundle || bundle.session.businessId !== businessId) {
          return request.status(404, { detail: "Session not found" });
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
        return sendAuthError(request, err);
      }
    },
  );

  // Public-ish audience question endpoint (token still required for MVP security)
  app.patch(
    "/admin/businesses/:businessId/sessions/:sessionId/audience-count",
    async (request) => {
      try {
        const { businessId, sessionId } = request.params as {
          businessId: string;
          sessionId: string;
        };
        await requirePresenterAccess(request, businessId);
        const body = request.body;
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
        if (!updated) return request.status(404, { detail: "Session not found" });
        return sessionOut(updated);
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
    {
      body: sessionAudienceCountBody,
    },
  );

  app.post(
    "/admin/businesses/:businessId/presentations/:presentationId/share",
    async (request) => {
      try {
        const { businessId, presentationId } = request.params as {
          businessId: string;
          presentationId: string;
        };
        await requirePresenterAccess(request, businessId);
        const row = await loadPresentationForBusiness(businessId, presentationId);
        if (!row) return request.status(404, { detail: "Presentation not found" });
        if (row.status !== "ready" && row.status !== "completed") {
          return request.status(400, { detail: "Prepare the presentation before sharing it" });
        }
        const shared = await ensurePresentationShareToken(presentationId);
        if (!shared?.shareToken) {
          return request.status(500, { detail: "Could not create a share link" });
        }
        return {
          share_token: shared.shareToken,
          share_url: presentationSharePageUrl(shared.shareToken),
        };
      } catch (err) {
        return sendAuthError(request, err);
      }
    },
  );

  app.get("/public/presentations/share/:token", async (request) => {
    const { token } = request.params as { token: string };
    const row = await loadPresentationByShareToken(token);
    if (!row) return request.status(404, { detail: "Share link not found" });
    if (row.status !== "ready" && row.status !== "completed") {
      return request.status(409, { detail: "This presentation is not ready yet" });
    }
    try {
      await assertSharedPresenterActive(row.businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
    return {
      title: row.title,
      description: row.description,
      language: row.language,
      total_slides: row.totalSlides,
      estimated_duration: row.estimatedDuration,
      thumbnail_url: row.thumbnailUrl || "",
    };
  });

  app.get("/public/presentations/share/:token/pptx", async (request) => {
    const { token } = request.params as { token: string };
    const row = await loadPresentationByShareToken(token);
    if (!row) return request.status(404, { detail: "Share link not found" });
    const files = await db
      .select()
      .from(presentationFiles)
      .where(eq(presentationFiles.presentationId, row.id));
    const pptx = files.find((f) => f.fileType === "pptx");
    if (!pptx) return request.status(404, { detail: "PPTX not found" });
    const buffer = await downloadFromStorage(PRESENTATION_BUCKET, pptx.storagePath);
    if (!buffer) return request.status(404, { detail: "PPTX file missing from storage" });

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `inline; filename="${pptx.fileName || "deck.pptx"}"`,
      },
    });
  });

  app.post("/public/presentations/share/:token/start", async (request) => {
    const { token } = request.params as { token: string };
    const row = await loadPresentationByShareToken(token);
    if (!row) return request.status(404, { detail: "Share link not found" });
    if (row.status !== "ready" && row.status !== "completed") {
      return request.status(409, { detail: "This presentation is not ready yet" });
    }
    try {
      await assertSharedPresenterActive(row.businessId);
    } catch (err) {
      return sendAuthError(request, err);
    }
    const [session] = await db
      .insert(presentationSessions)
      .values({
        presentationId: row.id,
        businessId: row.businessId,
        name: row.title,
        enableQna: true,
        autoStart: true,
        status: "initializing",
      })
      .returning();
    const started = session!.autoStart
      ? await advanceSession(session!.id, "start")
      : session!;
    return request.status(201, sessionOut(started!));
  });

  app.get(
    "/public/presentations/share/:token/sessions/:sessionId",
    async (request) => {
      const { token, sessionId } = request.params as { token: string; sessionId: string };
      const row = await loadPresentationByShareToken(token);
      if (!row) return request.status(404, { detail: "Share link not found" });
      const bundle = await getSessionBundle(sessionId);
      if (!bundle || bundle.session.presentationId !== row.id) {
        return request.status(404, { detail: "Session not found" });
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
    },
  );

  app.post(
    "/public/presentations/share/:token/sessions/:sessionId/control",
    async (request) => {
      const { token, sessionId } = request.params as { token: string; sessionId: string };
      const row = await loadPresentationByShareToken(token);
      if (!row) return request.status(404, { detail: "Share link not found" });
      const session = await db.query.presentationSessions.findFirst({
        where: eq(presentationSessions.id, sessionId),
      });
      if (!session || session.presentationId !== row.id) {
        return request.status(404, { detail: "Session not found" });
      }
      const body = request.body;
      const updated = await advanceSession(sessionId, body.action);
      return sessionOut(updated!);
    },
    {
      body: sessionControlBody,
    },
  );

  app.post(
    "/public/presentations/share/:token/sessions/:sessionId/questions",
    async (request) => {
      const { token, sessionId } = request.params as { token: string; sessionId: string };
      const row = await loadPresentationByShareToken(token);
      if (!row) return request.status(404, { detail: "Share link not found" });
      const session = await db.query.presentationSessions.findFirst({
        where: eq(presentationSessions.id, sessionId),
      });
      if (!session || session.presentationId !== row.id) {
        return request.status(404, { detail: "Session not found" });
      }
      const body = request.body;
      const question = body.question.trim();
      if (!question) return request.status(400, { detail: "Question is required" });
      const created = await submitSessionQuestion(sessionId, question);
      return request.status(201, questionOut(created!));
    },
    {
      body: sessionQuestionBody,
    },
  );

  app.post(
    "/public/presentations/share/:token/sessions/:sessionId/transcribe",
    async (request) => {
      const { token, sessionId } = request.params as { token: string; sessionId: string };
      const row = await loadPresentationByShareToken(token);
      if (!row) return request.status(404, { detail: "Share link not found" });
      const session = await db.query.presentationSessions.findFirst({
        where: eq(presentationSessions.id, sessionId),
      });
      if (!session || session.presentationId !== row.id) {
        return request.status(404, { detail: "Session not found" });
      }
      try {
        const text = await transcribeQuestionAudio(
          row.businessId,
          row.language,
          request.body,
        );
        return { text };
      } catch (err) {
        const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
        return request.status(status, {
          detail: err instanceof Error ? err.message : "Transcription failed",
        });
      }
    },
    {
      body: sessionTranscribeBody,
    },
  );

  app.get(
    "/public/presentations/share/:token/sessions/:sessionId/analytics",
    async (request) => {
      const { token, sessionId } = request.params as { token: string; sessionId: string };
      const row = await loadPresentationByShareToken(token);
      if (!row) return request.status(404, { detail: "Share link not found" });
      const bundle = await getSessionBundle(sessionId);
      if (!bundle || bundle.session.presentationId !== row.id) {
        return request.status(404, { detail: "Session not found" });
      }
      const { session, questions, slides } = bundle;
      const started = session.startedAt?.getTime() ?? session.createdAt.getTime();
      const ended = session.endedAt?.getTime() ?? Date.now();
      const durationSeconds = Math.max(0, Math.round((ended - started) / 1000));
      const answered = questions.filter((q) => q.status === "answered").length;
      const blocked = questions.filter((q) => q.status === "blocked").length;
      const completionRate =
        session.status === "completed"
          ? 100
          : slides.length === 0
            ? 0
            : Math.min(99, Math.round((session.currentSlideNumber / slides.length) * 100));
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
    },
  );
}
