import { and, eq, ne } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  presentationAudioAssets,
  presentationEmbeddings,
  presentationFiles,
  presentations,
  presentationSlides,
} from "../db/schema.js";
import { downloadFromStorage, PRESENTATION_BUCKET, uploadToStorage } from "../storage/index.js";
import { logger } from "../http/logger.js";
import {
  buildDefaultGreetingClosing,
  buildTalkingPointsFromSlide,
  estimateScriptDurationSeconds,
  synthesizeSpeechWav,
} from "./presentation-ai.js";
import { parsePptxBuffer } from "./pptx-parser.js";
import { persistPresentationThumbnail } from "./presentation-thumbnail.js";
import { resolveGeminiApiKeyForBusiness } from "./user-api-keys.js";

const log = logger.child({ component: "presentation" });

const running = new Set<string>();
/** Soft-cancel flags — checked between pipeline steps. */
const cancelled = new Set<string>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function throwIfCancelled(presentationId: string): void {
  if (cancelled.has(presentationId)) {
    const err = new Error("Preparation cancelled") as Error & { cancelled?: boolean };
    err.cancelled = true;
    throw err;
  }
}

async function upsertStageAudio(input: {
  businessId: string;
  presentationId: string;
  slideId: string;
  kind: "greeting" | "closing";
  text: string;
}): Promise<boolean> {
  const text = input.text.trim();
  if (!text) return false;

  await db
    .delete(presentationAudioAssets)
    .where(
      and(
        eq(presentationAudioAssets.slideId, input.slideId),
        eq(presentationAudioAssets.kind, input.kind),
      ),
    );

  const tts = await synthesizeSpeechWav(
    text,
    undefined,
    undefined,
    await resolveGeminiApiKeyForBusiness(input.businessId),
  );
  if (!tts) return false;

  const path = `${input.businessId}/${input.presentationId}/audio/${input.kind}.wav`;
  const url = await uploadToStorage(PRESENTATION_BUCKET, path, tts.buffer, "audio/wav");
  await db.insert(presentationAudioAssets).values({
    slideId: input.slideId,
    kind: input.kind,
    provider: "gemini",
    storagePath: url.startsWith("http") || url.startsWith("/") ? url : path,
    durationSeconds: tts.durationSeconds,
  });
  return true;
}

/** Lazily create greeting/closing WAV if scripts exist but audio is missing.
 *
 * Dormant (TKT-010): live Gemini narration does not fetch these assets. Kept
 * for the TKT-007 fan-out/pre-render decision; remove with `ensureSlideAudio`
 * and `generateSlideScript` if live narration stays the design.
 */
export async function ensurePresentationStageAudio(presentationId: string): Promise<void> {
  const presentation = await db.query.presentations.findFirst({
    where: eq(presentations.id, presentationId),
  });
  if (!presentation) return;

  const slides = await db
    .select()
    .from(presentationSlides)
    .where(eq(presentationSlides.presentationId, presentationId))
    .orderBy(presentationSlides.slideNumber);
  const anchor = slides[0];
  if (!anchor) return;

  const existing = await db
    .select()
    .from(presentationAudioAssets)
    .where(eq(presentationAudioAssets.slideId, anchor.id));
  const hasGreeting = existing.some((a) => a.kind === "greeting");
  const hasClosing = existing.some((a) => a.kind === "closing");

  if (!hasGreeting && presentation.greetingScript.trim()) {
    const ok = await upsertStageAudio({
      businessId: presentation.businessId,
      presentationId,
      slideId: anchor.id,
      kind: "greeting",
      text: presentation.greetingScript,
    });
    if (!ok) {
      log.warn({ presentationId, kind: "greeting" }, "presentation.tts_failed");
    }
  }

  if (!hasClosing && presentation.closingScript.trim()) {
    const ok = await upsertStageAudio({
      businessId: presentation.businessId,
      presentationId,
      slideId: anchor.id,
      kind: "closing",
      text: presentation.closingScript,
    });
    if (!ok) {
      log.warn({ presentationId, kind: "closing" }, "presentation.tts_failed");
    }
  }
}

/** Lazily create a slide WAV if the script exists but audio is missing.
 *
 * Dormant (TKT-010): see `ensurePresentationStageAudio` above.
 */
