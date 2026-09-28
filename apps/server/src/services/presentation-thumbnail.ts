import { and, eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { presentationFiles, presentations, presentationSlides } from "../db/schema.js";
import { logger } from "../http/logger.js";
import { downloadFromStorage, PRESENTATION_BUCKET, uploadToStorage } from "../storage/index.js";
import { renderFirstSlideThumbnail } from "./pptx-render.js";

const log = logger.child({ component: "presentation" });

const backfilling = new Set<string>();

/** Render slide 1 and store URL on the presentation (and slide 1 when present). */
export async function persistPresentationThumbnail(input: {
  businessId: string;
  presentationId: string;
  pptxBuffer: Buffer;
}): Promise<string | null> {
  const png = await renderFirstSlideThumbnail(input.pptxBuffer);
  if (!png) return null;

  const objectPath = `${input.businessId}/${input.presentationId}/thumbnail.png`;
  const uploaded = await uploadToStorage(
    PRESENTATION_BUCKET,
    objectPath,
    png,
    "image/png",
  );
  const thumbnailUrl =
    uploaded.startsWith("http") || uploaded.startsWith("/") ? uploaded : objectPath;

  await db
    .update(presentations)
    .set({ thumbnailUrl, updatedAt: new Date() })
    .where(eq(presentations.id, input.presentationId));

  await db
    .update(presentationSlides)
    .set({ imageUrl: thumbnailUrl })
    .where(
      and(
        eq(presentationSlides.presentationId, input.presentationId),
        eq(presentationSlides.slideNumber, 1),
      ),
    );

  return thumbnailUrl;
}

/** Best-effort backfill for decks uploaded before thumbnails existed. */
export function enqueueMissingThumbnails(
  rows: Array<{ id: string; businessId: string; thumbnailUrl: string }>,
): void {
  const missing = rows.filter((row) => !row.thumbnailUrl).slice(0, 5);
  for (const row of missing) {
    if (backfilling.has(row.id)) continue;
    backfilling.add(row.id);
    void (async () => {
      try {
        const files = await db
          .select()
          .from(presentationFiles)
          .where(eq(presentationFiles.presentationId, row.id));
        const pptx = files.find((f) => f.fileType === "pptx");
        if (!pptx) return;
        const buffer = await downloadFromStorage(PRESENTATION_BUCKET, pptx.storagePath);
        if (!buffer) return;
        await persistPresentationThumbnail({
          businessId: row.businessId,
          presentationId: row.id,
          pptxBuffer: buffer,
        });
      } catch (err) {
        log.warn({ err, presentationId: row.id }, "presentation.thumbnail_backfill_failed");
      } finally {
        backfilling.delete(row.id);
      }
    })();
  }
}
