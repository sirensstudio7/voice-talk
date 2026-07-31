/**
 * Authored greeting hand-wave clip (pose lab → product default).
 * Loops while avatar mode is "greeting".
 */

import type { AvatarIdlePoseOffsets, BoneOffsetDeg } from "./avatar-idle-controller";

export type GreetingWaveKeyframe = {
  time: number;
  pose: AvatarIdlePoseOffsets;
};

export type GreetingWaveClip = {
  version: 1;
  title: string;
  period: number;
  modelId: string;
  keyframes: GreetingWaveKeyframe[];
};

const POSE_KEYS: (keyof AvatarIdlePoseOffsets)[] = [
  "head",
  "neck",
  "chest",
  "leftShoulder",
  "rightShoulder",
  "leftArm",
  "rightArm",
  "leftForeArm",
  "rightForeArm",
  "leftHand",
  "rightHand",
  "leftThumb",
  "rightThumb",
  "leftIndex",
  "rightIndex",
  "leftMiddle",
  "rightMiddle",
  "leftRing",
  "rightRing",
  "leftPinky",
  "rightPinky",
];

const ZERO: BoneOffsetDeg = { x: 0, y: 0, z: 0 };

function emptyPose(): AvatarIdlePoseOffsets {
  const next = {} as AvatarIdlePoseOffsets;
  for (const key of POSE_KEYS) next[key] = { ...ZERO };
  return next;
}

