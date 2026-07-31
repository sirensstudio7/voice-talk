/**
 * Authored talking hand-gesture clip (pose lab → product).
 * Plays randomly while the assistant is speaking to the customer.
 */

import type { AvatarIdlePoseOffsets, BoneOffsetDeg } from "./avatar-idle-controller";
import type { GesturePoseClip } from "./thumbs-up-clip";

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

const REST_POSE: AvatarIdlePoseOffsets = {
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
};

/** Default talking hand gesture — “Handgestur Talking” for Alex / full-body Mixamo. */
export const TALKING_HAND_GESTURE_CLIP: GesturePoseClip = {
  version: 1,
  title: "Handgestur Talking",
  period: 1.2,
  modelId: "alex",
  keyframes: [
    {
      time: 0,
      pose: clonePose(REST_POSE),
    },
    {
      time: 0.335,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 4, z: 1 },
        rightShoulder: { x: -40, y: 1, z: 5 },
        leftArm: { x: 20, y: -50, z: 7 },
        rightArm: { x: 17.267910547354113, y: 31, z: -11 },
        leftForeArm: { x: 28, y: 21, z: -32 },
        rightForeArm: { x: 26.178607031569406, y: 35.46318202134838, z: 27.44651757892352 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: 18, y: -46, z: 3 },
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
      time: 0.408,
      pose: {
        head: { x: 0, y: 0, z: 0 },
        neck: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 4, z: 1 },
        rightShoulder: { x: -45.44851179679541, y: -0.37929068360038304, z: 1.7155319872997128 },
        leftArm: { x: 17, y: -38, z: 14 },
        rightArm: { x: 17.28446801270029, y: 45.474113354500474, z: -6.094822670900096 },
        leftForeArm: { x: 75, y: 14, z: 9 },
        rightForeArm: { x: 26.18964534180019, y: 35.120994404194064, z: 27.47411335450048 },
        leftHand: { x: -4, y: 29, z: -3 },
        rightHand: { x: 17.866671921278744, y: -45.89697375735176, z: 3 },
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
    // Ease back to rest so the clip finishes cleanly before weight fade-out.
    {
      time: 1.2,
      pose: clonePose(REST_POSE),
    },
  ],
};

/** Chance to play this gesture once per assistant speaking turn. */
export const TALKING_HAND_GESTURE_CHANCE = 0.38;

/** Sample talking hand gesture at `timeSec` (clamped — plays once, does not loop). */
export function sampleTalkingHandGesture(timeSec: number): AvatarIdlePoseOffsets {
  const { keyframes, period } = TALKING_HAND_GESTURE_CLIP;
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
