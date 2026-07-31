/**
 * Natural idle motion for standing GLB avatars (Ready Player Me / similar).
 * Step with delta time from useFrame or requestAnimationFrame.
 */

import type { Object3D, SkinnedMesh } from "three";
import { MathUtils, type Mesh } from "three";

import {
  GREETING_POSE_OFFSETS,
  GREETING_WAVE_CLIP,
  sampleGreetingWave,
} from "./greeting-wave-clip";
import {
  IDLE_LOOK_CHANCE,
  IDLE_LOOK_CLIP,
  sampleIdleLook,
} from "./idle-look-clip";
import { sampleThumbsUp, THUMBS_UP_CLIP } from "./thumbs-up-clip";
import {
  sampleTalkingHandGesture,
  TALKING_HAND_GESTURE_CLIP,
} from "./talking-hand-gesture-clip";

export { GREETING_POSE_OFFSETS } from "./greeting-wave-clip";

type GestureKind = "greeting" | "thumbs_up" | "talking_hand";

export type AvatarIdleOptions = {
  /** True while the avatar is speaking / lip-syncing. */
  speaking: boolean;
  /** Head bone (e.g. "Head"). */
  head?: Object3D | null;
  /** Optional neck for shared micro-sway. */
  neck?: Object3D | null;
  /** Spine / chest bone for breathing (e.g. "Spine2"). */
  chest?: Object3D | null;
  /** Shoulder bones for tiny vertical motion. */
  leftShoulder?: Object3D | null;
  rightShoulder?: Object3D | null;
  /** Upper arms / forearms / hands for neutral standing pose. */
  leftArm?: Object3D | null;
  rightArm?: Object3D | null;
  leftForeArm?: Object3D | null;
  rightForeArm?: Object3D | null;
  leftHand?: Object3D | null;
  rightHand?: Object3D | null;
  /** Finger bones — relaxed open rest pose. */
  fingerBones?: Object3D[];
  /** Eye bones for micro look when look morphs are missing. */
  leftEye?: Object3D | null;
  rightEye?: Object3D | null;
  /** Meshes that expose eye / jaw / smile morph targets. */
  morphMeshes?: Mesh[];
  /** Drive eyeBlinkLeft/Right morphs (default true). */
  enableBlinkMorphs?: boolean;
  /** Optional override for idle arm pose (degrees from bind). */
  poseOffsets?: AvatarIdlePoseOffsets;
};

export type BoneOffsetDeg = { x: number; y: number; z: number };

const ZERO: BoneOffsetDeg = { x: 0, y: 0, z: 0 };

/** Idle pose as degrees offset from the GLB bind pose. */
export type AvatarIdlePoseOffsets = {
  // Body / face orientation
  head: BoneOffsetDeg;
  neck: BoneOffsetDeg;
  chest: BoneOffsetDeg;
  // Arms
  leftShoulder: BoneOffsetDeg;
  rightShoulder: BoneOffsetDeg;
  leftArm: BoneOffsetDeg;
  rightArm: BoneOffsetDeg;
  leftForeArm: BoneOffsetDeg;
  rightForeArm: BoneOffsetDeg;
  leftHand: BoneOffsetDeg;
  rightHand: BoneOffsetDeg;
  // Finger chains (applied across Thumb/Index/… joints 1–3)
  leftThumb: BoneOffsetDeg;
  rightThumb: BoneOffsetDeg;
  leftIndex: BoneOffsetDeg;
  rightIndex: BoneOffsetDeg;
  leftMiddle: BoneOffsetDeg;
  rightMiddle: BoneOffsetDeg;
  leftRing: BoneOffsetDeg;
  rightRing: BoneOffsetDeg;
  leftPinky: BoneOffsetDeg;
  rightPinky: BoneOffsetDeg;
};

export type AvatarPoseBoneKey = keyof AvatarIdlePoseOffsets;

