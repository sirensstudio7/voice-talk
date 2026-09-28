import { convertPptxToPng } from "pptx-glimpse";
import { logger } from "../http/logger.js";

const log = logger.child({ component: "pptx" });

export type RenderedSlideImage = {
  slideNumber: number;
  png: Buffer;
  width: number;
  height: number;
};

/**
 * Render each PPTX slide to a PNG so the live viewer can show the customer's deck
 * instead of extracted text.
 */
export async function renderPptxToPngs(buffer: Buffer): Promise<RenderedSlideImage[]> {
  const results = await convertPptxToPng(buffer, {
    width: 1920,
    logLevel: "warn",
  });

  return results.map((slide) => ({
    slideNumber: slide.slideNumber,
    png: Buffer.from(slide.png),
    width: slide.width,
    height: slide.height,
  }));
}

/** Lightweight first-slide PNG for list/card thumbnails. */
export async function renderFirstSlideThumbnail(buffer: Buffer): Promise<Buffer | null> {
  try {
    const results = await convertPptxToPng(buffer, {
      slides: [1],
      width: 640,
      logLevel: "off",
    });
    const first = results[0];
    return first ? Buffer.from(first.png) : null;
  } catch (err) {
    log.warn({ err }, "pptx.thumbnail_failed");
    return null;
  }
}
