import { GoogleGenAI, Modality } from "@google/genai";
import { eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { platformSettings } from "../db/schema.js";
import { env } from "../env.js";
import { logger } from "../http/logger.js";

const log = logger.child({ component: "presentation" });

// gemini-2.5-flash is blocked for many new API keys; prefer a current flash model.
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash";
const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";

function getClient(apiKey?: string | null): GoogleGenAI | null {
  const key = apiKey?.trim() || env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

async function resolveDefaultTtsModel() {
  try {
    const row = await db.query.platformSettings.findFirst({
      where: eq(platformSettings.key, "default_tts_model"),
    });
    return row?.value?.trim() || TTS_MODEL;
  } catch {
    return TTS_MODEL;
  }
}

function estimateDurationSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  // ~140 wpm + 2s pause buffer (PRD slide timing)
  return Math.max(4, Math.ceil((words / 140) * 60) + 2);
}

export function estimateScriptDurationSeconds(script: string): number {
  return estimateDurationSeconds(script);
}

/**
 * Dormant (TKT-010): the live Gemini narrator replaced per-slide script
 * generation. Kept for the TKT-007 decision on pre-rendered audio; delete
 * together with the stage-audio helpers if live narration stays the design.
 */
export async function generateSlideScript(input: {
  language: string;
  presentationTitle: string;
  slideNumber: number;
  totalSlides: number;
  title: string;
  texts: string[];
  notes: string;
  previousSummary: string;
}): Promise<string> {
  const client = getClient();
  const fallback = buildFallbackScript(input);
  if (!client) return fallback;

  const prompt = `You are a professional presentation narrator.
Write a natural spoken script for ONE slide. Do not repeat the previous slide.
Language: ${input.language}
Presentation: ${input.presentationTitle}
Slide ${input.slideNumber} of ${input.totalSlides}
Slide title: ${input.title}
Slide text:
${input.texts.join("\n") || "(image/table only — describe and teach the concept)"}
Speaker notes: ${input.notes || "(none)"}
Previous slide summary: ${input.previousSummary || "(start of presentation)"}

Return ONLY the spoken narration script, no markdown or labels.`;

  try {
    const response = await client.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
    });
    const text = response.text?.trim();
    return text || fallback;
  } catch (err) {
    log.warn({ err, operation: "script" }, "gemini.failed");
    return fallback;
  }
}

/**
 * Fast talking points from PPT extract — no LLM.
 * Live Present paraphrases these at speak time.
 */
export function buildTalkingPointsFromSlide(input: {
  title: string;
  texts: string[];
  notes: string;
}): string {
  const title = input.title.trim() || "this slide";
  const notes = input.notes.trim();
  const texts = input.texts.map((t) => t.trim()).filter(Boolean);

  const parts: string[] = [];
  if (title) parts.push(title);

  // Prefer unique body lines (skip duplicate title).
  for (const line of texts) {
    if (line.toLowerCase() === title.toLowerCase()) continue;
    parts.push(line);
  }

  if (notes) parts.push(notes);

  if (parts.length === 0) return `Let's look at ${title}.`;
  if (parts.length === 1) return `On this slide: ${parts[0]}.`;
  return parts.join(". ").replace(/\.\s*\./g, ".").trim();
}

/** @deprecated alias — prefer buildTalkingPointsFromSlide */
function buildFallbackScript(input: {
  title: string;
  texts: string[];
  notes: string;
}): string {
  return buildTalkingPointsFromSlide(input);
}

export function buildDefaultGreetingClosing(input: {
  language: string;
  title: string;
}): { greeting: string; closing: string } {
  const title = input.title.trim() || "this presentation";
  if (input.language === "id") {
    return {
      greeting: `Selamat datang. Hari ini kami akan membahas ${title}.`,
      closing: `Terima kasih. Saya siap menjawab pertanyaan Anda.`,
    };
  }
  return {
    greeting: `Welcome everyone. Today we will cover ${title}.`,
    closing: `Thank you. I'm ready for your questions.`,
  };
}

export async function generateGreetingClosing(input: {
  language: string;
  title: string;
  description: string;
}): Promise<{ greeting: string; closing: string }> {
  const client = getClient();
  const { greeting: greetingFallback, closing: closingFallback } =
    buildDefaultGreetingClosing(input);

  if (!client) return { greeting: greetingFallback, closing: closingFallback };

  try {
    const response = await client.models.generateContent({
      model: TEXT_MODEL,
      contents: `Write a short greeting and a short closing for an AI presenter.
Language: ${input.language}
Title: ${input.title}
Description: ${input.description || "n/a"}
Return JSON only: {"greeting":"...","closing":"..."}`,
    });
    const raw = response.text?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { greeting?: string; closing?: string };
      return {
        greeting: parsed.greeting?.trim() || greetingFallback,
        closing: parsed.closing?.trim() || closingFallback,
      };
    }
  } catch (err) {
    log.warn({ err, operation: "greeting_closing" }, "gemini.failed");
  }
  return { greeting: greetingFallback, closing: closingFallback };
}

