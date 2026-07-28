import {
  connectVoiceEffectChain,
  getVoicePresetConfig,
  normalizeVoicePreset,
  scheduleVoicePresetChunk,
  type VoicePreset,
} from "@voicetalk/shared";

export type PreviewLanguage = "id" | "en";

const PREVIEW_SAMPLE_URLS: Record<PreviewLanguage, string> = {
  id: "/voice-preview-sample-id.wav",
  en: "/voice-preview-sample-en.wav",
};

let sharedContext: AudioContext | null = null;
const sampleCache = new Map<PreviewLanguage, AudioBuffer>();
const sampleLoadPromises = new Map<PreviewLanguage, Promise<AudioBuffer>>();
let activeSources: AudioBufferSourceNode[] = [];
let activeNodes: AudioNode[] = [];

function getContext(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

function normalizePreviewLanguage(language: string | null | undefined): PreviewLanguage {
  return language === "en" ? "en" : "id";
}

async function loadSample(ctx: AudioContext, language: PreviewLanguage): Promise<AudioBuffer> {
  const cached = sampleCache.get(language);
  if (cached) return cached;

  const existing = sampleLoadPromises.get(language);
  if (existing) return existing;

  const loadPromise = (async () => {
    const response = await fetch(PREVIEW_SAMPLE_URLS[language]);
    if (!response.ok) {
      throw new Error("Unable to load voice preview sample.");
    }
    const data = await response.arrayBuffer();
    const buffer = await ctx.decodeAudioData(data.slice(0));
    sampleCache.set(language, buffer);
    return buffer;
  })().finally(() => {
    sampleLoadPromises.delete(language);
  });

  sampleLoadPromises.set(language, loadPromise);
  return loadPromise;
}

function stopActivePreview(): void {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {
      // no-op
    }
  }
  for (const node of activeNodes) {
    try {
      node.disconnect();
    } catch {
      // no-op
    }
  }
  activeSources = [];
  activeNodes = [];
}

export function stopVoicePresetPreview(): void {
  stopActivePreview();
}

export async function playVoicePresetPreview(
  preset: VoicePreset | string,
  language: string | null | undefined = "id",
): Promise<void> {
  const id = normalizeVoicePreset(preset);
  const previewLanguage = normalizePreviewLanguage(language);
  const ctx = getContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  stopActivePreview();

  const sample = await loadSample(ctx, previewLanguage);
  const config = getVoicePresetConfig(id);
  const channel = sample.getChannelData(0);
  const mono = new Float32Array(channel.length);
  mono.set(channel);

  const graph = connectVoiceEffectChain(ctx, config);
  activeNodes.push(...graph.nodes);

  const startAt = ctx.currentTime + 0.02;
  const scheduled = scheduleVoicePresetChunk(
    ctx,
    mono,
    sample.sampleRate,
    config,
    graph.input,
    startAt,
  );
  activeSources.push(...scheduled.sources);
  activeNodes.push(...scheduled.nodes);

  await new Promise<void>((resolve, reject) => {
    let ended = 0;
    const total = scheduled.sources.length;
    if (total === 0) {
      resolve();
      return;
    }

    try {
      for (const source of scheduled.sources) {
        source.onended = () => {
          ended += 1;
          if (ended >= total) resolve();
        };
      }
    } catch (error) {
      stopActivePreview();
      reject(error instanceof Error ? error : new Error("Voice preview failed."));
    }
  });
}
