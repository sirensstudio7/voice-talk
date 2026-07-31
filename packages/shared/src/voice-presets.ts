export const VOICE_PRESETS = ["natural", "dark_beast", "deep", "robot", "bright"] as const;

export type VoicePreset = (typeof VOICE_PRESETS)[number];

export const VOICE_GENDERS = ["female", "male"] as const;

export type VoiceGender = (typeof VOICE_GENDERS)[number];

export type VoiceGenderOption = {
  value: VoiceGender;
  label: string;
};

export const VOICE_GENDER_OPTIONS: VoiceGenderOption[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

/** Gemini Live voice names by style × gender. */
const GEMINI_VOICE_BY_PRESET_GENDER: Record<VoicePreset, Record<VoiceGender, string>> = {
  natural: { female: "Aoede", male: "Charon" },
  deep: { female: "Aoede", male: "Charon" },
  bright: { female: "Kore", male: "Puck" },
  robot: { female: "Aoede", male: "Puck" },
  dark_beast: { female: "Aoede", male: "Fenrir" },
};

export type VoiceFilterType =
  | "lowpass"
  | "highpass"
  | "bandpass"
  | "lowshelf"
  | "highshelf"
  | "peaking";

export type VoiceFilterConfig = {
  type: VoiceFilterType;
  frequency: number;
  Q?: number;
  gain?: number;
};

/** Parallel voice layer (main / deep / growl). */
export type VoiceLayerConfig = {
  id?: string;
  /** Pitch shift in semitones. Prefer this over pitchRatio. */
  pitchSemitones?: number;
  /** Absolute pitch ratio; used when pitchSemitones is omitted. */
  pitchRatio?: number;
  /** Linear gain (1 = 100%). */
  gain: number;
  delayMs?: number;
  filters?: VoiceFilterConfig[];
  /** Soft clip amount 0–1 for this layer only. */
  distortion?: number;
  /** Optional noise texture mix 0–1. */
  noiseMix?: number;
};

export type VoiceCompressorConfig = {
  threshold: number;
  ratio: number;
  /** seconds */
  attack: number;
  /** seconds */
  release: number;
  knee?: number;
  /** dB make-up after compressor */
  makeupDb?: number;
};

export type VoiceSaturationConfig = {
  /** 0–100 */
  drive: number;
  /** 0–100 wet mix */
  mix: number;
};

export type VoiceBusDistortionConfig = {
  /** 0–100 */
  amount: number;
  /** 0–100 wet mix */
  mix: number;
};

export type VoiceReverbConfig = {
  enabled: boolean;
  /** 0–100 wet mix */
  mix: number;
  /** impulse length in seconds */
  durationSec?: number;
  /** seconds */
  preDelaySec?: number;
};

export type VoiceLimiterConfig = {
  /** dB */
  threshold: number;
  /** seconds */
  release: number;
};

export type VoiceSubBassConfig = {
  frequency: number;
  /** linear gain 0–1 */
  volume: number;
  attackMs: number;
  releaseMs: number;
};

export type VoicePresetConfig = {
  playbackRate: number;
  gain: number;
  filters: VoiceFilterConfig[];
  /** Gemini Live prebuilt TTS voice for this preset (server-side). */
  geminiVoiceName?: string;
  /** Global pitch when layers are not provided. */
  pitchSemitones?: number;
  distortion?: number;
  layers?: VoiceLayerConfig[];
  subBass?: VoiceSubBassConfig;
  compressor?: VoiceCompressorConfig;
  saturation?: VoiceSaturationConfig;
  busDistortion?: VoiceBusDistortionConfig;
  reverb?: VoiceReverbConfig;
  /** 1 = mono center, 1.1 = 110% width */
  stereoWidth?: number;
  limiter?: VoiceLimiterConfig;
  delayMs?: number;
  delayFeedback?: number;
  delayMix?: number;
  speakingStyle?: string;
};

export type VoicePresetOption = {
  value: VoicePreset;
  label: string;
  description: string;
};

export const VOICE_PRESET_OPTIONS: VoicePresetOption[] = [
  {
    value: "natural",
    label: "Natural",
    description: "Warm human voice — no effects, closest to live speech.",
  },
  {
    value: "dark_beast",
    label: "Dark Beast",
    description: "Deeper cinematic tone — still clear and human.",
  },
  {
    value: "deep",
    label: "Deep",
    description: "Natural male voice with a touch of warmth.",
  },
  {
    value: "robot",
    label: "Robot",
    description: "Light sci-fi tint — still easy to understand.",
  },
  {
    value: "bright",
    label: "Bright",
    description: "Clearer, slightly brighter human voice.",
  },
];

const DARK_BEAST_SPEAKING_STYLE = [
  "Speaking style (Dark Beast — mandatory for voice delivery):",
  "Speak slowly and confidently, as one deep powerful presence.",
  "Use short sentences. Pause between them.",
  "Stay calm, heavy, and cinematic — never shout, never angry.",
  "Keep every word easy to understand.",
  "Do not growl, snarl, or add monster sound effects in your speech.",
  "Sound like a large intelligent creature speaking quietly and clearly.",
].join("\n");

export function semitonesToRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

function layerPitchRatio(layer: VoiceLayerConfig): number {
  if (layer.pitchSemitones != null) return semitonesToRatio(layer.pitchSemitones);
  if (layer.pitchRatio != null) return layer.pitchRatio;
  return 1;
}

const PRESET_CONFIGS: Record<VoicePreset, VoicePresetConfig> = {
  // True dry path — Gemini voice only, no client DSP (human baseline).
  natural: {
    playbackRate: 1,
    gain: 1,
    filters: [],
    geminiVoiceName: "Aoede",
  },
  // Subtle deeper color — no dual-voice / distortion stack (that sounded inhuman).
  dark_beast: {
    geminiVoiceName: "Fenrir",
    playbackRate: 0.97,
    gain: 1,
    pitchSemitones: -1,
    filters: [
      { type: "lowshelf", frequency: 180, gain: 2.5 },
      { type: "peaking", frequency: 3000, gain: -1, Q: 0.9 },
    ],
    speakingStyle: DARK_BEAST_SPEAKING_STYLE,
  },
  // Male Gemini voice + tiny warmth only.
  deep: {
    geminiVoiceName: "Charon",
    playbackRate: 1,
    gain: 1,
    filters: [{ type: "lowshelf", frequency: 200, gain: 1.5 }],
  },
  // Light sci-fi tint — keep intelligible (old bandpass+distortion sounded broken).
  robot: {
    geminiVoiceName: "Puck",
    playbackRate: 1,
    gain: 1,
    filters: [
      { type: "peaking", frequency: 1600, gain: 2, Q: 1.1 },
      { type: "highshelf", frequency: 5500, gain: -2 },
    ],
    distortion: 0.12,
  },
  // Clearer top end without chipmunk playbackRate.
  bright: {
    geminiVoiceName: "Kore",
    playbackRate: 1,
    gain: 1,
    filters: [{ type: "highshelf", frequency: 2800, gain: 2 }],
  },
};

const LEGACY_PRESET_ALIASES: Record<string, VoicePreset> = {
  venom: "dark_beast",
};

export function isVoicePreset(value: unknown): value is VoicePreset {
  return typeof value === "string" && (VOICE_PRESETS as readonly string[]).includes(value);
}

export function normalizeVoicePreset(value: unknown): VoicePreset {
  if (typeof value !== "string") return "natural";
  if (isVoicePreset(value)) return value;
  return LEGACY_PRESET_ALIASES[value] ?? "natural";
}

export function isVoiceGender(value: unknown): value is VoiceGender {
  return typeof value === "string" && (VOICE_GENDERS as readonly string[]).includes(value);
}

export function normalizeVoiceGender(value: unknown): VoiceGender {
  if (isVoiceGender(value)) return value;
  return "female";
}

export function getVoicePresetConfig(preset: VoicePreset | string | null | undefined): VoicePresetConfig {
  return PRESET_CONFIGS[normalizeVoicePreset(preset)];
}

/** True when the preset should play Gemini audio with no client-side coloring. */
export function isDryVoicePreset(preset: VoicePreset | string | null | undefined): boolean {
  const id = normalizeVoicePreset(preset);
  if (id !== "natural") return false;
  const config = PRESET_CONFIGS.natural;
  return (
    (config.playbackRate ?? 1) === 1 &&
    (config.gain ?? 1) === 1 &&
    (config.filters?.length ?? 0) === 0 &&
    !config.layers?.length &&
    !config.distortion &&
    !config.compressor &&
    !config.saturation &&
    !config.busDistortion &&
    !config.reverb?.enabled &&
    !config.subBass &&
    (config.pitchSemitones ?? 0) === 0
  );
}

export function getVoicePresetSpeakingStyle(
  preset: VoicePreset | string | null | undefined,
): string | null {
  const style = getVoicePresetConfig(preset).speakingStyle?.trim();
  return style || null;
}

export function getVoicePresetGeminiVoice(
  preset: VoicePreset | string | null | undefined,
  gender: VoiceGender | string | null | undefined = "female",
  fallback = "Aoede",
): string {
  const style = normalizeVoicePreset(preset);
  const sex = normalizeVoiceGender(gender);
  return (
    GEMINI_VOICE_BY_PRESET_GENDER[style][sex] ||
    getVoicePresetConfig(style).geminiVoiceName?.trim() ||
    fallback
  );
}

export function resolveVoiceLayers(config: VoicePresetConfig): VoiceLayerConfig[] {
  if (config.layers && config.layers.length > 0) return config.layers;
  const semitones = config.pitchSemitones ?? 0;
  return [{ id: "main", pitchSemitones: semitones, gain: 1 }];
}

export function makeDistortionCurve(amount: number, samples = 512): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const drive = Math.max(0, Math.min(1, amount));
  const k = drive * 40;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    const shaped = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
    const soft = Math.tanh(x * (1.4 + drive * 3));
    curve[i] = shaped * (0.65 + drive * 0.15) + soft * (0.35 - drive * 0.15);
  }
  return curve;
}