/** Returns WAV buffer (PCM wrapped) and duration seconds. */
export async function synthesizeSpeechWav(
  text: string,
  voiceName = "Kore",
  modelName?: string,
  apiKey?: string | null,
): Promise<{ buffer: Buffer; durationSeconds: number } | null> {
  const client = getClient(apiKey);
  if (!client || !text.trim()) return null;
  const model = modelName?.trim() || (await resolveDefaultTtsModel());

  try {
    const response = await client.models.generateContent({
      model,
      contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    });

    const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const b64 = inline?.data;
    if (!b64) return null;

    const pcm = Buffer.from(b64, "base64");
    const sampleRate = 24000;
    const wav = pcmToWav(pcm, sampleRate, 1);
    const durationSeconds = Math.max(1, Math.ceil(pcm.length / (sampleRate * 2)));
    return { buffer: wav, durationSeconds };
  } catch (err) {
    log.warn({ err, operation: "tts" }, "gemini.failed");
    return null;
  }
}

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export type QaSourceRef = {
  source_type: string;
  source_id: string | null;
  excerpt: string;
};

export async function answerPresentationQuestion(input: {
  language: string;
  question: string;
  apiKey?: string | null;
  chunks: Array<{ sourceType: string; sourceId: string | null; chunkText: string }>;
}): Promise<{ answer: string; sources: QaSourceRef[] }> {
  const ranked = rankChunks(input.question, input.chunks).slice(0, 8);
  const sources: QaSourceRef[] = ranked.map((c) => ({
    source_type: c.sourceType,
    source_id: c.sourceId,
    excerpt: c.chunkText.slice(0, 240),
  }));

  const context = ranked
    .map((c, i) => `[${i + 1}] (${c.sourceType}) ${c.chunkText}`)
    .join("\n\n");

  const fallback =
    ranked.length === 0
      ? input.language === "id"
        ? "Maaf, pertanyaan itu di luar materi presentasi ini."
        : "Sorry, that question is outside this presentation's material."
      : ranked[0]!.chunkText.slice(0, 400);

  const client = getClient(input.apiKey);
  if (!client) return { answer: fallback, sources };

  try {
    const response = await client.models.generateContent({
      model: TEXT_MODEL,
      contents: `Answer the audience question using ONLY the context. If unknown, say you don't know from the material.
Language: ${input.language}
Question: ${input.question}

Context (priority: ppt slides, presentation knowledge, notes, supporting docs):
${context || "(empty)"}

Return a concise spoken answer (2-5 sentences).`,
    });
    return { answer: response.text?.trim() || fallback, sources };
  } catch (err) {
    log.warn({ err, operation: "qa" }, "gemini.failed");
    return { answer: fallback, sources };
  }
}

function rankChunks(
  question: string,
  chunks: Array<{ sourceType: string; sourceId: string | null; chunkText: string }>,
) {
  const terms = question
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
  const priority: Record<string, number> = {
    ppt: 50,
    knowledge: 48,
    notes: 40,
    pdf: 30,
    docx: 20,
    txt: 10,
    org_kb: 5,
  };

  return [...chunks]
    .map((chunk) => {
      const text = chunk.chunkText.toLowerCase();
      let score = priority[chunk.sourceType] ?? 0;
      for (const term of terms) {
        if (text.includes(term)) score += 3;
      }
      return { ...chunk, score };
    })
    .sort((a, b) => b.score - a.score);
}

const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/ogg;codecs=opus",
]);

const TRANSCRIBE_MODELS = [
  process.env.GEMINI_TEXT_MODEL,
  "gemini-2.5-flash",
  "gemini-3.1-flash",
  "gemini-3.6-flash",
].filter((model, index, all): model is string => {
  if (!model) return false;
  if (/live-preview|tts/i.test(model)) return false;
  if (/gemini-2\.0/i.test(model)) return false;
  return all.indexOf(model) === index;
});

export async function transcribeAudienceQuestion(input: {
  apiKey?: string | null;
  language?: string;
  mimeType: string;
  audioBase64: string;
}): Promise<string> {
  const client = getClient(input.apiKey);
  if (!client) {
    const err = new Error("Voice transcription is not configured") as Error & { statusCode: number };
    err.statusCode = 503;
    throw err;
  }

  const rawMime = String(input.mimeType || "audio/webm").split(";")[0]!.trim().toLowerCase();
  const mimeType = ALLOWED_AUDIO_MIME.has(rawMime) || ALLOWED_AUDIO_MIME.has(input.mimeType)
    ? (rawMime || "audio/webm")
    : "audio/webm";
  const lang = String(input.language ?? "id").toLowerCase().startsWith("id")
    ? "Indonesian"
    : "English";

  let lastError: unknown;
  for (const model of TRANSCRIBE_MODELS) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: input.audioBase64 } },
              {
                text: `Transcribe this spoken audience question in ${lang}. Return ONLY the transcript. If there is no speech, return EMPTY.`,
              },
            ],
          },
        ],
      });
      const text = response.text?.trim() ?? "";
      if (!text || /^empty$/i.test(text)) return "";
      return text.replace(/^["“”']+|["“”']+$/g, "").trim();
    } catch (err) {
      lastError = err;
      log.warn({ err, model, operation: "transcribe" }, "gemini.failed");
    }
  }

  const err = new Error(
    lastError instanceof Error ? lastError.message : "Could not transcribe the question",
  ) as Error & { statusCode: number };
  err.statusCode = 502;
  throw err;
}