export const AVATAR_POSE_BONE_KEYS: AvatarPoseBoneKey[] = [
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

export const DEFAULT_IDLE_POSE_OFFSETS: AvatarIdlePoseOffsets = {
  head: { ...ZERO },
  neck: { ...ZERO },
  chest: { ...ZERO },
  leftShoulder: { x: -2, y: 4, z: 1 },
  rightShoulder: { x: -2, y: -4, z: -1 },
  leftArm: { x: 20, y: -50, z: 7 },
  rightArm: { x: 20, y: 50, z: -7 },
  leftForeArm: { x: 28, y: 21, z: -32 },
  rightForeArm: { x: 28, y: -21, z: 32 },
  leftHand: { x: -4, y: 29, z: -3 },
  rightHand: { x: -4, y: -29, z: 3 },
  leftThumb: { ...ZERO },
  rightThumb: { ...ZERO },
  leftIndex: { ...ZERO },
  rightIndex: { ...ZERO },
  leftMiddle: { ...ZERO },
  rightMiddle: { ...ZERO },
  leftRing: { ...ZERO },
  rightRing: { ...ZERO },
  leftPinky: { ...ZERO },
  rightPinky: { ...ZERO },
};

type MorphChannel = { influences: number[]; index: number };

type BoundMorphs = {
  eyeBlinkLeft: MorphChannel[];
  eyeBlinkRight: MorphChannel[];
  eyesLookLeft: MorphChannel[];
  eyesLookRight: MorphChannel[];
  eyesLookUp: MorphChannel[];
  eyesLookDown: MorphChannel[];
  jawOpen: MorphChannel[];
  mouthSmileLeft: MorphChannel[];
  mouthSmileRight: MorphChannel[];
};

type Vec3 = { x: number; y: number; z: number };

type ArmBoneKey =
  | "leftShoulder"
  | "rightShoulder"
  | "leftArm"
  | "rightArm"
  | "leftForeArm"
  | "rightForeArm"
  | "leftHand"
  | "rightHand";

type FingerDigitKey =
  | "leftThumb"
  | "rightThumb"
  | "leftIndex"
  | "rightIndex"
  | "leftMiddle"
  | "rightMiddle"
  | "leftRing"
  | "rightRing"
  | "leftPinky"
  | "rightPinky";

type ArmBoneBinding = {
  key: ArmBoneKey;
  bone: Object3D;
  bind: Vec3;
};

type FingerBoneBinding = {
  digit: FingerDigitKey;
  joint: number;
  bone: Object3D;
  bind: Vec3;
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function findChannels(meshes: Mesh[], names: string[]): MorphChannel[] {
  const out: MorphChannel[] = [];
  for (const mesh of meshes) {
    const dict = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dict || !influences) continue;
    for (const name of names) {
      const index = dict[name];
      if (typeof index === "number") {
        out.push({ influences, index });
      }
    }
  }
  return out;
}

function setChannels(channels: MorphChannel[], value: number): void {
  const v = MathUtils.clamp(value, 0, 1);
  for (const channel of channels) {
    channel.influences[channel.index] = v;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite smoothstep — natural ease-in / ease-out for pose blends. */
function smoothstep(t: number): number {
  const x = MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function clonePose(pose: AvatarIdlePoseOffsets): AvatarIdlePoseOffsets {
  const next = {} as AvatarIdlePoseOffsets;
  for (const key of AVATAR_POSE_BONE_KEYS) {
    const src = pose[key] ?? DEFAULT_IDLE_POSE_OFFSETS[key];
    next[key] = { x: src.x, y: src.y, z: src.z };
  }
  return next;
}

function readRot(bone: Object3D): Vec3 {
  return { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
}

function writeRot(bone: Object3D, v: Vec3): void {
  bone.rotation.set(v.x, v.y, v.z);
}

function isFingerBone(name: string): boolean {
  return /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(name);
}

function parseFingerBone(
  name: string,
): { digit: FingerDigitKey; joint: number } | null {
  const match = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)(\d)$/.exec(name);
  if (!match) return null;
  const side = match[1] === "Left" ? "left" : "right";
  const digit = `${side}${match[2]}` as FingerDigitKey;
  const joint = Number(match[3]);
  return { digit, joint };
}

/** Distal joints inherit a softer share of the chain offset. */
function fingerJointWeight(joint: number): number {
  if (joint <= 1) return 1;
  if (joint === 2) return 0.75;
  return 0.5;
}

/** Brief blink pulses at fixed points in the lab loop (0–1). */
function labBlinkEnvelope(u: number): number {
  const pulse = (center: number, width = 0.04) => {
    const d = Math.abs(u - center);
    if (d > width) return 0;
    return 1 - d / width;
  };
  return Math.max(pulse(0.22), pulse(0.7) * 0.95, pulse(0.74) * 0.65);
}

/**
 * Collect useful bones + morph meshes from a loaded avatar scene.
 */
export function bindAvatarIdleTargets(root: Object3D): {
  head: Object3D | null;
  neck: Object3D | null;
  chest: Object3D | null;
  leftShoulder: Object3D | null;
  rightShoulder: Object3D | null;
  leftArm: Object3D | null;
  rightArm: Object3D | null;
  leftForeArm: Object3D | null;
  rightForeArm: Object3D | null;
  leftHand: Object3D | null;
  rightHand: Object3D | null;
  fingerBones: Object3D[];
  leftEye: Object3D | null;
  rightEye: Object3D | null;
  morphMeshes: Mesh[];
} {
  let head: Object3D | null = null;
  let neck: Object3D | null = null;
  let chest: Object3D | null = null;
  let leftShoulder: Object3D | null = null;
  let rightShoulder: Object3D | null = null;
  let leftArm: Object3D | null = null;
  let rightArm: Object3D | null = null;
  let leftForeArm: Object3D | null = null;
  let rightForeArm: Object3D | null = null;
  let leftHand: Object3D | null = null;
  let rightHand: Object3D | null = null;
  let leftEye: Object3D | null = null;
  let rightEye: Object3D | null = null;
  const fingerBones: Object3D[] = [];
  const morphMeshes: Mesh[] = [];

  const skeletonBoneList: Object3D[] = [];

  root.traverse((object) => {
    const name = object.name;
    if (name === "Head" && !head) head = object;
    if (name === "Neck" && !neck) neck = object;
    if (name === "Spine2") chest = object;
    else if ((name === "Spine1" || name === "Spine") && !chest) chest = object;
    if (name === "LeftShoulder" && !leftShoulder) leftShoulder = object;
    if (name === "RightShoulder" && !rightShoulder) rightShoulder = object;
    if (name === "LeftArm" && !leftArm) leftArm = object;
    if (name === "RightArm" && !rightArm) rightArm = object;
    if (name === "LeftForeArm" && !leftForeArm) leftForeArm = object;
    if (name === "RightForeArm" && !rightForeArm) rightForeArm = object;
    if (name === "LeftHand" && !leftHand) leftHand = object;
    if (name === "RightHand" && !rightHand) rightHand = object;
    if (isFingerBone(name)) fingerBones.push(object);
    if ((name === "LeftEye" || name === "EyeLeft") && !leftEye) leftEye = object;
    if ((name === "RightEye" || name === "EyeRight") && !rightEye) rightEye = object;

    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      morphMeshes.push(mesh);
    }
    const sk = object as SkinnedMesh;
    if (skeletonBoneList.length === 0 && sk.isSkinnedMesh && sk.skeleton?.bones?.length) {
      skeletonBoneList.push(...sk.skeleton.bones);
    }
  });

  // Prefer skeleton bones so rotations actually drive the SkinnedMesh.
  if (skeletonBoneList.length > 0) {
    const byName = new Map<string, Object3D>();
    for (const b of skeletonBoneList) byName.set(b.name, b);
    const bone = (n: string): Object3D | null => byName.get(n) ?? null;
    head = bone("Head") ?? head;
    neck = bone("Neck") ?? neck;
    chest = bone("Spine2") ?? bone("Spine1") ?? bone("Spine") ?? chest;
    leftShoulder = bone("LeftShoulder") ?? leftShoulder;
    rightShoulder = bone("RightShoulder") ?? rightShoulder;
    leftArm = bone("LeftArm") ?? leftArm;
    rightArm = bone("RightArm") ?? rightArm;
    leftForeArm = bone("LeftForeArm") ?? leftForeArm;
    rightForeArm = bone("RightForeArm") ?? rightForeArm;
    leftHand = bone("LeftHand") ?? leftHand;
    rightHand = bone("RightHand") ?? rightHand;
    leftEye = bone("LeftEye") ?? bone("EyeLeft") ?? leftEye;
    rightEye = bone("RightEye") ?? bone("EyeRight") ?? rightEye;
    if (fingerBones.length === 0) {
      for (const b of skeletonBoneList) {
        if (isFingerBone(b.name)) fingerBones.push(b);
      }
    }
  }

  return {
    head,
    neck,
    chest,
    leftShoulder,
    rightShoulder,
    leftArm,
    rightArm,
    leftForeArm,
    rightForeArm,
    leftHand,
    rightHand,
    fingerBones,
    leftEye,
    rightEye,
    morphMeshes,
  };
}

/**
 * Stateful idle animator. Call `update(deltaSec, speaking)` every frame.
 */
export class AvatarIdleController {
  private head: Object3D | null = null;
  private neck: Object3D | null = null;
  private chest: Object3D | null = null;
  private leftShoulder: Object3D | null = null;
  private rightShoulder: Object3D | null = null;
  private leftEye: Object3D | null = null;
  private rightEye: Object3D | null = null;
  private morphs: BoundMorphs | null = null;
  private enableBlinkMorphs = true;
  private armBones: ArmBoneBinding[] = [];
  private fingerBones: FingerBoneBinding[] = [];
  private poseOffsets: AvatarIdlePoseOffsets = clonePose(DEFAULT_IDLE_POSE_OFFSETS);
  private greetingPose: AvatarIdlePoseOffsets = clonePose(GREETING_POSE_OFFSETS);
  /** 0 = rest/idle pose, 1 = greeting / thumbs-up overlay. */
  private greetingWeight = 0;
  private greetingTarget = 0;
  /** Elapsed seconds in the active gesture clip. */
  private greetingClock = 0;
  private gestureKind: GestureKind = "greeting";

  /** Occasional authored left/right glance during idle (~20% of rolls). */
  private idleLookActive = false;
  private idleLookClock = 0;
  private idleLookWeight = 0;
  private idleLookPose: AvatarIdlePoseOffsets = clonePose(DEFAULT_IDLE_POSE_OFFSETS);
  private idleLookCooldown = rand(3.5, 7);

  private headBaseRot = { x: 0, y: 0, z: 0 };
  private headBaseY = 0;
  private neckBaseRot = { x: 0, y: 0, z: 0 };
  private chestBaseRot = { x: 0, y: 0, z: 0 };
  private leftEyeBaseRot = { x: 0, y: 0, z: 0 };
  private rightEyeBaseRot = { x: 0, y: 0, z: 0 };
  private chestBaseY = 0;
  private leftShoulderBaseY = 0;
  private rightShoulderBaseY = 0;
  private basesCaptured = false;

  // Breathing phase (randomized period)
  private breathPhase = Math.random() * Math.PI * 2;
  private breathHz = 1 / rand(3.2, 4.8);
  private breathAmp = rand(0.0035, 0.0075);

  // Head sway targets
  private headTargetY = 0;
  private headTargetX = 0;
  private headCurrentY = 0;
  private headCurrentX = 0;
  private headRetargetIn = rand(2.5, 5);

  // Eyes
  private lookTargetX = 0;
  private lookTargetY = 0;
  private lookCurrentX = 0;
  private lookCurrentY = 0;
  private lookRetargetIn = rand(1, 3);

  // Blink
  private blinkIn = rand(2, 6);
  private blinking = false;
  private blinkProgress = 0;
  private blinkDuration = rand(0.12, 0.18);
  private doubleBlinkPending = false;

  // Shoulders — stable amplitude, occasionally re-rolled
  private shoulderAmp = rand(0.002, 0.005);

  // Soft idle smile amount (eased)
  private smileCurrent = 0;

  // Smooth fade of facial idle when speech starts/stops
  private facialWeight = 1;

  /** Latest blink closure 0–1 (for non-morph eyelash rigs). */
  private lastBlinkAmount = 0;

  bind(options: Omit<AvatarIdleOptions, "speaking">): void {
    this.head = options.head ?? null;
    this.neck = options.neck ?? null;
    this.chest = options.chest ?? null;
    this.leftShoulder = options.leftShoulder ?? null;
    this.rightShoulder = options.rightShoulder ?? null;
    this.leftEye = options.leftEye ?? null;
    this.rightEye = options.rightEye ?? null;
    this.enableBlinkMorphs = options.enableBlinkMorphs !== false;
    if (options.poseOffsets) {
      this.poseOffsets = clonePose(options.poseOffsets);
    }

    const meshes = options.morphMeshes ?? [];
    this.morphs = {
      eyeBlinkLeft: this.enableBlinkMorphs
        ? findChannels(meshes, ["eyeBlinkLeft"])
        : [],
      eyeBlinkRight: this.enableBlinkMorphs
        ? findChannels(meshes, ["eyeBlinkRight"])
        : [],
      eyesLookLeft: findChannels(meshes, ["eyesLookLeft", "eyeLookOutLeft"]),
      eyesLookRight: findChannels(meshes, ["eyesLookRight", "eyeLookOutRight"]),
      eyesLookUp: findChannels(meshes, ["eyesLookUp"]),
      eyesLookDown: findChannels(meshes, ["eyesLookDown"]),
      jawOpen: findChannels(meshes, ["jawOpen"]),
      mouthSmileLeft: findChannels(meshes, ["mouthSmileLeft"]),
      mouthSmileRight: findChannels(meshes, ["mouthSmileRight"]),
    };

    this.armBones = this.collectArmBones(options);
    this.fingerBones = (options.fingerBones ?? []).flatMap((bone) => {
      const parsed = parseFingerBone(bone.name);
      if (!parsed) return [];
      return [{ ...parsed, bone, bind: readRot(bone) }];
    });
    this.captureBases();
    // Snap into the neutral standing pose immediately (RPM ships in A/T-pose).
    this.applyArmPose();
  }

  bindFromRoot(root: Object3D): void {
    const targets = bindAvatarIdleTargets(root);
    this.bind(targets);
  }

  /** Live-edit idle/rest arm pose (degrees from bind). Used by the admin adjust panel. */
  setPoseOffsets(offsets: AvatarIdlePoseOffsets): void {
    this.poseOffsets = clonePose(offsets);
    this.applyArmPose();
  }

  getPoseOffsets(): AvatarIdlePoseOffsets {
    return clonePose(this.poseOffsets);
  }

  /** Smoothly blend into / out of the greeting wave pose. */
  setGreetingActive(active: boolean): void {
    this.setGestureActive(active, "greeting");
  }

  /** Smoothly blend into / out of the thumbs-up acknowledge pose. */
  setThumbsUpActive(active: boolean): void {
    this.setGestureActive(active, "thumbs_up");
  }

  /** Smoothly blend into / out of the talking hand-gesture pose. */
  setTalkingHandActive(active: boolean): void {
    this.setGestureActive(active, "talking_hand");
  }

  private setGestureActive(active: boolean, kind: GestureKind): void {
    if (active) {
      const switching = this.gestureKind !== kind || this.greetingTarget === 0;
      this.gestureKind = kind;
      if (switching) {
        this.greetingClock = 0;
        this.greetingPose = this.sampleActiveGesture(0);
      }
      this.greetingTarget = 1;
      return;
    }
    // Only clear when the inactive call matches the current gesture
    // (avatar-3d may call all setters each frame).
    if (this.gestureKind === kind) {
      this.greetingTarget = 0;
    }
  }

  private sampleActiveGesture(timeSec: number): AvatarIdlePoseOffsets {
    if (this.gestureKind === "thumbs_up") {
      return sampleThumbsUp(timeSec);
    }
    if (this.gestureKind === "talking_hand") {
      return sampleTalkingHandGesture(timeSec);
    }
    return sampleGreetingWave(timeSec);
  }

  private gesturePeriod(): number {
    if (this.gestureKind === "thumbs_up") return THUMBS_UP_CLIP.period;
    if (this.gestureKind === "talking_hand") return TALKING_HAND_GESTURE_CLIP.period;
    return GREETING_WAVE_CLIP.period;
  }

  setGreetingPose(offsets: AvatarIdlePoseOffsets): void {
    this.greetingPose = clonePose(offsets);
  }

  /**
   * Deterministic idle cycle for the pose lab timeline.
   * Scrub `timeSec` within `periodSec`; `jitter` scales breath/sway/blink (0 = frozen pose).
   */
  updateLab(
    timeSec: number,
    periodSec: number,
    jitter: number,
    speaking: boolean,
  ): void {
    if (!this.basesCaptured) this.captureBases();

    const j = MathUtils.clamp(jitter, 0, 1);
    const period = Math.max(0.5, periodSec);
    const t = ((timeSec % period) + period) % period;
    const phase = (t / period) * Math.PI * 2;
    const u = t / period;

    // Lab snaps greeting weight; sample authored gesture from the scrubbed clock.
    this.greetingWeight = this.greetingTarget;
    if (this.greetingTarget > 0) {
      this.greetingClock = t % Math.max(0.1, this.gesturePeriod());
      this.greetingPose = this.sampleActiveGesture(this.greetingClock);
    }
    this.applyArmPose();

    this.facialWeight = speaking ? 0 : 1;
    this.breathPhase = phase;
    this.breathAmp = 0.0055;
    this.shoulderAmp = 0.0035;

    const breath =
      Math.sin(phase) * this.breathAmp * j * (speaking ? 0.55 : 1);
    if (this.chest) {
      this.chest.position.y = this.chestBaseY + breath;
      const chestPose = this.poseOffsets.chest;
      this.chest.rotation.x =
        this.chestBaseRot.x + MathUtils.degToRad(chestPose.x);
      this.chest.rotation.y =
        this.chestBaseRot.y + MathUtils.degToRad(chestPose.y);
      this.chest.rotation.z =
        this.chestBaseRot.z + MathUtils.degToRad(chestPose.z);
    }
    if (this.head) {
      this.head.position.y = this.headBaseY + breath * 0.55;
    }

    const shoulderLift =
      Math.sin(phase + 0.35) * this.shoulderAmp * j * (speaking ? 0.5 : 1);
    if (this.leftShoulder) {
      this.leftShoulder.position.y = this.leftShoulderBaseY + shoulderLift;
    }
    if (this.rightShoulder) {
      this.rightShoulder.position.y = this.rightShoulderBaseY + shoulderLift * 0.92;
    }

    const w = this.facialWeight;
    const greetingActive = this.greetingTarget > 0.5 || this.greetingWeight > 0.15;
    this.headCurrentY = greetingActive
      ? 0
      : Math.sin(phase * 0.65) * MathUtils.degToRad(5) * j * w;
    this.headCurrentX = greetingActive
      ? 0
      : Math.sin(phase * 0.4 + 1.2) * MathUtils.degToRad(0.5) * j * w;

    const headPose = this.poseOffsets.head;
    const neckPose = this.poseOffsets.neck;
    if (this.head) {
      this.head.rotation.y =
        this.headBaseRot.y + MathUtils.degToRad(headPose.y) + this.headCurrentY;
      this.head.rotation.x =
        this.headBaseRot.x + MathUtils.degToRad(headPose.x) + this.headCurrentX;
      this.head.rotation.z = this.headBaseRot.z + MathUtils.degToRad(headPose.z);
    }
    if (this.neck) {
      this.neck.rotation.y =
        this.neckBaseRot.y +
        MathUtils.degToRad(neckPose.y) +
        this.headCurrentY * 0.2;
      this.neck.rotation.x =
        this.neckBaseRot.x +
        MathUtils.degToRad(neckPose.x) +
        this.headCurrentX * 0.15;
      this.neck.rotation.z = this.neckBaseRot.z + MathUtils.degToRad(neckPose.z);
    }

    const lookX = Math.sin(phase * 1.1) * 0.18 * j * w;
    const lookY = Math.cos(phase * 0.9) * 0.1 * j * w;
    this.applyEyeLook(lookX, lookY);

    const blinkAmt = labBlinkEnvelope(u) * j * w;
    this.lastBlinkAmount = blinkAmt;
    this.applyBlink(blinkAmt);

    if (this.morphs && !speaking) {
      const smile =
        w * j * (0.14 + (Math.sin(phase * 0.85) * 0.5 + 0.5) * 0.05);
      this.smileCurrent = smile;
      setChannels(this.morphs.mouthSmileLeft, smile);
      setChannels(this.morphs.mouthSmileRight, smile);
      if (w > 0.2 && j > 0) {
        const jaw = w * j * (0.01 + (Math.sin(phase) * 0.5 + 0.5) * 0.02);
        setChannels(this.morphs.jawOpen, MathUtils.clamp(jaw, 0, 0.03));
      } else {
        setChannels(this.morphs.jawOpen, 0);
      }
    }
  }

  private collectArmBones(
    options: Omit<AvatarIdleOptions, "speaking">,
  ): ArmBoneBinding[] {
    const entries: Array<[ArmBoneKey, Object3D | null | undefined]> = [
      ["leftShoulder", options.leftShoulder],
      ["rightShoulder", options.rightShoulder],
      ["leftArm", options.leftArm],
      ["rightArm", options.rightArm],
      ["leftForeArm", options.leftForeArm],
      ["rightForeArm", options.rightForeArm],
      ["leftHand", options.leftHand],
      ["rightHand", options.rightHand],
    ];

    const out: ArmBoneBinding[] = [];
    for (const [key, bone] of entries) {
      if (!bone) continue;
      out.push({ key, bone, bind: readRot(bone) });
    }
    return out;
  }

  private applyArmPose(): void {
    // Ease-in-out so the arm accelerates/decelerates instead of linear pops.
    const w = smoothstep(this.greetingWeight);

    for (const { key, bone, bind } of this.armBones) {
      const rest = this.poseOffsets[key];
      const greet = this.greetingPose[key];
      const x = lerp(rest.x, greet.x, w);
      const y = lerp(rest.y, greet.y, w);
      const z = lerp(rest.z, greet.z, w);

      bone.rotation.x = bind.x + MathUtils.degToRad(x);
      bone.rotation.y = bind.y + MathUtils.degToRad(y);
      bone.rotation.z = bind.z + MathUtils.degToRad(z);
    }

    for (const { digit, joint, bone, bind } of this.fingerBones) {
      const rest = this.poseOffsets[digit];
      const greet = this.greetingPose[digit];
      const jointW = fingerJointWeight(joint);
      const x = lerp(rest.x, greet.x, w) * jointW;
      const y = lerp(rest.y, greet.y, w) * jointW;
      const z = lerp(rest.z, greet.z, w) * jointW;
      // Keep a soft open-hand bias toward bind when offsets are near zero.
      const openBias = 0.35;
      bone.rotation.x = bind.x * openBias + MathUtils.degToRad(x);
      bone.rotation.y = bind.y * openBias + MathUtils.degToRad(y);
      bone.rotation.z = bind.z * openBias + MathUtils.degToRad(z);
    }
  }

  private captureBases(): void {
    if (this.head) {
      this.headBaseRot = {
        x: this.head.rotation.x,
        y: this.head.rotation.y,
        z: this.head.rotation.z,
      };
      this.headBaseY = this.head.position.y;
    }
    if (this.neck) {
      this.neckBaseRot = {
        x: this.neck.rotation.x,
        y: this.neck.rotation.y,
        z: this.neck.rotation.z,
      };
    }
    if (this.chest) {
      this.chestBaseRot = {
        x: this.chest.rotation.x,
        y: this.chest.rotation.y,
        z: this.chest.rotation.z,
      };
      this.chestBaseY = this.chest.position.y;
    }
    if (this.leftShoulder) this.leftShoulderBaseY = this.leftShoulder.position.y;
    if (this.rightShoulder) this.rightShoulderBaseY = this.rightShoulder.position.y;
    if (this.leftEye) {
      this.leftEyeBaseRot = {
        x: this.leftEye.rotation.x,
        y: this.leftEye.rotation.y,
        z: this.leftEye.rotation.z,
      };
    }
    if (this.rightEye) {
      this.rightEyeBaseRot = {
        x: this.rightEye.rotation.x,
        y: this.rightEye.rotation.y,
        z: this.rightEye.rotation.z,
      };
    }
    this.basesCaptured = true;
  }

  /**
   * @param deltaSec Frame delta in seconds
   * @param speaking When true, facial idle fades out; body breath continues softly
   */
  update(deltaSec: number, speaking: boolean): void {
    if (!this.basesCaptured) this.captureBases();
    const dt = Math.min(0.05, Math.max(0, deltaSec));

    // Blend rest ↔ greeting: quick raise (~0.3s) so the wave reads clearly.
    const rising = this.greetingTarget > this.greetingWeight + 0.001;
    const blendRate = rising ? 7.5 : 5.5;
    this.greetingWeight = lerp(
      this.greetingWeight,
      this.greetingTarget,
      1 - Math.exp(-blendRate * dt),
    );
    if (Math.abs(this.greetingWeight - this.greetingTarget) < 0.002) {
      this.greetingWeight = this.greetingTarget;
    }

    // Advance / sample the authored gesture clip.
    if (this.greetingTarget > 0) {
      this.greetingClock += dt;
      if (this.gestureKind === "thumbs_up") {
        this.greetingClock = Math.min(this.greetingClock, this.gesturePeriod());
      }
      this.greetingPose = this.sampleActiveGesture(this.greetingClock);
    } else if (this.greetingWeight > 0.01) {
      // Hold last sampled pose while blending back to idle.
      this.greetingPose = this.sampleActiveGesture(this.greetingClock);
    }

    // Keep arms/hands in the blended idle / greeting pose.
    this.applyArmPose();

    // Fade facial idle in/out around speech
    const facialTarget = speaking ? 0 : 1;
    this.facialWeight = lerp(this.facialWeight, facialTarget, 1 - Math.exp(-6 * dt));

    // --- Breathing (body) — always on, slightly quieter while speaking ---
    this.breathPhase += dt * Math.PI * 2 * this.breathHz;
    const breath =
      Math.sin(this.breathPhase) * this.breathAmp * (speaking ? 0.55 : 1);
    if (this.chest) {
      this.chest.position.y = this.chestBaseY + breath;
      const chestPose = this.poseOffsets.chest;
      this.chest.rotation.x =
        this.chestBaseRot.x + MathUtils.degToRad(chestPose.x);
      this.chest.rotation.y =
        this.chestBaseRot.y + MathUtils.degToRad(chestPose.y);
      this.chest.rotation.z =
        this.chestBaseRot.z + MathUtils.degToRad(chestPose.z);
    }
    // Head rides a softer copy of the same breath cycle
    if (this.head) {
      this.head.position.y = this.headBaseY + breath * 0.55;
    }

    // Occasional re-randomize breath period so loops never lock
    if (Math.random() < dt * 0.08) {
      this.breathHz = 1 / rand(3.1, 4.9);
      this.breathAmp = rand(0.0032, 0.0078);
      this.shoulderAmp = rand(0.002, 0.005);
    }

    // --- Shoulders ---
    const shoulderLift =
      Math.sin(this.breathPhase + 0.35) * this.shoulderAmp * (speaking ? 0.5 : 1);
    if (this.leftShoulder) {
      this.leftShoulder.position.y = this.leftShoulderBaseY + shoulderLift;
    }
    if (this.rightShoulder) {
      this.rightShoulder.position.y = this.rightShoulderBaseY + shoulderLift * 0.92;
    }

    const w = this.facialWeight;

    // --- Authored idle look left/right (occasional; skips during gestures / speech) ---
    const greetingActive = this.greetingTarget > 0.5 || this.greetingWeight > 0.15;
    if (greetingActive || speaking) {
      this.idleLookActive = false;
      this.idleLookCooldown = Math.max(this.idleLookCooldown, rand(2.5, 5));
    } else if (this.idleLookActive) {
      this.idleLookClock += dt;
      this.idleLookPose = sampleIdleLook(this.idleLookClock);
      if (this.idleLookClock >= IDLE_LOOK_CLIP.period) {
        this.idleLookActive = false;
        this.idleLookCooldown = rand(5, 10);
      }
    } else {
      this.idleLookCooldown -= dt;
      if (this.idleLookCooldown <= 0) {
        if (Math.random() < IDLE_LOOK_CHANCE) {
          this.idleLookActive = true;
          this.idleLookClock = 0;
          this.idleLookPose = sampleIdleLook(0);
        } else {
          this.idleLookCooldown = rand(4, 8);
        }
      }
    }
    const idleLookTarget = this.idleLookActive ? 1 : 0;
    this.idleLookWeight = lerp(
      this.idleLookWeight,
      idleLookTarget,
      1 - Math.exp(-(idleLookTarget > this.idleLookWeight ? 8 : 5) * dt),
    );
    if (Math.abs(this.idleLookWeight - idleLookTarget) < 0.002) {
      this.idleLookWeight = idleLookTarget;
    }

    // --- Head yaw: randomly look left (~6°) or right (~5°); face front while greeting ---
    if (greetingActive || this.idleLookWeight > 0.2) {
      // Hold eye contact / follow authored look — no tiny procedural look-aways.
      this.headTargetY = 0;
      this.headTargetX = 0;
      this.headRetargetIn = rand(0.4, 1.2);
    } else {
      this.headRetargetIn -= dt;
      if (this.headRetargetIn <= 0) {
        // Positive Y = character's left on Mixamo / RPM Head bones.
        this.headTargetY =
          Math.random() < 0.5
            ? MathUtils.degToRad(6)
            : MathUtils.degToRad(-5);
        this.headTargetX = MathUtils.degToRad(rand(-0.6, 0.4));
        this.headRetargetIn = rand(3.2, 6.5);
      }
    }
    // Faster settle to front while greeting; slow idle ease otherwise.
    const headEase = greetingActive || this.idleLookWeight > 0.2 ? 5.5 : 1.4;
    this.headCurrentY = lerp(this.headCurrentY, this.headTargetY * w, 1 - Math.exp(-headEase * dt));
    this.headCurrentX = lerp(this.headCurrentX, this.headTargetX * w, 1 - Math.exp(-headEase * dt));
    const lookW = smoothstep(this.idleLookWeight);
    const headPose = this.poseOffsets.head;
    const neckPose = this.poseOffsets.neck;
    const lookHead = this.idleLookPose.head;
    const lookNeck = this.idleLookPose.neck;
    const headY = lerp(headPose.y, lookHead.y, lookW);
    const headX = lerp(headPose.x, lookHead.x, lookW);
    const headZ = lerp(headPose.z, lookHead.z, lookW);
    const neckY = lerp(neckPose.y, lookNeck.y, lookW);
    const neckX = lerp(neckPose.x, lookNeck.x, lookW);
    const neckZ = lerp(neckPose.z, lookNeck.z, lookW);
    if (this.head) {
      this.head.rotation.y =
        this.headBaseRot.y + MathUtils.degToRad(headY) + this.headCurrentY;
      this.head.rotation.x =
        this.headBaseRot.x + MathUtils.degToRad(headX) + this.headCurrentX;
      this.head.rotation.z = this.headBaseRot.z + MathUtils.degToRad(headZ);
    }
    if (this.neck) {
      this.neck.rotation.y =
        this.neckBaseRot.y + MathUtils.degToRad(neckY) + this.headCurrentY * 0.2;
      this.neck.rotation.x =
        this.neckBaseRot.x + MathUtils.degToRad(neckX) + this.headCurrentX * 0.15;
      this.neck.rotation.z = this.neckBaseRot.z + MathUtils.degToRad(neckZ);
    }

    // --- Eye look micro motion ---
    this.lookRetargetIn -= dt;
    if (this.lookRetargetIn <= 0) {
      this.lookTargetX = rand(-0.22, 0.22);
      this.lookTargetY = rand(-0.12, 0.14);
      this.lookRetargetIn = rand(1, 3);
    }
    this.lookCurrentX = lerp(this.lookCurrentX, this.lookTargetX * w, 1 - Math.exp(-4 * dt));
    this.lookCurrentY = lerp(this.lookCurrentY, this.lookTargetY * w, 1 - Math.exp(-4 * dt));
    this.applyEyeLook(this.lookCurrentX, this.lookCurrentY);

    // --- Blink ---
    if (w < 0.15) {
      // Hold eyes open while speaking; finish any in-progress blink softly
      if (this.blinking) {
        this.blinkProgress += dt / this.blinkDuration;
        if (this.blinkProgress >= 1) {
          this.blinking = false;
          this.blinkProgress = 0;
        }
      }
      const amount = this.blinking ? this.blinkAmount(this.blinkProgress) * w : 0;
      this.lastBlinkAmount = amount;
      this.applyBlink(amount);
    } else {
      this.blinkIn -= dt;
      if (!this.blinking && this.blinkIn <= 0) {
        this.blinking = true;
        this.blinkProgress = 0;
        this.blinkDuration = rand(0.12, 0.18);
      }
      if (this.blinking) {
        this.blinkProgress += dt / this.blinkDuration;
        if (this.blinkProgress >= 1) {
          this.blinking = false;
          this.blinkProgress = 0;
          if (this.doubleBlinkPending) {
            this.doubleBlinkPending = false;
            this.blinkIn = rand(0.1, 0.18);
          } else {
            this.blinkIn = rand(2, 6);
            if (Math.random() < 0.16) {
              this.doubleBlinkPending = true;
              this.blinkIn = rand(0.1, 0.2);
            }
          }
        }
      }
      const amount = this.blinking ? this.blinkAmount(this.blinkProgress) : 0;
      this.lastBlinkAmount = amount;
      this.applyBlink(amount);
    }

    // --- Soft smile + jaw (idle only — visemes own the mouth while speaking) ---
    if (this.morphs && !speaking) {
      const smileTarget =
        w * (0.14 + (Math.sin(this.breathPhase * 0.85) * 0.5 + 0.5) * 0.05);
      this.smileCurrent = lerp(this.smileCurrent, smileTarget, 1 - Math.exp(-3.5 * dt));
      setChannels(this.morphs.mouthSmileLeft, this.smileCurrent);
      setChannels(this.morphs.mouthSmileRight, this.smileCurrent);

      if (w > 0.2) {
        const jaw =
          w * (0.01 + (Math.sin(this.breathPhase) * 0.5 + 0.5) * 0.02);
        setChannels(this.morphs.jawOpen, MathUtils.clamp(jaw, 0, 0.03));
      }
    } else {
      this.smileCurrent = lerp(this.smileCurrent, 0, 1 - Math.exp(-5 * dt));
    }
  }

  /** Current blink closure for eyelash / custom blink meshes. */
  getBlinkAmount(): number {
    return this.lastBlinkAmount;
  }

  /** Restore bones/morphs toward base (e.g. on unmount). */
  reset(): void {
    if (this.head) {
      this.head.rotation.set(this.headBaseRot.x, this.headBaseRot.y, this.headBaseRot.z);
      this.head.position.y = this.headBaseY;
    }
    if (this.neck) {
      this.neck.rotation.set(this.neckBaseRot.x, this.neckBaseRot.y, this.neckBaseRot.z);
    }
    if (this.chest) {
      this.chest.position.y = this.chestBaseY;
      this.chest.rotation.set(
        this.chestBaseRot.x,
        this.chestBaseRot.y,
        this.chestBaseRot.z,
      );
    }
    if (this.leftShoulder) this.leftShoulder.position.y = this.leftShoulderBaseY;
    if (this.rightShoulder) this.rightShoulder.position.y = this.rightShoulderBaseY;
    if (this.leftEye) {
      this.leftEye.rotation.set(
        this.leftEyeBaseRot.x,
        this.leftEyeBaseRot.y,
        this.leftEyeBaseRot.z,
      );
    }
    if (this.rightEye) {
      this.rightEye.rotation.set(
        this.rightEyeBaseRot.x,
        this.rightEyeBaseRot.y,
        this.rightEyeBaseRot.z,
      );
    }
    for (const { bone, bind } of this.armBones) {
      writeRot(bone, bind);
    }
    for (const { bone, bind } of this.fingerBones) {
      writeRot(bone, bind);
    }
    this.applyBlink(0);
    this.applyEyeLook(0, 0);
    if (this.morphs) {
      setChannels(this.morphs.jawOpen, 0);
      setChannels(this.morphs.mouthSmileLeft, 0);
      setChannels(this.morphs.mouthSmileRight, 0);
    }
  }

  private blinkAmount(progress: number): number {
    // Ease closed then open
    if (progress < 0.45) return progress / 0.45;
    if (progress < 0.55) return 1;
    return Math.max(0, 1 - (progress - 0.55) / 0.45);
  }

  private applyBlink(amount: number): void {
    if (!this.morphs) return;
    setChannels(this.morphs.eyeBlinkLeft, amount);
    setChannels(this.morphs.eyeBlinkRight, amount);
  }

  private applyEyeLook(x: number, y: number): void {
    if (this.morphs) {
      setChannels(this.morphs.eyesLookRight, Math.max(0, x));
      setChannels(this.morphs.eyesLookLeft, Math.max(0, -x));
      setChannels(this.morphs.eyesLookUp, Math.max(0, y));
      setChannels(this.morphs.eyesLookDown, Math.max(0, -y));
    }

    // Bone fallback when horizontal look morphs are absent (common on RPM).
    const yaw = x * MathUtils.degToRad(6);
    const pitch = -y * MathUtils.degToRad(4);
    if (this.leftEye) {
      this.leftEye.rotation.y = this.leftEyeBaseRot.y + yaw;
      this.leftEye.rotation.x = this.leftEyeBaseRot.x + pitch;
    }
    if (this.rightEye) {
      this.rightEye.rotation.y = this.rightEyeBaseRot.y + yaw;
      this.rightEye.rotation.x = this.rightEyeBaseRot.x + pitch;
    }
  }
}
