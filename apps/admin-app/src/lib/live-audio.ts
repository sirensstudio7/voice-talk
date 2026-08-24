const SAMPLE_RATE = 24_000;

class LivePcmPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  private generation = 0;

  unlockSync() {
    if (typeof window === "undefined") return;
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext();
      this.nextStartTime = 0;
    }
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }
    try {
      const buffer = this.audioContext.createBuffer(1, 1, this.audioContext.sampleRate);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start(0);
    } catch {
      // ignore
    }
  }

  async unlock() {
    this.unlockSync();
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  play(arrayBuffer: ArrayBuffer, sampleRate = SAMPLE_RATE) {
    void this.playAsync(arrayBuffer, sampleRate);
  }

  async playAsync(arrayBuffer: ArrayBuffer, sampleRate = SAMPLE_RATE) {
    const gen = this.generation;
    await this.unlock();
    if (gen !== this.generation) return;
    const ctx = this.audioContext;
    if (!ctx) return;
    const pcm = new Int16Array(arrayBuffer);
    if (!pcm.length) return;
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) floats[i] = pcm[i]! / 32768;
    const buffer = ctx.createBuffer(1, floats.length, sampleRate);
    buffer.copyToChannel(floats, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const now = ctx.currentTime;
    this.nextStartTime = Math.max(now, this.nextStartTime);
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((node) => node !== source);
    };
  }

  remainingMs() {
    const ctx = this.audioContext;
    if (!ctx || this.nextStartTime <= 0) return 0;
    return Math.max(0, (this.nextStartTime - ctx.currentTime) * 1000);
  }

  stop() {
    this.generation += 1;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // ignore
      }
    }
    this.sources = [];
    this.nextStartTime = 0;
  }
}

const player = new LivePcmPlayer();

export function unlockLiveAudio() {
  player.unlockSync();
}

export function stopLiveSpeech() {
  player.stop();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
}

export function playLivePcm(arrayBuffer: ArrayBuffer): number {
  player.play(arrayBuffer);
  return Math.max(80, Math.round((arrayBuffer.byteLength / 2 / SAMPLE_RATE) * 1000));
}

export function livePlaybackRemainingMs() {
  return player.remainingMs();
}

export async function playLiveWavBase64(b64: string): Promise<number> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  if (bytes.byteLength > 44 && String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === "RIFF") {
    const pcm = bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.byteLength);
    const ms = playLivePcm(pcm);
    return Math.max(1, ms / 1000);
  }
  playLivePcm(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return Math.max(1, bytes.byteLength / 2 / SAMPLE_RATE);
}

export function speakLiveText(text: string): number {
  if (typeof window === "undefined" || !text.trim() || !window.speechSynthesis) return 0;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text.trim());
  utter.rate = 1;
  const voices = synth.getVoices();
  const male =
    voices.find((voice) => /daniel|alex|fred|david|google us english/i.test(voice.name)) ??
    voices.find((voice) => /male/i.test(voice.name));
  if (male) utter.voice = male;
  window.setTimeout(() => {
    try {
      synth.resume();
      synth.speak(utter);
    } catch {
      // ignore
    }
  }, 40);
  return Math.max(2_200, Math.min(12_000, text.trim().length * 55 + 800));
}