export function makeSaturationCurve(drivePercent: number, samples = 512): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const drive = Math.max(0, Math.min(100, drivePercent)) / 100;
  const amount = 1 + drive * 5;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

/**
 * Pitch-shift samples while keeping buffer length (speech timing).
 * pitchRatio < 1 = deeper. Cubic interpolation for cleaner lows.
 */
export function pitchShiftSameLength(input: Float32Array, pitchRatio: number): Float32Array {
  const ratio = Math.max(0.35, Math.min(2.2, pitchRatio));
  if (Math.abs(ratio - 1) < 0.008) return input;

  const out = new Float32Array(input.length);
  const last = input.length - 1;

  const at = (index: number) => input[Math.max(0, Math.min(last, index))];

  for (let i = 0; i < out.length; i++) {
    const src = i * ratio;
    const i1 = Math.floor(src);
    const frac = src - i1;
    const s0 = at(i1 - 1);
    const s1 = at(i1);
    const s2 = at(i1 + 1);
    const s3 = at(i1 + 2);
    // Catmull-Rom
    out[i] =
      0.5 *
      (2 * s1 +
        (-s0 + s2) * frac +
        (2 * s0 - 5 * s1 + 4 * s2 - s3) * frac * frac +
        (-s0 + 3 * s1 - 3 * s2 + s3) * frac * frac * frac);
  }
  return out;
}

