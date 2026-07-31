import JSZip from "jszip";

export type ParsedSlide = {
  slideNumber: number;
  title: string;
  texts: string[];
  notes: string;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTextNodes(xml: string): string[] {
  const texts: string[] = [];
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[1] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) texts.push(text);
  }
  return texts;
}

function slideNumberFromPath(path: string): number | null {
  const match = /ppt\/slides\/slide(\d+)\.xml$/i.exec(path);
  if (!match) return null;
  return Number(match[1]);
}

function notesPathForSlide(slideNumber: number): string {
  return `ppt/notesSlides/notesSlide${slideNumber}.xml`;
}

/**
 * Lightweight PPTX parser (OOXML zip). Extracts visible text + speaker notes.
 * Does not render charts/images; stores text content for AI scripting/RAG.
 */
export async function parsePptxBuffer(buffer: Buffer): Promise<ParsedSlide[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => (slideNumberFromPath(a) ?? 0) - (slideNumberFromPath(b) ?? 0));

  if (slideEntries.length === 0) {
    throw new Error("No slides found in PPTX file");
  }

  const slides: ParsedSlide[] = [];

  for (const path of slideEntries) {
    const slideNumber = slideNumberFromPath(path);
    if (!slideNumber) continue;
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async("string");
    const texts = extractTextNodes(xml);

    let notes = "";
    const notesFile = zip.file(notesPathForSlide(slideNumber));
    if (notesFile) {
      const notesXml = await notesFile.async("string");
      notes = extractTextNodes(notesXml).join(" ").trim();
    }

    slides.push({
      slideNumber,
      title: texts[0] ?? `Slide ${slideNumber}`,
      texts,
      notes,
    });
  }

  return slides;
}

export function detectPresentationFileType(
  fileName: string,
  mimeType: string,
): "pptx" | "ppt" | "pdf" | "docx" | "txt" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pptx") || mimeType.includes("presentationml")) return "pptx";
  if (lower.endsWith(".ppt") || mimeType === "application/vnd.ms-powerpoint") return "ppt";
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".docx") || mimeType.includes("wordprocessingml")) return "docx";
  if (lower.endsWith(".txt") || mimeType.startsWith("text/")) return "txt";
  return null;
}
