import {
  connectVoiceEffectChain,
  getVoicePresetConfig,
  normalizeVoicePreset,
  scheduleVoicePresetChunk,
  type VoicePreset,
  type VoicePresetConfig,
} from "@voicetalk/shared";

function downsampleBuffer(
  buffer: Float32Array,
  sampleRate: number,
  outSampleRate: number,
): Float32Array {
  if (outSampleRate === sampleRate) return buffer;

  const ratio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function convertFloat32ToInt16(buffer: Float32Array): ArrayBuffer {
  const output = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    output[i] = Math.min(1, Math.max(-1, buffer[i])) * 0x7fff;
  }
  return output.buffer;
}

export class VoiceAudioEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onAudioData: ((chunk: ArrayBuffer) => void) | null = null;
  private nextStartTime = 0;
  private playbackStartTime = 0;
  private totalScheduledDuration = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];
  private ephemeralNodes: AudioNode[] = [];
  private recording = false;
  private micReady = false;
  private prepareMicrophonePromise: Promise<void> | null = null;
  private voicePreset: VoicePreset = "natural";
  private playbackInput: GainNode | null = null;
  private effectNodes: AudioNode[] = [];

  async initialize(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      await this.audioContext.audioWorklet.addModule("/pcm-processor.js");
      this.rebuildPlaybackChain();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  setVoicePreset(preset: VoicePreset | string | null | undefined): void {
    const next = normalizeVoicePreset(preset);
    if (next === this.voicePreset && this.playbackInput) return;
    this.voicePreset = next;
    if (this.audioContext) {
      this.rebuildPlaybackChain();
    }
  }

  getVoicePreset(): VoicePreset {
    return this.voicePreset;
  }

  private teardownPlaybackChain(): void {
    for (const node of this.effectNodes) {
      try {
        node.disconnect();
      } catch {
        // no-op
      }
    }
    this.effectNodes = [];
    this.playbackInput = null;
  }

  private rebuildPlaybackChain(): void {
    if (!this.audioContext) return;

    this.teardownPlaybackChain();

    const config = getVoicePresetConfig(this.voicePreset);
    const graph = connectVoiceEffectChain(this.audioContext, config);
    this.playbackInput = graph.input;
    this.effectNodes = graph.nodes;
  }

  private ensurePlaybackChain(): GainNode | null {
    if (!this.audioContext) return null;
    if (!this.playbackInput) {
      this.rebuildPlaybackChain();
    }
    return this.playbackInput;
  }

  private getPresetConfig(): VoicePresetConfig {
    return getVoicePresetConfig(this.voicePreset);
  }

  async prepareMicrophone(): Promise<void> {
    if (this.prepareMicrophonePromise) {
      return this.prepareMicrophonePromise;
    }

    this.prepareMicrophonePromise = this.doPrepareMicrophone().finally(() => {
      this.prepareMicrophonePromise = null;
    });

    return this.prepareMicrophonePromise;
  }

  private async doPrepareMicrophone(): Promise<void> {
    await this.initialize();

    if (this.micReady && this.mediaStream) return;

    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
    }

    if (!this.mediaStream) {
      throw lastError ?? new Error("Microphone access failed.");
    }

    if (this.workletNode) {
      this.sourceNode?.disconnect();
      this.workletNode.disconnect();
    }

    this.sourceNode = this.audioContext!.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext!, "pcm-processor");

    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.recording || !this.audioContext || !this.onAudioData) return;
      const downsampled = downsampleBuffer(
        event.data,
        this.audioContext.sampleRate,
        16000,
      );
      this.onAudioData(convertFloat32ToInt16(downsampled));
    };

    this.sourceNode.connect(this.workletNode);
    const muteGain = this.audioContext!.createGain();
    muteGain.gain.value = 0;
    this.workletNode.connect(muteGain);
    muteGain.connect(this.audioContext!.destination);
    this.micReady = true;
  }

  async beginRecording(onAudioData: (chunk: ArrayBuffer) => void): Promise<void> {
    await this.prepareMicrophone();
    this.onAudioData = onAudioData;
    this.recording = true;
  }

  pauseRecording(): void {
    this.recording = false;
  }

  stopCapture(): void {
    this.recording = false;
    this.onAudioData = null;
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.sourceNode = null;
    this.workletNode = null;
    this.micReady = false;
  }

  playPcm(arrayBuffer: ArrayBuffer, sampleRate = 24000): void {
    void this.playPcmAsync(arrayBuffer, sampleRate);
  }

  async playPcmAsync(arrayBuffer: ArrayBuffer, sampleRate = 24000): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    if (!this.audioContext) return;

    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        return;
      }
    }

    const playbackInput = this.ensurePlaybackChain();
    if (!playbackInput) return;

    const pcmData = new Int16Array(arrayBuffer);
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 32768;
    }

    const config = this.getPresetConfig();
    const now = this.audioContext.currentTime;
    const wasIdle = this.scheduledSources.length === 0;
    this.nextStartTime = Math.max(now, this.nextStartTime);

    if (wasIdle) {
      this.playbackStartTime = this.nextStartTime;
      this.totalScheduledDuration = 0;
    }

    const startAt = this.nextStartTime;
    const scheduled = scheduleVoicePresetChunk(
      this.audioContext,
      float32Data,
      sampleRate,
      config,
      playbackInput,
      startAt,
    );

    this.ephemeralNodes.push(...scheduled.nodes);
    for (const source of scheduled.sources) {
      this.scheduledSources.push(source);
      source.onended = () => {
        this.scheduledSources = this.scheduledSources.filter((node) => node !== source);
      };
    }

    this.nextStartTime += scheduled.duration;
    this.totalScheduledDuration += scheduled.duration;
  }

  hasActivePlayback(): boolean {
    return this.scheduledSources.length > 0;
  }

  getRevealProgress(): number {
    if (this.totalScheduledDuration <= 0) return 0;
    if (!this.audioContext) return 0;

    if (!this.hasActivePlayback()) {
      return 1;
    }

    const elapsed = this.audioContext.currentTime - this.playbackStartTime;
    return Math.min(1, Math.max(0, elapsed / this.totalScheduledDuration));
  }

  stopPlayback(): void {
    this.scheduledSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // no-op
      }
    });
    this.scheduledSources = [];
    for (const node of this.ephemeralNodes) {
      try {
        node.disconnect();
      } catch {
        // no-op
      }
    }
    this.ephemeralNodes = [];
    this.totalScheduledDuration = 0;
    this.playbackStartTime = 0;
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  dispose(): void {
    this.stopCapture();
    this.stopPlayback();
    this.teardownPlaybackChain();
    void this.audioContext?.close();
    this.audioContext = null;
  }
}