export async function ensureSlideAudio(
  presentationId: string,
  slideId: string,
): Promise<boolean> {
  const presentation = await db.query.presentations.findFirst({
    where: eq(presentations.id, presentationId),
  });
  if (!presentation) return false;

  const slide = await db.query.presentationSlides.findFirst({
    where: and(
      eq(presentationSlides.id, slideId),
      eq(presentationSlides.presentationId, presentationId),
    ),
  });
  if (!slide?.script.trim()) return false;

  const existing = await db
    .select()
    .from(presentationAudioAssets)
    .where(
      and(
        eq(presentationAudioAssets.slideId, slide.id),
        eq(presentationAudioAssets.kind, "slide"),
      ),
    );
  if (existing[0]) return true;

  const tts = await synthesizeSpeechWav(
    slide.script,
    undefined,
    undefined,
    await resolveGeminiApiKeyForBusiness(presentation.businessId),
  );
  if (!tts) {
    log.warn({ presentationId, slideId, kind: "slide" }, "presentation.tts_failed");
    return false;
  }

  const path = `${presentation.businessId}/${presentationId}/audio/slide-${slide.slideNumber}.wav`;
  const url = await uploadToStorage(PRESENTATION_BUCKET, path, tts.buffer, "audio/wav");
  await db.insert(presentationAudioAssets).values({
    slideId: slide.id,
    kind: "slide",
    provider: "gemini",
    storagePath: url.startsWith("http") || url.startsWith("/") ? url : path,
    durationSeconds: tts.durationSeconds,
  });
  await db
    .update(presentationSlides)
    .set({ durationSeconds: tts.durationSeconds + 2 })
    .where(eq(presentationSlides.id, slide.id));
  return true;
}

export function enqueuePresentationProcessing(
  presentationId: string,
  opts?: { force?: boolean },
): void {
  if (running.has(presentationId)) {
    if (!opts?.force) return;
    log.info({ presentationId }, "presentation.requeued");
    cancelled.add(presentationId);
    running.delete(presentationId);
  }
  cancelled.delete(presentationId);
  running.add(presentationId);
  void processPresentation(presentationId)
    .catch((err) => {
      if (err && typeof err === "object" && "cancelled" in err) return;
      log.error({ err, presentationId }, "presentation.pipeline_failed");
    })
    .finally(() => {
      running.delete(presentationId);
      cancelled.delete(presentationId);
    });
}

/** Stop an in-flight Prepare job and revert the deck to draft. */
export async function cancelPresentationProcessing(presentationId: string): Promise<void> {
  cancelled.add(presentationId);
  running.delete(presentationId);
  await db
    .update(presentations)
    .set({
      status: "draft",
      processingStep: "",
      processingError: "Preparation stopped.",
      updatedAt: new Date(),
    })
    .where(eq(presentations.id, presentationId));
}

async function setStatus(
  presentationId: string,
  status: string,
  step: string,
  error = "",
): Promise<void> {
  await db
    .update(presentations)
    .set({
      status,
      processingStep: step,
      processingError: error,
      updatedAt: new Date(),
    })
    .where(eq(presentations.id, presentationId));
}

/** Index slide/file text for Q&A — runs after ready so Prepare is not blocked. */
async function indexPresentationContent(input: {
  presentationId: string;
  slides: Array<{
    id: string;
    title: string;
    contentJson: string;
    notes: string;
    script: string;
  }>;
  files: Array<{
    id: string;
    fileType: string;
    fileName: string;
    storagePath: string;
  }>;
}): Promise<void> {
  // Replace deck-derived chunks only — keep presentation knowledge embeddings.
  await db
    .delete(presentationEmbeddings)
    .where(
      and(
        eq(presentationEmbeddings.presentationId, input.presentationId),
        ne(presentationEmbeddings.sourceType, "knowledge"),
      ),
    );

  const chunks: Array<{
    presentationId: string;
    sourceType: string;
    sourceId: string;
    chunkText: string;
  }> = [];

  for (const slide of input.slides) {
    let texts: string[] = [];
    try {
      const content = JSON.parse(slide.contentJson || "{}") as { texts?: string[] };
      texts = content.texts ?? [];
    } catch {
      texts = [];
    }
    const body = [slide.title, ...texts, slide.notes, slide.script].filter(Boolean).join("\n");
    if (body.trim()) {
      chunks.push({
        presentationId: input.presentationId,
        sourceType: "ppt",
        sourceId: slide.id,
        chunkText: body,
      });
    }
    // Skip separate notes chunk when notes are already in the ppt body.
  }

  for (const file of input.files) {
    if (file.fileType === "pptx" || file.fileType === "ppt") continue;
    const fileBuf = await downloadFromStorage(PRESENTATION_BUCKET, file.storagePath);
    if (!fileBuf) continue;
    const text =
      file.fileType === "txt"
        ? fileBuf.toString("utf8").slice(0, 12000)
        : `[${file.fileType.toUpperCase()} file: ${file.fileName}]`;
    chunks.push({
      presentationId: input.presentationId,
      sourceType: file.fileType,
      sourceId: file.id,
      chunkText: text,
    });
  }

  if (chunks.length > 0) {
    await db.insert(presentationEmbeddings).values(chunks);
  }
}

function enqueueThumbnail(input: {
  businessId: string;
  presentationId: string;
  pptxBuffer: Buffer;
}): void {
  void persistPresentationThumbnail(input).catch((err) => {
    log.warn({ err, presentationId: input.presentationId }, "presentation.thumbnail_failed");
  });
}