/** Mix a little filtered noise into samples for growl texture. */
export function mixNoiseTexture(input: Float32Array, mix: number): Float32Array {
  const amount = Math.max(0, Math.min(1, mix));
  if (amount <= 0) return input;
  const out = new Float32Array(input.length);
  let prev = 0;
  for (let i = 0; i < input.length; i++) {
    const white = Math.random() * 2 - 1;
    // Simple 1-pole low-pass noise (~dark texture)
    prev = prev * 0.92 + white * 0.08;
    out[i] = input[i] * (1 - amount * 0.35) + prev * amount;
  }
  return out;
}

/** Envelope-followed 60Hz (or custom) sine for cinematic sub weight. */
export function synthesizeSidechainSubBass(
  source: Float32Array,
  sampleRate: number,
  config: VoiceSubBassConfig,
): Float32Array {
  const out = new Float32Array(source.length);
  const attackCoeff = Math.exp(-1 / Math.max(1, (sampleRate * config.attackMs) / 1000));
  const releaseCoeff = Math.exp(-1 / Math.max(1, (sampleRate * config.releaseMs) / 1000));
  let env = 0;
  let phase = 0;
  const phaseInc = (2 * Math.PI * config.frequency) / sampleRate;

  for (let i = 0; i < source.length; i++) {
    const level = Math.abs(source[i]);
    const coeff = level > env ? attackCoeff : releaseCoeff;
    env = coeff * env + (1 - coeff) * level;
    out[i] = Math.sin(phase) * env * config.volume * 2.2;
    phase += phaseInc;
    if (phase > Math.PI * 2) phase -= Math.PI * 2;
  }
  return out;
}

export function createSmallRoomImpulse(
  ctx: AudioContext,
  durationSec = 0.8,
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const decay = (1 - i / length) ** 3.2;
      data[i] = (Math.random() * 2 - 1) * decay * 0.45;
    }
  }
  return impulse;
}

export type VoiceEffectGraph = {
  input: GainNode;
  nodes: AudioNode[];
};

