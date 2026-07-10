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
  private recording = false;
  private micReady = false;

  async initialize(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      await this.audioContext.audioWorklet.addModule("/pcm-processor.js");
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async prepareMicrophone(): Promise<void> {
    await this.initialize();

    if (this.micReady && this.mediaStream) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

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
    if (!this.audioContext) return;
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }

    const pcmData = new Int16Array(arrayBuffer);
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 32768;
    }

    const buffer = this.audioContext.createBuffer(1, float32Data.length, sampleRate);
    buffer.getChannelData(0).set(float32Data);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    const wasIdle = this.scheduledSources.length === 0;
    this.nextStartTime = Math.max(now, this.nextStartTime);

    if (wasIdle) {
      this.playbackStartTime = this.nextStartTime;
      this.totalScheduledDuration = 0;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    this.totalScheduledDuration += buffer.duration;

    this.scheduledSources.push(source);
    source.onended = () => {
      this.scheduledSources = this.scheduledSources.filter((node) => node !== source);
    };
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
    this.totalScheduledDuration = 0;
    this.playbackStartTime = 0;
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  dispose(): void {
    this.stopCapture();
    this.stopPlayback();
    void this.audioContext?.close();
    this.audioContext = null;
  }
}