async function processPresentation(presentationId: string): Promise<void> {
  // Move off "queued" immediately so a hung download/parse can't look stuck forever.
  await setStatus(presentationId, "processing", "parsing");
  throwIfCancelled(presentationId);

  try {
    const presentation = await db.query.presentations.findFirst({
      where: eq(presentations.id, presentationId),
    });
    if (!presentation || presentation.deletedAt) {
      throw new Error("Presentation not found");
    }
    throwIfCancelled(presentationId);

    const files = await db
      .select()
      .from(presentationFiles)
      .where(eq(presentationFiles.presentationId, presentationId));
    const primary =
      files.find((f) => f.fileType === "pptx") ??
      files.find((f) => f.fileType === "txt") ??
      files[0];
    if (!primary) {
      throw new Error("No presentation file uploaded");
    }

    const buffer = await withTimeout(
      downloadFromStorage(PRESENTATION_BUCKET, primary.storagePath),
      45_000,
      "download",
    );
    if (!buffer) throw new Error("Failed to download presentation file");
    throwIfCancelled(presentationId);

    let parsed =
      primary.fileType === "pptx"
        ? await withTimeout(parsePptxBuffer(buffer), 45_000, "parse")
        : [
            {
              slideNumber: 1,
              title: presentation.title || primary.fileName,
              texts: [buffer.toString("utf8").slice(0, 8000)],
              notes: "",
            },
          ];

    if (primary.fileType === "ppt") {
      throw new Error("Legacy .ppt is not supported. Please upload .pptx");
    }
    if (primary.fileType === "pdf" || primary.fileType === "docx") {
      const pptx = files.find((f) => f.fileType === "pptx");
      if (!pptx) {
        parsed = [
          {
            slideNumber: 1,
            title: presentation.title || primary.fileName,
            texts: [
              `Supporting document uploaded (${primary.fileType}). Add a PPTX for full slide parsing.`,
            ],
            notes: buffer.toString("utf8").slice(0, 4000),
          },
        ];
      } else {
        const downloaded = await withTimeout(
          downloadFromStorage(PRESENTATION_BUCKET, pptx.storagePath),
          45_000,
          "download",
        );
        if (!downloaded) throw new Error("Failed to download PPTX");
        parsed = await withTimeout(parsePptxBuffer(downloaded), 45_000, "parse");
      }
    }
    throwIfCancelled(presentationId);

    await setStatus(presentationId, "processing", "scripting");
    throwIfCancelled(presentationId);

    const { greeting, closing } = buildDefaultGreetingClosing({
      language: presentation.language,
      title: presentation.title,
    });

    const slideValues = parsed.map((slide) => {
      const script = buildTalkingPointsFromSlide({
        title: slide.title,
        texts: slide.texts,
        notes: slide.notes,
      });
      return {
        presentationId,
        slideNumber: slide.slideNumber,
        title: slide.title,
        contentJson: JSON.stringify({ texts: slide.texts }),
        notes: slide.notes,
        script,
        imageUrl: "",
        durationSeconds: estimateScriptDurationSeconds(script),
      };
    });

    await db.delete(presentationSlides).where(eq(presentationSlides.presentationId, presentationId));
    await db
      .delete(presentationEmbeddings)
      .where(
        and(
          eq(presentationEmbeddings.presentationId, presentationId),
          ne(presentationEmbeddings.sourceType, "knowledge"),
        ),
      );
    throwIfCancelled(presentationId);

    const insertedSlides =
      slideValues.length > 0
        ? await db.insert(presentationSlides).values(slideValues).returning()
        : [];

    throwIfCancelled(presentationId);

    const estimatedDuration = insertedSlides.reduce(
      (sum, s) => sum + (s.durationSeconds || 0),
      0,
    );

    await db
      .update(presentations)
      .set({
        status: "ready",
        processingStep: "completed",
        processingError: "",
        greetingScript: greeting,
        closingScript: closing,
        estimatedDuration,
        totalSlides: insertedSlides.length,
        updatedAt: new Date(),
      })
      .where(eq(presentations.id, presentationId));

    void indexPresentationContent({
      presentationId,
      slides: insertedSlides,
      files,
    }).catch((err) => {
      log.warn({ err, presentationId }, "presentation.indexing_failed");
    });

    const pptxFile = files.find((f) => f.fileType === "pptx");
    const pptxForThumb =
      primary.fileType === "pptx"
        ? buffer
        : pptxFile
          ? await downloadFromStorage(PRESENTATION_BUCKET, pptxFile.storagePath).catch(() => null)
          : null;
    if (pptxForThumb) {
      enqueueThumbnail({
        businessId: presentation.businessId,
        presentationId,
        pptxBuffer: pptxForThumb,
      });
    }
  } catch (err) {
    if (err && typeof err === "object" && "cancelled" in err) {
      // cancelPresentationProcessing already wrote draft status.
      return;
    }
    // If user cancelled while we were failing, keep the cancel state.
    if (cancelled.has(presentationId)) return;
    const message = err instanceof Error ? err.message : "Processing failed";
    await setStatus(presentationId, "failed", "failed", message);
  }
}
