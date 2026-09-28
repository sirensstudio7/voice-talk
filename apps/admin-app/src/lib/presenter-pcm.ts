/** Minimal 24 kHz PCM player for AI Presenter Live audio. */

export class PresenterPcmPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  private pendingPlays = 0;
  private generation = 0;
  private playbackAnalyser: AnalyserNode | null = null;
  private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;
  private smoothedPlaybackLevel = 0;

  async unlock(): Promise<void> {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext();
      this.nextStartTime = 0;
      this.playbackAnalyser = null;
      this.analyserBuffer = null;
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    this.ensureAnalyser();
  }

  private ensureAnalyser(): void {
    const ctx = this.audioContext;
    if (!ctx || this.playbackAnalyser) return;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.35;
    analyser.connect(ctx.destination);
    this.playbackAnalyser = analyser;
    this.analyserBuffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }

  play(arrayBuffer: ArrayBuffer, sampleRate = 24_000): void {
    void this.playAsync(arrayBuffer, sampleRate);
  }

  async playAsync(arrayBuffer: ArrayBuffer, sampleRate = 24_000): Promise<void> {
    this.pendingPlays += 1;
    const gen = this.generation;
    try {
      await this.unlock();
      if (gen !== this.generation) return;
      const ctx = this.audioContext;
      const analyser = this.playbackAnalyser;
      if (!ctx || !analyser) return;

      const pcm = new Int16Array(arrayBuffer);
      if (!pcm.length) return;
      const floats = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) {
        floats[i] = pcm[i]! / 32768;
      }

      const buffer = ctx.createBuffer(1, floats.length, sampleRate);
      buffer.copyToChannel(floats, 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);

      const now = ctx.currentTime;
      this.nextStartTime = Math.max(now, this.nextStartTime);
      const startAt = this.nextStartTime;
      source.start(startAt);
      this.nextStartTime = startAt + buffer.duration;

      this.sources.push(source);
      source.onended = () => {
        this.sources = this.sources.filter((node) => node !== source);
      };
    } finally {
      this.pendingPlays = Math.max(0, this.pendingPlays - 1);
    }
  }

  stop(): void {
    this.generation += 1;
    this.pendingPlays = 0;
    this.smoothedPlaybackLevel = 0;
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

  hasActivePlayback(): boolean {
    return this.sources.length > 0 || this.pendingPlays > 0;
  }

  /** Seconds of audio still queued / playing from now. */
  remainingSeconds(): number {
    const ctx = this.audioContext;
    if (!ctx || this.nextStartTime <= 0) return 0;
    return Math.max(0, this.nextStartTime - ctx.currentTime);
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
      const sample = (this.analyserBuffer[i]! - 128) / 128;
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

  /**
   * Wait until queued PCM finishes. Optionally require `silenceMs` with no new
   * activity (caller should refresh lastPcm while chunks arrive).
   */
  async waitUntilQuiet(
    timeoutMs = 60_000,
    settleMs = 220,
    isCancelled?: () => boolean,
  ): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isCancelled?.()) return;
      if (this.hasActivePlayback() || this.remainingSeconds() > 0.05) break;
      await new Promise((r) => setTimeout(r, 25));
      // Don't give up too early — PCM schedule can lag turn_complete slightly.
      if (Date.now() - started > 2_500) break;
    }

    while (Date.now() - started < timeoutMs) {
      if (isCancelled?.()) return;
      const remaining = this.remainingSeconds();
      if (!this.hasActivePlayback() && remaining <= 0.05) {
        await new Promise((r) => setTimeout(r, settleMs));
        if (isCancelled?.()) return;
        if (!this.hasActivePlayback() && this.remainingSeconds() <= 0.05) return;
        continue;
      }
      const waitMs = Math.min(100, Math.max(25, remaining * 1000 * 0.4));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  /** Approx duration of received PCM at 24 kHz mono int16. */
  static pcmDurationMs(byteLength: number, sampleRate = 24_000): number {
    if (byteLength <= 0) return 0;
    return Math.round((byteLength / 2 / sampleRate) * 1000);
  }

  close(): void {
    this.stop();
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.playbackAnalyser = null;
    this.analyserBuffer = null;
  }
}

export function buildPresenterWsUrl(
  token: string,
  businessId: string,
  sessionId: string,
  opts?: { share?: boolean },
): string {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const url = new URL(api);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/presentation-session";
  if (opts?.share) {
    url.searchParams.set("shareToken", token);
  } else {
    url.searchParams.set("token", token);
  }
  url.searchParams.set("businessId", businessId);
  url.searchParams.set("sessionId", sessionId);
  return url.toString();
}
