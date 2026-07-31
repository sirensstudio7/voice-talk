import {
  connectVoiceEffectChain,
  getVoicePresetConfig,
  isDryVoicePreset,
  normalizeVoiceGender,
  normalizeVoicePreset,
  scheduleVoicePresetChunk,
  type VoiceGender,
  type VoicePreset,
} from "@voicetalk/shared";

export type PreviewLanguage = "id" | "en";

/** Bump when replacing sample assets so browsers don't keep a stale female cache. */
const PREVIEW_SAMPLE_VERSION = "male-id-v5";

function previewSampleUrl(language: PreviewLanguage, gender: VoiceGender): string {
  const base =
    gender === "male"
      ? language === "en"
        ? "/voice-preview-sample-en-male.wav"
        : "/voice-preview-sample-id-male.wav"
      : language === "en"
        ? "/voice-preview-sample-en.wav"
        : "/voice-preview-sample-id.wav";
  return `${base}?v=${PREVIEW_SAMPLE_VERSION}`;
}

type SampleKey = `${PreviewLanguage}:${VoiceGender}:${string}`;

let sharedContext: AudioContext | null = null;
const sampleCache = new Map<SampleKey, AudioBuffer>();
const sampleLoadPromises = new Map<SampleKey, Promise<AudioBuffer>>();
let activeSources: AudioBufferSourceNode[] = [];
let activeNodes: AudioNode[] = [];
let dryAudio: HTMLAudioElement | null = null;

function getContext(): AudioContext {
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

function normalizePreviewLanguage(language: string | null | undefined): PreviewLanguage {
  return language === "en" ? "en" : "id";
}

async function loadSample(
  ctx: AudioContext,
  language: PreviewLanguage,
  gender: VoiceGender,
): Promise<AudioBuffer> {
  const url = previewSampleUrl(language, gender);
  const key: SampleKey = `${language}:${gender}:${PREVIEW_SAMPLE_VERSION}`;
  const cached = sampleCache.get(key);
  if (cached) return cached;

  const existing = sampleLoadPromises.get(key);
  if (existing) return existing;

  const loadPromise = (async () => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load voice preview sample.");
    }
    const data = await response.arrayBuffer();
    const buffer = await ctx.decodeAudioData(data.slice(0));
    sampleCache.set(key, buffer);
    return buffer;
  })().finally(() => {
    sampleLoadPromises.delete(key);
  });

  sampleLoadPromises.set(key, loadPromise);
  return loadPromise;
}

function stopActivePreview(): void {
  if (dryAudio) {
    dryAudio.pause();
    dryAudio.onended = null;
    dryAudio.onerror = null;
    dryAudio = null;
  }
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
  gender: VoiceGender | string | null | undefined = "female",
): Promise<void> {
  const id = normalizeVoicePreset(preset);
  const previewLanguage = normalizePreviewLanguage(language);
  const previewGender = normalizeVoiceGender(gender);

  stopActivePreview();

  // Natural = dry file playback (no WebAudio re-encoding / effect graph).
  if (isDryVoicePreset(id)) {
    const audio = new Audio(previewSampleUrl(previewLanguage, previewGender));
    dryAudio = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        if (dryAudio === audio) dryAudio = null;
        resolve();
      };
      audio.onerror = () => {
        if (dryAudio === audio) dryAudio = null;
        reject(new Error("Unable to play voice preview sample."));
      };
      void audio.play().catch((error) => {
        if (dryAudio === audio) dryAudio = null;
        reject(error instanceof Error ? error : new Error("Voice preview failed."));
      });
    });
    return;
  }

  const ctx = getContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const sample = await loadSample(ctx, previewLanguage, previewGender);
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
