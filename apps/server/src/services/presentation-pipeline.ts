import { and, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import {
  presentationAudioAssets,
  presentationEmbeddings,
  presentationFiles,
  presentations,
  presentationSlides,
} from "../db/schema.js";
import { downloadFromStorage, PRESENTATION_BUCKET, uploadToStorage } from "../storage/index.js";
import {
  estimateScriptDurationSeconds,
  generateGreetingClosing,
  generateSlideScript,
  synthesizeSpeechWav,
} from "./presentation-ai.js";
import { parsePptxBuffer } from "./pptx-parser.js";

const running = new Set<string>();

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

  const tts = await synthesizeSpeechWav(text);
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

/** Lazily create greeting/closing WAV if scripts exist but audio is missing. */
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
      console.warn("[presentation-pipeline] ensure greeting TTS failed", presentationId);
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
      console.warn("[presentation-pipeline] ensure closing TTS failed", presentationId);
    }
  }
}

export function enqueuePresentationProcessing(presentationId: string): void {
  if (running.has(presentationId)) return;
  running.add(presentationId);
  void processPresentation(presentationId)
    .catch((err) => {
      console.error("[presentation-pipeline]", presentationId, err);
    })
    .finally(() => {
      running.delete(presentationId);
    });
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

async function processPresentation(presentationId: string): Promise<void> {
  const presentation = await db.query.presentations.findFirst({
    where: eq(presentations.id, presentationId),
  });
  if (!presentation || presentation.deletedAt) return;

  try {
    await setStatus(presentationId, "processing", "parsing");

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

    const buffer = await downloadFromStorage(PRESENTATION_BUCKET, primary.storagePath);
    if (!buffer) throw new Error("Failed to download presentation file");

    let parsed =
      primary.fileType === "pptx"
        ? await parsePptxBuffer(buffer)
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
      // Supporting docs: store as knowledge chunks; require a PPTX for slides when possible.
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
        const downloaded = await downloadFromStorage(PRESENTATION_BUCKET, pptx.storagePath);
        if (!downloaded) throw new Error("Failed to download PPTX");
        parsed = await parsePptxBuffer(downloaded);
      }
    }

    await db.delete(presentationSlides).where(eq(presentationSlides.presentationId, presentationId));
    await db
      .delete(presentationEmbeddings)
      .where(eq(presentationEmbeddings.presentationId, presentationId));

    for (const slide of parsed) {
      await db.insert(presentationSlides).values({
        presentationId,
        slideNumber: slide.slideNumber,
        title: slide.title,
        contentJson: JSON.stringify({ texts: slide.texts }),
        notes: slide.notes,
        script: "",
        imageUrl: "",
        durationSeconds: 0,
      });
    }

    // Live/preview play the real PPTX in-browser. No server PNG render (that step hung / OOMed).

    await db
      .update(presentations)
      .set({
        totalSlides: parsed.length,
        updatedAt: new Date(),
      })
      .where(eq(presentations.id, presentationId));

    await setStatus(presentationId, "processing", "scripting");

    const { greeting, closing } = await generateGreetingClosing({
      language: presentation.language,
      title: presentation.title,
      description: presentation.description,
    });

    const slideRows = await db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.presentationId, presentationId))
      .orderBy(presentationSlides.slideNumber);

    let previousSummary = "";
    for (const slide of slideRows) {
      const content = JSON.parse(slide.contentJson || "{}") as { texts?: string[] };
      const texts = content.texts ?? [];
      const script = await generateSlideScript({
        language: presentation.language,
        presentationTitle: presentation.title,
        slideNumber: slide.slideNumber,
        totalSlides: slideRows.length,
        title: slide.title,
        texts,
        notes: slide.notes,
        previousSummary,
      });
      const durationSeconds = estimateScriptDurationSeconds(script);
      await db
        .update(presentationSlides)
        .set({ script, durationSeconds })
        .where(eq(presentationSlides.id, slide.id));
      previousSummary = `${slide.title}: ${script.slice(0, 160)}`;
    }

    await db
      .update(presentations)
      .set({
        greetingScript: greeting,
        closingScript: closing,
        updatedAt: new Date(),
      })
      .where(eq(presentations.id, presentationId));

    await setStatus(presentationId, "processing", "voicing");

    const refreshedSlides = await db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.presentationId, presentationId))
      .orderBy(presentationSlides.slideNumber);

    // Greeting/closing first so a later slide TTS quota failure can't wipe them.
    // Only delete slide-kind rows in the loop (never greeting/closing).
    if (refreshedSlides[0]) {
      const greetingOk = await upsertStageAudio({
        businessId: presentation.businessId,
        presentationId,
        slideId: refreshedSlides[0].id,
        kind: "greeting",
        text: greeting,
      });
      if (!greetingOk) {
        console.warn("[presentation-pipeline] greeting TTS unavailable", presentationId);
      }
      const closingOk = await upsertStageAudio({
        businessId: presentation.businessId,
        presentationId,
        slideId: refreshedSlides[0].id,
        kind: "closing",
        text: closing,
      });
      if (!closingOk) {
        console.warn("[presentation-pipeline] closing TTS unavailable", presentationId);
      }
    }

    // Slide TTS is best-effort. On quota/errors, skip the rest so processing can finish.
    let ttsDisabled = false;
    for (const slide of refreshedSlides) {
      await db
        .delete(presentationAudioAssets)
        .where(
          and(
            eq(presentationAudioAssets.slideId, slide.id),
            eq(presentationAudioAssets.kind, "slide"),
          ),
        );
      if (ttsDisabled) continue;
      const tts = await synthesizeSpeechWav(slide.script);
      if (!tts) {
        ttsDisabled = true;
        console.warn("[presentation-pipeline] TTS unavailable — skipping remaining slide audio");
        continue;
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
    }

    await setStatus(presentationId, "processing", "embedding");

    const finalSlides = await db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.presentationId, presentationId));

    for (const slide of finalSlides) {
      const content = JSON.parse(slide.contentJson || "{}") as { texts?: string[] };
      const body = [slide.title, ...(content.texts ?? []), slide.notes, slide.script]
        .filter(Boolean)
        .join("\n");
      await db.insert(presentationEmbeddings).values({
        presentationId,
        sourceType: "ppt",
        sourceId: slide.id,
        chunkText: body,
      });
      if (slide.notes.trim()) {
        await db.insert(presentationEmbeddings).values({
          presentationId,
          sourceType: "notes",
          sourceId: slide.id,
          chunkText: slide.notes,
        });
      }
    }

    for (const file of files) {
      if (file.fileType === "pptx" || file.fileType === "ppt") continue;
      const fileBuf = await downloadFromStorage(PRESENTATION_BUCKET, file.storagePath);
      if (!fileBuf) continue;
      const text =
        file.fileType === "txt"
          ? fileBuf.toString("utf8").slice(0, 12000)
          : `[${file.fileType.toUpperCase()} file: ${file.fileName}]`;
      await db.insert(presentationEmbeddings).values({
        presentationId,
        sourceType: file.fileType,
        sourceId: file.id,
        chunkText: text,
      });
    }

    const durations = await db
      .select()
      .from(presentationSlides)
      .where(eq(presentationSlides.presentationId, presentationId));
    const estimatedDuration = durations.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);

    await db
      .update(presentations)
      .set({
        status: "ready",
        processingStep: "completed",
        processingError: "",
        estimatedDuration,
        totalSlides: durations.length,
        updatedAt: new Date(),
      })
      .where(eq(presentations.id, presentationId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    await setStatus(presentationId, "failed", "failed", message);
  }
}
