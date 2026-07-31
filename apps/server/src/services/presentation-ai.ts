import { GoogleGenAI, Modality } from "@google/genai";

import { env } from "../env.js";

// gemini-2.5-flash is blocked for many new API keys; prefer a current flash model.
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash";
const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";

function getClient(): GoogleGenAI | null {
  if (!env.GEMINI_API_KEY) return null;
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

function estimateDurationSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  // ~140 wpm + 2s pause buffer (PRD slide timing)
  return Math.max(4, Math.ceil((words / 140) * 60) + 2);
}

export function estimateScriptDurationSeconds(script: string): number {
  return estimateDurationSeconds(script);
}

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
    console.warn("[presentation-ai] script generation failed", err);
    return fallback;
  }
}

function buildFallbackScript(input: {
  title: string;
  texts: string[];
  notes: string;
}): string {
  if (input.notes.trim()) return input.notes.trim();
  if (input.texts.length > 0) {
    return `On this slide, ${input.title}. ${input.texts.slice(1).join(". ")}`.trim();
  }
  return `Let's look at ${input.title}.`;
}

export async function generateGreetingClosing(input: {
  language: string;
  title: string;
  description: string;
}): Promise<{ greeting: string; closing: string }> {
  const client = getClient();
  const greetingFallback =
    input.language === "id"
      ? `Selamat datang. Hari ini kami akan membahas ${input.title}.`
      : `Welcome everyone. Today we will cover ${input.title}.`;
  const closingFallback =
    input.language === "id"
      ? `Terima kasih. Saya siap menjawab pertanyaan Anda.`
      : `Thank you. I'm ready for your questions.`;

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
    console.warn("[presentation-ai] greeting/closing failed", err);
  }
  return { greeting: greetingFallback, closing: closingFallback };
}

/** Returns WAV buffer (PCM wrapped) and duration seconds. */
export async function synthesizeSpeechWav(
  text: string,
  voiceName = "Kore",
): Promise<{ buffer: Buffer; durationSeconds: number } | null> {
  const client = getClient();
  if (!client || !text.trim()) return null;

  try {
    const response = await client.models.generateContent({
      model: TTS_MODEL,
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
    console.warn("[presentation-ai] TTS failed", err);
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

  const client = getClient();
  if (!client) return { answer: fallback, sources };

  try {
    const response = await client.models.generateContent({
      model: TEXT_MODEL,
      contents: `Answer the audience question using ONLY the context. If unknown, say you don't know from the material.
Language: ${input.language}
Question: ${input.question}

Context (priority: ppt slides, notes, supporting docs):
${context || "(empty)"}

Return a concise spoken answer (2-5 sentences).`,
    });
    return { answer: response.text?.trim() || fallback, sources };
  } catch (err) {
    console.warn("[presentation-ai] Q&A failed", err);
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
