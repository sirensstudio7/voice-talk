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
  private playbackAnalyser: AnalyserNode | null = null;
  private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;
  private smoothedPlaybackLevel = 0;

  async initialize(): Promise<void> {
    await this.unlockPlayback();
    await this.ensureWorkletLoaded();
  }

  private workletLoadPromise: Promise<void> | null = null;

  private async ensureWorkletLoaded(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (!this.workletLoadPromise) {
      this.workletLoadPromise = this.audioContext.audioWorklet
        .addModule("/pcm-processor.js")
        .then(() => {
          // Never rebuild if PCM is already routed — tearing down the graph
          // disconnects live BufferSources → silent greeting with chat still working.
          if (!this.playbackInput && !this.hasActivePlayback()) {
            this.rebuildPlaybackChain();
          }
        })
        .catch((err) => {
          this.workletLoadPromise = null;
          throw err;
        });
    }
    await this.workletLoadPromise;
    if (!this.playbackInput && !this.hasActivePlayback()) {
      this.rebuildPlaybackChain();
    }
  }

  /**
   * Synchronous kick during a click/tap — create + resume before any await.
   * Call this first in the Order Now handler (do not only void an async unlock).
   */
  unlockPlaybackSync(): void {
    if (typeof window === "undefined") return;
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext();
      this.workletLoadPromise = null;
    }
    this.installAutoResume();
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }
    if (this.audioContext.state === "running") {
      try {
        const buffer = this.audioContext.createBuffer(1, 1, this.audioContext.sampleRate);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(0);
      } catch {
        // no-op
      }
    }
    // Do NOT load the mic AudioWorklet here — it rebuilds the playback graph
    // and can disconnect greeting PCM mid-stream (chat text still appears).
    // Worklet loads only when the mic is prepared.
  }

  /** Re-attach resume listeners so returning to the tab restores greeting audio. */
  installAutoResume(): void {
    if (typeof window === "undefined" || this.autoResumeInstalled) return;
    this.autoResumeInstalled = true;
    const resume = () => {
      if (this.audioContext?.state === "suspended") {
        void this.audioContext.resume();
      }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resume();
    });
    window.addEventListener("focus", resume);
    window.addEventListener("pointerdown", resume, { passive: true });
  }

  private autoResumeInstalled = false;

  /**
   * Must run during a user gesture. Resume BEFORE awaiting worklet/module loads —
   * awaiting fetch first lets the gesture expire and Chrome keeps the context suspended
   * (transcript still works; PCM schedules silently).
   */
  async unlockPlayback(): Promise<void> {
    this.unlockPlaybackSync();
    if (!this.audioContext) return;
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        // Gesture may have expired.
      }
    }
    if (this.audioContext.state === "running") {
      try {
        const buffer = this.audioContext.createBuffer(1, 1, this.audioContext.sampleRate);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(0);
      } catch {
        // no-op
      }
    }
  }

  getAudioContextState(): string {
    return this.audioContext?.state ?? "none";
  }

  setVoicePreset(preset: VoicePreset | string | null | undefined): void {
    const next = normalizeVoicePreset(preset);
    if (next === this.voicePreset && this.playbackInput) return;
    this.voicePreset = next;
    if (!this.audioContext) return;
    // Rebuilding mid-playback disconnects live BufferSources → silence.
    if (this.hasActivePlayback()) return;
    this.rebuildPlaybackChain();
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
    if (this.playbackAnalyser) {
      try {
        this.playbackAnalyser.disconnect();
      } catch {
        // no-op
      }
    }
    this.playbackAnalyser = null;
    this.analyserBuffer = null;
  }

  private rebuildPlaybackChain(): void {
    if (!this.audioContext) return;
    // Mid-playback rebuild disconnects scheduled sources → silent AI voice.
    if (this.hasActivePlayback()) return;

    this.teardownPlaybackChain();

    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.35;
    analyser.connect(this.audioContext.destination);
    this.playbackAnalyser = analyser;
    this.analyserBuffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    const config = getVoicePresetConfig(this.voicePreset);
    const graph = connectVoiceEffectChain(this.audioContext, config, analyser);
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

    // getUserMedia / permission UI often leaves AudioContext suspended.
    await this.unlockPlayback();

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
    // Playback must NOT depend on the mic AudioWorklet — if /pcm-processor.js
    // is slow or fails, greeting PCM was never scheduled (chat still worked).
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext();
      this.workletLoadPromise = null;
      this.installAutoResume();
    }
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        // Schedule anyway; may become audible after a later unlock.
      }
    }

    const playbackInput = this.ensurePlaybackChain();
    if (!playbackInput || !this.audioContext) return;

    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        // still schedule
      }
    }

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

  /** Smoothed 0–1 amplitude of assistant playback for lip sync. */
  getPlaybackLevel(): number {
    if (!this.hasActivePlayback() || !this.playbackAnalyser || !this.analyserBuffer) {
      this.smoothedPlaybackLevel *= 0.72;
      if (this.smoothedPlaybackLevel < 0.01) this.smoothedPlaybackLevel = 0;
      return this.smoothedPlaybackLevel;
    }

    this.playbackAnalyser.getByteTimeDomainData(this.analyserBuffer);
    let sumSquares = 0;
    for (let i = 0; i < this.analyserBuffer.length; i++) {
      const sample = (this.analyserBuffer[i] - 128) / 128;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / this.analyserBuffer.length);

    const noiseFloor = 0.015;
    const gain = 4.2;
    const maxOpen = 0.55;
    const gated = Math.max(0, rms - noiseFloor);
    const target = Math.min(maxOpen, gated * gain);

    const alpha = target > this.smoothedPlaybackLevel ? 0.5 : 0.28;
    this.smoothedPlaybackLevel += (target - this.smoothedPlaybackLevel) * alpha;
    if (this.smoothedPlaybackLevel < 0.008) this.smoothedPlaybackLevel = 0;
    return this.smoothedPlaybackLevel;
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
    this.smoothedPlaybackLevel = 0;
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
    this.workletLoadPromise = null;
  }
}