function clonePose(pose: AvatarIdlePoseOffsets): AvatarIdlePoseOffsets {
  const next = {} as AvatarIdlePoseOffsets;
  for (const key of POSE_KEYS) {
    const src = pose[key] ?? ZERO;
    next[key] = { x: src.x, y: src.y, z: src.z };
  }
  return next;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(
  a: AvatarIdlePoseOffsets,
  b: AvatarIdlePoseOffsets,
  t: number,
): AvatarIdlePoseOffsets {
  const next = {} as AvatarIdlePoseOffsets;
  for (const key of POSE_KEYS) {
    const pa = a[key] ?? ZERO;
    const pb = b[key] ?? ZERO;
    next[key] = {
      x: lerp(pa.x, pb.x, t),
      y: lerp(pa.y, pb.y, t),
      z: lerp(pa.z, pb.z, t),
    };
  }
  return next;
}

/** Default greeting wave — “Greeting Hand Wave” for Alex / full-body Mixamo. */
export const GREETING_WAVE_CLIP: GreetingWaveClip = {
  version: 1,
  title: "Greeting Hand Wave",
  period: 2,
  modelId: "alex",
  keyframes: [
    {
      time: 0,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 4, z: 1 },
        rightShoulder: { x: -2, y: -4, z: -1 },
        leftArm: { x: 20, y: -50, z: 7 },
        rightArm: { x: 20, y: 50, z: -7 },
        leftForeArm: { x: 28, y: 21, z: -32 },
        rightForeArm: { x: 28, y: -21, z: 32 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: -4, y: -29, z: 3 },
        leftThumb: { x: 0, y: 0, z: 0 },
        rightThumb: { x: 0, y: 0, z: 0 },
        leftIndex: { x: 0, y: 0, z: 0 },
        rightIndex: { x: 0, y: 0, z: 0 },
        leftMiddle: { x: 0, y: 0, z: 0 },
        rightMiddle: { x: 0, y: 0, z: 0 },
        leftRing: { x: 0, y: 0, z: 0 },
        rightRing: { x: 0, y: 0, z: 0 },
        leftPinky: { x: 0, y: 0, z: 0 },
        rightPinky: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 0.695,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 7, z: 1 },
        rightShoulder: { x: -26, y: -3, z: 2 },
        leftArm: { x: 19, y: -50, z: 7 },
        rightArm: { x: 18, y: 83, z: -6 },
        leftForeArm: { x: 28, y: 25, z: -32 },
        rightForeArm: { x: 43, y: -58, z: -56 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: 0, y: -61, z: 4 },
        leftThumb: { x: 0, y: 0, z: 0 },
        rightThumb: { x: 0, y: 0, z: 0 },
        leftIndex: { x: 0, y: 0, z: 0 },
        rightIndex: { x: 0, y: 0, z: 0 },
        leftMiddle: { x: 0, y: 0, z: 0 },
        rightMiddle: { x: 0, y: 0, z: 0 },
        leftRing: { x: 0, y: 0, z: 0 },
        rightRing: { x: 0, y: 0, z: 0 },
        leftPinky: { x: 0, y: 0, z: 0 },
        rightPinky: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 0.996,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 6.95, z: 1 },
        rightShoulder: { x: -25.59, y: -3.02, z: 1.95 },
        leftArm: { x: 19.02, y: -50, z: 7 },
        rightArm: { x: 18.03, y: 82.44, z: -6.02 },
        leftForeArm: { x: 28, y: 24.93, z: -32 },
        rightForeArm: { x: 42.75, y: -72, z: -54.51 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: -1, y: -63, z: 3.98 },
        leftThumb: { x: 0, y: 0, z: 0 },
        rightThumb: { x: 0, y: 0, z: 0 },
        leftIndex: { x: 0, y: 0, z: 0 },
        rightIndex: { x: 0, y: 0, z: 0 },
        leftMiddle: { x: 0, y: 0, z: 0 },
        rightMiddle: { x: 0, y: 0, z: 0 },
        leftRing: { x: 0, y: 0, z: 0 },
        rightRing: { x: 0, y: 0, z: 0 },
        leftPinky: { x: 0, y: 0, z: 0 },
        rightPinky: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 1.239,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 6.91, z: 1 },
        rightShoulder: { x: -25.31, y: -3.03, z: 1.91 },
        leftArm: { x: 19.03, y: -50, z: 7 },
        rightArm: { x: 18.06, y: 82.06, z: -6.03 },
        leftForeArm: { x: 28, y: 24.89, z: -32 },
        rightForeArm: { x: 42.57, y: -58, z: -53.48 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: -1.04, y: -62.6, z: 3.97 },
        leftThumb: { x: 0, y: 0, z: 0 },
        rightThumb: { x: 0, y: 0, z: 0 },
        leftIndex: { x: 0, y: 0, z: 0 },
        rightIndex: { x: 0, y: 0, z: 0 },
        leftMiddle: { x: 0, y: 0, z: 0 },
        rightMiddle: { x: 0, y: 0, z: 0 },
        leftRing: { x: 0, y: 0, z: 0 },
        rightRing: { x: 0, y: 0, z: 0 },
        leftPinky: { x: 0, y: 0, z: 0 },
        rightPinky: { x: 0, y: 0, z: 0 },
      },
    },
    {
      time: 1.526,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 6.86, z: 1 },
        rightShoulder: { x: -24.87, y: -3.05, z: 1.86 },
        leftArm: { x: 19.05, y: -50, z: 7 },
        rightArm: { x: 18.09, y: 81.44, z: -6.05 },
        leftForeArm: { x: 28, y: 24.81, z: -32 },
        rightForeArm: { x: 42.29, y: -80, z: -51.84 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: -1.09, y: -61.95, z: 3.95 },
        leftThumb: { x: 0, y: 0, z: 0 },
        rightThumb: { x: 0, y: 0, z: 0 },
        leftIndex: { x: 0, y: 0, z: 0 },
        rightIndex: { x: 0, y: 0, z: 0 },
        leftMiddle: { x: 0, y: 0, z: 0 },
        rightMiddle: { x: 0, y: 0, z: 0 },
        leftRing: { x: 0, y: 0, z: 0 },
        rightRing: { x: 0, y: 0, z: 0 },
        leftPinky: { x: 0, y: 0, z: 0 },
        rightPinky: { x: 0, y: 0, z: 0 },
      },
    },
  ],
};

/** Peak raised-hand pose — useful for static previews. */
export const GREETING_POSE_OFFSETS: AvatarIdlePoseOffsets = clonePose(
  GREETING_WAVE_CLIP.keyframes[1]?.pose ?? emptyPose(),
);

/** Sample the greeting wave at `timeSec` (loops over clip period). */
export function sampleGreetingWave(timeSec: number): AvatarIdlePoseOffsets {
  const { keyframes, period } = GREETING_WAVE_CLIP;
  if (keyframes.length === 0) return emptyPose();
  if (keyframes.length === 1) return clonePose(keyframes[0].pose);

  const p = Math.max(0.1, period);
  const t = ((timeSec % p) + p) % p;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    const aTime = a.time;
    const bTime = i + 1 < sorted.length ? b.time : b.time + p;
    const localT = t < aTime && i === sorted.length - 1 ? t + p : t;
    if (localT >= aTime && localT <= bTime) {
      const span = Math.max(0.0001, bTime - aTime);
      return lerpPose(a.pose, b.pose, (localT - aTime) / span);
    }
  }

  return clonePose(sorted[0].pose);
}
