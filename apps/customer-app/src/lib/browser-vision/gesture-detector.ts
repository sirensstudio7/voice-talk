import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

export type GestureResult = {
  wave_detected: boolean;
  hand_raised: boolean;
};

const HAND_MODEL_PATH = "/models/hand_landmarker.task";
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

export class BrowserGestureDetector {
  private historyLen = 14;
  private minAmplitude = 0.045;
  private minReversals = 2;
  private minStep = 0.007;
  private raisedMaxY = 0.82;
  private timestampMs = 0;
  private wristXHistory: Array<number | null> = [];
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL_PATH },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.25,
      minHandPresenceConfidence: 0.25,
      minTrackingConfidence: 0.25,
    });
  }

  reset(): void {
    this.wristXHistory = [];
  }

  detect(video: HTMLVideoElement): GestureResult {
    if (!this.landmarker || video.videoWidth === 0) {
      return { wave_detected: false, hand_raised: false };
    }

    this.timestampMs += 33;
    const result = this.landmarker.detectForVideo(video, this.timestampMs);

    if (!result.landmarks.length) {
      this.wristXHistory.push(null);
      if (this.wristXHistory.length > this.historyLen) {
        this.wristXHistory.shift();
      }
      return { wave_detected: false, hand_raised: false };
    }

    const wrist = this.pickRaisedWrist(result);
    if (wrist === null) {
      this.wristXHistory.push(null);
      if (this.wristXHistory.length > this.historyLen) {
        this.wristXHistory.shift();
      }
      return { wave_detected: false, hand_raised: false };
    }

    this.wristXHistory.push(wrist.x);
    if (this.wristXHistory.length > this.historyLen) {
      this.wristXHistory.shift();
    }

    return {
      wave_detected: this.detectWave(),
      hand_raised: true,
    };
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }

  private pickRaisedWrist(
    result: HandLandmarkerResult,
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestY = 1;

    for (const handLandmarks of result.landmarks) {
      const wrist = handLandmarks[0];
      if (wrist.y > this.raisedMaxY) continue;
      if (wrist.y < bestY) {
        bestY = wrist.y;
        best = { x: wrist.x, y: wrist.y };
      }
    }

    return best;
  }

  private detectWave(): boolean {
    const valid = this.wristXHistory.filter((x): x is number => x !== null);
    if (valid.length < 8) return false;

    const amplitude = Math.max(...valid) - Math.min(...valid);
    if (amplitude < this.minAmplitude) return false;

    let reversals = 0;
    for (let index = 2; index < valid.length; index += 1) {
      const deltaPrev = valid[index - 1] - valid[index - 2];
      const deltaNext = valid[index] - valid[index - 1];
      if (
        deltaPrev * deltaNext < 0 &&
        Math.abs(deltaPrev) >= this.minStep &&
        Math.abs(deltaNext) >= this.minStep
      ) {
        reversals += 1;
      }
    }

    return reversals >= this.minReversals;
  }
}
