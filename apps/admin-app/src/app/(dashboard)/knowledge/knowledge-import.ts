export type ImportedKnowledgeDraft = {
  title: string;
  content: string;
};

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set(["md", "txt", "docx"]);

export const KNOWLEDGE_IMPORT_ACCEPT =
  ".md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function isAcceptedKnowledgeImportFile(file: File): boolean {
  return ACCEPTED_EXTENSIONS.has(fileExtension(file.name));
}

export function filterKnowledgeImportFiles(files: Iterable<File>): File[] {
  return [...files].filter(isAcceptedKnowledgeImportFile);
}

export function filenameStem(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const idx = base.lastIndexOf(".");
  return (idx > 0 ? base.slice(0, idx) : base).trim() || "Imported note";
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/** Decode text; fall back to UTF-16 when the buffer looks UTF-16 (many NULs). */
export function decodeImportText(buffer: ArrayBuffer): string {
  const asUtf8 = stripBom(new TextDecoder("utf-8").decode(buffer));
  const nulCount = (asUtf8.match(/\0/g)?.length ?? 0);
  if (asUtf8.length > 0 && nulCount / asUtf8.length > 0.08) {
    return stripBom(new TextDecoder("utf-16le").decode(buffer)).replace(/\0/g, "");
  }
  return asUtf8.replace(/\0/g, "");
}

function clipTitle(value: string, fallback: string): string {
  const title = value.trim() || fallback;
  return title.slice(0, 200);
}

/**
 * One file → one knowledge entry.
 * Title = first `#` heading if present, otherwise the filename.
 * Content = full document (headings stay in the body; no split).
 */
export function fileToKnowledgeDraft(
  raw: string,
  fallbackTitle: string,
): ImportedKnowledgeDraft | null {
  const text = normalizeNewlines(stripBom(raw)).replace(/\0/g, "").trim();
  if (!text) return null;

  let title = fallbackTitle;
  const h1Match = text.match(/^#\s+(.+?)\s*(?:\n|$)/);
  if (h1Match?.[1]?.trim()) {
    title = h1Match[1].trim();
  }

  return {
    title: clipTitle(title, fallbackTitle),
    content: text,
  };
}

/** @deprecated Use fileToKnowledgeDraft — kept name for any callers expecting an array. */
export function splitKnowledgeDocument(
  raw: string,
  fallbackTitle: string,
): ImportedKnowledgeDraft[] {
  const draft = fileToKnowledgeDraft(raw, fallbackTitle);
  return draft ? [draft] : [];
}

async function extractDocxText(file: File): Promise<string> {
  // Browser build — avoids Node fs paths from mammoth's main entry.
  const mod = (await import("mammoth/mammoth.browser")) as {
    default?: {
      extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    };
    extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const mammoth = mod.default ?? mod;
  if (!mammoth.extractRawText) {
    throw new Error("Could not load Word importer.");
  }
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value ?? "";
}

export async function parseKnowledgeImportFile(file: File): Promise<ImportedKnowledgeDraft[]> {
  if (file.size <= 0) {
    throw new Error("File is empty.");
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("File is too large. Use a file up to 2 MB.");
  }

  const ext = fileExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.has(ext)) {
    throw new Error("Unsupported file. Use .md, .txt, or .docx.");
  }

  const fallbackTitle = filenameStem(file.name);
  let text = "";

  if (ext === "docx") {
    text = await extractDocxText(file);
  } else {
    text = decodeImportText(await file.arrayBuffer());
  }

  const draft = fileToKnowledgeDraft(text, fallbackTitle);
  if (!draft) {
    throw new Error("No usable text found in that file (empty or whitespace only).");
  }
  return [draft];
}
