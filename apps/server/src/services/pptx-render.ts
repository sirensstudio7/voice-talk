import { convertPptxToPng } from "pptx-glimpse";

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
