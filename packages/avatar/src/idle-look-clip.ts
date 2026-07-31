/**
 * Authored idle look left/right clip (pose lab → product).
 * Plays occasionally during idle for natural head motion.
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

/** Default idle glance — “Random left right idle” for Alex / full-body Mixamo. */
export const IDLE_LOOK_CLIP: GesturePoseClip = {
  version: 1,
  title: "Random left right idle",
  period: 4,
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
      time: 0.725,
      pose: {
        head: { x: 0, y: -24, z: 0 },
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
      time: 1.326,
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
      time: 3.187,
      pose: {
        head: { x: 0, y: 21, z: 0 },
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
  ],
};

/** Chance to start the look clip each time the idle roll fires. */
export const IDLE_LOOK_CHANCE = 0.2;

/** Sample idle look at `timeSec` (clamped — plays once, does not loop). */
export function sampleIdleLook(timeSec: number): AvatarIdlePoseOffsets {
  const { keyframes, period } = IDLE_LOOK_CLIP;
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
