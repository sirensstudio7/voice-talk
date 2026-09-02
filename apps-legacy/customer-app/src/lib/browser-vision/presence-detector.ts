import {
  FaceDetector,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

import type { PersonDetection } from "./types";

const FACE_MODEL_PATH = "/models/blaze_face_short_range.tflite";
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const ZONE_WIDTH_RATIO = 0.5;
const BROWSER_TRACK_ID = 1;

export function minBBoxHeightRatioForDistance(distanceM: number): number {
  const distance = Math.max(1, Math.min(distanceM, 2.5));
  return 0.12 + (2.5 - distance) * 0.08;
}

export class BrowserPresenceDetector {
  private detector: FaceDetector | null = null;
  private timestampMs = 0;
  private detectionDistanceM = 2;
  private zoneWidthRatio = ZONE_WIDTH_RATIO;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
    this.detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL_PATH },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
  }

  setDetectionDistanceM(distanceM: number): void {
    this.detectionDistanceM = Math.max(1, Math.min(distanceM, 2.5));
  }

  detectPrimary(video: HTMLVideoElement): PersonDetection | null {
    if (!this.detector || video.videoWidth === 0) {
      return null;
    }

    this.timestampMs += 33;
    const result = this.detector.detectForVideo(video, this.timestampMs);
    if (!result.detections.length) {
      return null;
    }

    const zoneLeft = (1 - this.zoneWidthRatio) / 2;
    const zoneRight = 1 - zoneLeft;
    const minHeightRatio = minBBoxHeightRatioForDistance(this.detectionDistanceM);

    let best: PersonDetection | null = null;
    let bestKey: [number, number] | null = null;

    for (const detection of result.detections) {
      const box = detection.boundingBox;
      if (!box) continue;

      const width = video.videoWidth;
      const height = video.videoHeight;
      const nx1 = box.originX / width;
      const ny1 = box.originY / height;
      const nx2 = (box.originX + box.width) / width;
      const ny2 = (box.originY + box.height) / height;
      const centerX = (nx1 + nx2) / 2;
      const centerY = (ny1 + ny2) / 2;
      const heightRatio = ny2 - ny1;
      const inZone =
        zoneLeft <= centerX &&
        centerX <= zoneRight &&
        centerY >= 0 &&
        centerY <= 1;
      const distanceOk = heightRatio >= minHeightRatio;

      if (!inZone || !distanceOk) continue;

      const sortKey: [number, number] = [Math.abs(centerX - 0.5), -heightRatio];
      if (
        bestKey === null ||
        sortKey[0] < bestKey[0] ||
        (sortKey[0] === bestKey[0] && sortKey[1] < bestKey[1])
      ) {
        bestKey = sortKey;
        best = {
          track_id: BROWSER_TRACK_ID,
          center_x: centerX,
          center_y: centerY,
          height_ratio: heightRatio,
          in_zone: inZone,
          distance_ok: distanceOk,
        };
      }
    }

    return best;
  }

  /** Synthetic presence when hand modes still need a person-in-frame signal. */
  static syntheticFromHandRaised(): PersonDetection {
    return {
      track_id: BROWSER_TRACK_ID,
      center_x: 0.5,
      center_y: 0.5,
      height_ratio: 0.4,
      in_zone: true,
      distance_ok: true,
    };
  }

  close(): void {
    this.detector?.close();
    this.detector = null;
  }
}
