/**
 * Regenerate admin AI-rules voice preview WAVs with Gemini TTS (24 kHz PCM).
 *
 * Usage (from repo root):
 *   npx tsx --env-file=.env apps/server/scripts/generate-voice-preview-samples.ts
 *   npx tsx --env-file=.env apps/server/scripts/generate-voice-preview-samples.ts male
 *   npx tsx --env-file=.env apps/server/scripts/generate-voice-preview-samples.ts male en
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { GoogleGenAI, Modality } from "@google/genai";

const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";

const ALL_SAMPLES = [
  {
    lang: "en",
    gender: "female" as const,
    voice: "Aoede",
    file: "voice-preview-sample-en.wav",
    text: "Hi, I'm your assistant. Thanks for stopping by — how can I help you today?",
  },
  {
    lang: "id",
    gender: "female" as const,
    voice: "Aoede",
    file: "voice-preview-sample-id.wav",
    text: "Halo, saya asisten Anda. Terima kasih sudah datang — ada yang bisa saya bantu?",
  },
  {
    lang: "en",
    gender: "male" as const,
    voice: "Charon",
    file: "voice-preview-sample-en-male.wav",
    text: "Hi, I'm your assistant. Thanks for stopping by — how can I help you today?",
  },
  {
    lang: "id",
    gender: "male" as const,
    voice: "Charon",
    file: "voice-preview-sample-id-male.wav",
    text: "Halo, saya asisten Anda. Terima kasih sudah datang — ada yang bisa saya bantu?",
  },
] as const;

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

async function synthesize(
  client: GoogleGenAI,
  text: string,
  voiceName: string,
): Promise<Buffer> {
  const response = await client.models.generateContent({
    model: TTS_MODEL,
    contents: [
      {
        parts: [
          {
            text: `Speak warmly and naturally, like a friendly human assistant — not robotic. ${text}`,
          },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  });

  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  const b64 = inline?.data;
  if (!b64) throw new Error("No audio returned from Gemini TTS");
  return pcmToWav(Buffer.from(b64, "base64"), 24000, 1);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");

  const arg1 = process.argv[2]; // gender or lang
  const arg2 = process.argv[3]; // lang when arg1 is gender

  let samples = [...ALL_SAMPLES];
  if (arg1 === "male" || arg1 === "female") {
    samples = samples.filter((s) => s.gender === arg1);
    if (arg2 === "en" || arg2 === "id") {
      samples = samples.filter((s) => s.lang === arg2);
    }
  } else if (arg1 === "en" || arg1 === "id") {
    samples = samples.filter((s) => s.lang === arg1);
  } else if (arg1) {
    throw new Error(`Unknown filter "${arg1}" (use male|female|en|id)`);
  }

  if (samples.length === 0) throw new Error("No samples matched filters");

  const client = new GoogleGenAI({ apiKey });
  const outDir = resolve(import.meta.dirname, "../../admin-app/public");

  for (const sample of samples) {
    console.log(`Generating ${sample.file} (${sample.voice})…`);
    const wav = await synthesize(client, sample.text, sample.voice);
    const path = resolve(outDir, sample.file);
    writeFileSync(path, wav);
    console.log(`Wrote ${path} (${wav.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
