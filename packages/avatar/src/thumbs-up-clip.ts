/**
 * Authored thumbs-up clip (pose lab → product).
 * Plays once when the assistant acknowledges (e.g. "Ok", "Baik").
 */

import type { AvatarIdlePoseOffsets, BoneOffsetDeg } from "./avatar-idle-controller";

export type GesturePoseKeyframe = {
  time: number;
  pose: AvatarIdlePoseOffsets;
};

export type GesturePoseClip = {
  version: 1;
  title: string;
  period: number;
  modelId: string;
  keyframes: GesturePoseKeyframe[];
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

/** Default thumbs-up — “Thumbs Up” for Alex / full-body Mixamo. */
export const THUMBS_UP_CLIP: GesturePoseClip = {
  version: 1,
  title: "Thumbs Up",
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
      time: 0.279,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 4, z: 1 },
        rightShoulder: { x: -19, y: -4, z: -1 },
        leftArm: { x: 20, y: -50, z: 7 },
        rightArm: { x: 20, y: 52, z: -11 },
        leftForeArm: { x: 28, y: 21, z: -32 },
        rightForeArm: { x: 45, y: -46, z: -51 },
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
      time: 0.59,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 4, z: 1 },
        rightShoulder: { x: -18.28, y: -4, z: -1 },
        leftArm: { x: 20, y: -50, z: 7 },
        rightArm: { x: 20, y: 51.91, z: -10.83 },
        leftForeArm: { x: 28, y: 21, z: -32 },
        rightForeArm: { x: 44.28, y: -44.93, z: -47.46 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: -4, y: -29, z: 3 },
        leftThumb: { x: 0, y: 0, z: 0 },
        rightThumb: { x: 4, y: 0, z: -26 },
        leftIndex: { x: 0, y: 0, z: 0 },
        rightIndex: { x: 120, y: 0, z: 0 },
        leftMiddle: { x: 0, y: 0, z: 0 },
        rightMiddle: { x: 111, y: 0, z: 0 },
        leftRing: { x: 0, y: 0, z: 0 },
        rightRing: { x: 120, y: 0, z: 0 },
        leftPinky: { x: 0, y: 0, z: 0 },
        rightPinky: { x: 107, y: 0, z: 0 },
      },
    },
    {
      time: 1.465,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 4, z: 1 },
        rightShoulder: { x: -18.28, y: -4, z: -1 },
        leftArm: { x: 20, y: -50, z: 7 },
        rightArm: { x: 20, y: 51.91, z: -10.83 },
        leftForeArm: { x: 28, y: 21, z: -32 },
        rightForeArm: { x: 44.28, y: -44.93, z: -47.46 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: -4, y: -29, z: 3 },
        leftThumb: { x: 0, y: 0, z: 0 },
        rightThumb: { x: 4, y: 0, z: -26 },
        leftIndex: { x: 0, y: 0, z: 0 },
        rightIndex: { x: 120, y: 0, z: 0 },
        leftMiddle: { x: 0, y: 0, z: 0 },
        rightMiddle: { x: 111, y: 0, z: 0 },
        leftRing: { x: 0, y: 0, z: 0 },
        rightRing: { x: 120, y: 0, z: 0 },
        leftPinky: { x: 0, y: 0, z: 0 },
        rightPinky: { x: 107, y: 0, z: 0 },
      },
    },
  ],
};

/** Sample thumbs-up at `timeSec` (clamped — plays once, does not loop). */
export function sampleThumbsUp(timeSec: number): AvatarIdlePoseOffsets {
  const { keyframes, period } = THUMBS_UP_CLIP;
  if (keyframes.length === 0) return emptyPose();
  if (keyframes.length === 1) return clonePose(keyframes[0].pose);

  const p = Math.max(0.1, period);
  const t = Math.min(Math.max(0, timeSec), p);
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  if (t <= sorted[0].time) return clonePose(sorted[0].pose);
  const last = sorted[sorted.length - 1];
  if (t >= last.time) return clonePose(last.pose);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = Math.max(0.0001, b.time - a.time);
      return lerpPose(a.pose, b.pose, (t - a.time) / span);
    }
  }

  return clonePose(sorted[0].pose);
}