function connectWetDryShaper(
  ctx: AudioContext,
  input: AudioNode,
  curve: Float32Array<ArrayBuffer>,
  mixPercent: number,
  nodes: AudioNode[],
): AudioNode {
  const mix = Math.max(0, Math.min(100, mixPercent)) / 100;
  if (mix <= 0) return input;

  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1 - mix;
  wet.gain.value = mix;

  const shaper = ctx.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = "2x";

  const bus = ctx.createGain();
  input.connect(dry);
  input.connect(shaper);
  shaper.connect(wet);
  dry.connect(bus);
  wet.connect(bus);
  nodes.push(dry, wet, shaper, bus);
  return bus;
}

/**
 * Bus FX after layered voices are mixed:
 * compressor → EQ → saturation → bus distortion → reverb → stereo → limiter → out
 */
export function connectVoiceEffectChain(
  ctx: AudioContext,
  config: VoicePresetConfig,
  destination: AudioNode = ctx.destination,
): VoiceEffectGraph {
  const nodes: AudioNode[] = [];
  const input = ctx.createGain();
  input.gain.value = 1;
  nodes.push(input);

  let last: AudioNode = input;

  if (config.compressor) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = config.compressor.threshold;
    compressor.ratio.value = config.compressor.ratio;
    compressor.attack.value = config.compressor.attack;
    compressor.release.value = config.compressor.release;
    compressor.knee.value = config.compressor.knee ?? 6;
    last.connect(compressor);
    last = compressor;
    nodes.push(compressor);

    if (config.compressor.makeupDb) {
      const makeup = ctx.createGain();
      makeup.gain.value = 10 ** (config.compressor.makeupDb / 20);
      last.connect(makeup);
      last = makeup;
      nodes.push(makeup);
    }
  }

  for (const filterConfig of config.filters) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterConfig.type;
    filter.frequency.value = filterConfig.frequency;
    if (filterConfig.Q != null) filter.Q.value = filterConfig.Q;
    if (filterConfig.gain != null) filter.gain.value = filterConfig.gain;
    last.connect(filter);
    last = filter;
    nodes.push(filter);
  }

  if (config.saturation && config.saturation.mix > 0) {
    last = connectWetDryShaper(
      ctx,
      last,
      makeSaturationCurve(config.saturation.drive),
      config.saturation.mix,
      nodes,
    );
  } else if (config.distortion && config.distortion > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(config.distortion);
    shaper.oversample = "4x";
    last.connect(shaper);
    last = shaper;
    nodes.push(shaper);
  }

  if (config.busDistortion && config.busDistortion.mix > 0) {
    last = connectWetDryShaper(
      ctx,
      last,
      makeDistortionCurve(config.busDistortion.amount / 100),
      config.busDistortion.mix,
      nodes,
    );
  }

  if (config.reverb?.enabled && (config.reverb.mix ?? 0) > 0) {
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const mix = Math.max(0, Math.min(100, config.reverb.mix)) / 100;
    dry.gain.value = 1 - mix;
    wet.gain.value = mix;

    let reverbInput: AudioNode = last;
    if (config.reverb.preDelaySec && config.reverb.preDelaySec > 0) {
      const preDelay = ctx.createDelay(0.1);
      preDelay.delayTime.value = config.reverb.preDelaySec;
      last.connect(preDelay);
      reverbInput = preDelay;
      nodes.push(preDelay);
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = createSmallRoomImpulse(ctx, config.reverb.durationSec ?? 0.8);

    const revBus = ctx.createGain();
    last.connect(dry);
    reverbInput.connect(convolver);
    convolver.connect(wet);
    dry.connect(revBus);
    wet.connect(revBus);

    last = revBus;
    nodes.push(dry, wet, convolver, revBus);
  } else if (config.delayMs && config.delayMs > 0 && (config.delayMix ?? 0) > 0) {
    const wetDry = ctx.createGain();
    wetDry.gain.value = 1;
    last.connect(wetDry);

    const delay = ctx.createDelay(1);
    delay.delayTime.value = config.delayMs / 1000;
    const feedback = ctx.createGain();
    feedback.gain.value = Math.max(0, Math.min(0.85, config.delayFeedback ?? 0.2));
    const delayMix = ctx.createGain();
    delayMix.gain.value = Math.max(0, Math.min(1, config.delayMix ?? 0.25));

    wetDry.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayMix);

    const mixBus = ctx.createGain();
    wetDry.connect(mixBus);
    delayMix.connect(mixBus);
    last = mixBus;
    nodes.push(wetDry, delay, feedback, delayMix, mixBus);
  }

  const width = config.stereoWidth ?? 1;
  if (width > 1.001) {
    const amount = Math.min(0.22, Math.max(0, width - 1));
    const dry = ctx.createGain();
    dry.gain.value = 1;
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.0009;
    const side = ctx.createGain();
    side.gain.value = amount;
    const invert = ctx.createGain();
    invert.gain.value = -1;

    const left = ctx.createGain();
    const right = ctx.createGain();
    const merger = ctx.createChannelMerger(2);

    last.connect(dry);
    last.connect(delay);
    delay.connect(side);

    dry.connect(left);
    side.connect(left);
    dry.connect(right);
    side.connect(invert);
    invert.connect(right);

    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    last = merger;
    nodes.push(dry, delay, side, invert, left, right, merger);
  }

  if (config.limiter) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = config.limiter.threshold;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = config.limiter.release;
    last.connect(limiter);
    last = limiter;
    nodes.push(limiter);
  }

  const outputGain = ctx.createGain();
  outputGain.gain.value = config.gain;
  last.connect(outputGain);
  outputGain.connect(destination);
  nodes.push(outputGain);

  return { input, nodes };
}

function connectLayerChain(
  ctx: AudioContext,
  source: AudioBufferSourceNode,
  layer: VoiceLayerConfig,
  destination: AudioNode,
): AudioNode[] {
  const nodes: AudioNode[] = [];
  let last: AudioNode = source;

  for (const filterConfig of layer.filters ?? []) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterConfig.type;
    filter.frequency.value = filterConfig.frequency;
    if (filterConfig.Q != null) filter.Q.value = filterConfig.Q;
    if (filterConfig.gain != null) filter.gain.value = filterConfig.gain;
    last.connect(filter);
    last = filter;
    nodes.push(filter);
  }

  if (layer.distortion && layer.distortion > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(layer.distortion);
    shaper.oversample = "2x";
    last.connect(shaper);
    last = shaper;
    nodes.push(shaper);
  }

  const gain = ctx.createGain();
  gain.gain.value = layer.gain;
  last.connect(gain);
  gain.connect(destination);
  nodes.push(gain);
  return nodes;
}

export type ScheduledVoicePlayback = {
  sources: AudioBufferSourceNode[];
  nodes: AudioNode[];
  duration: number;
};

/**
 * Pitch-shift + mix parallel layers (and optional sub-bass) into the bus input.
 */
export function scheduleVoicePresetChunk(
  ctx: AudioContext,
  monoSamples: Float32Array,
  sampleRate: number,
  config: VoicePresetConfig,
  mixInput: GainNode,
  startAt: number,
): ScheduledVoicePlayback {
  const playbackRate = Math.max(0.25, Math.min(4, config.playbackRate || 1));
  const layers = resolveVoiceLayers(config);
  const sources: AudioBufferSourceNode[] = [];
  const nodes: AudioNode[] = [];
  let duration = 0;

  let mainLayerSamples: Float32Array | null = null;

  for (const layer of layers) {
    let samples = pitchShiftSameLength(monoSamples, layerPitchRatio(layer));
    if (layer.noiseMix && layer.noiseMix > 0) {
      samples = mixNoiseTexture(samples, layer.noiseMix);
    }
    if (layer.id === "main" || (!layer.id && layers.indexOf(layer) === 0)) {
      mainLayerSamples = samples;
    }

    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const layerNodes = connectLayerChain(ctx, source, layer, mixInput);
    nodes.push(...layerNodes);

    const delaySec = (layer.delayMs ?? 0) / 1000;
    source.start(startAt + delaySec);
    sources.push(source);

    duration = Math.max(duration, buffer.duration / playbackRate + delaySec);
  }

  if (config.subBass && mainLayerSamples) {
    const subSamples = synthesizeSidechainSubBass(mainLayerSamples, sampleRate, config.subBass);
    const buffer = ctx.createBuffer(1, subSamples.length, sampleRate);
    buffer.getChannelData(0).set(subSamples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const subFilter = ctx.createBiquadFilter();
    subFilter.type = "lowpass";
    subFilter.frequency.value = 90;
    subFilter.Q.value = 0.7;

    const subGain = ctx.createGain();
    subGain.gain.value = 1;

    source.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(mixInput);

    source.start(startAt);
    sources.push(source);
    nodes.push(subFilter, subGain);
    duration = Math.max(duration, buffer.duration / playbackRate);
  }

  return { sources, nodes, duration };
}
