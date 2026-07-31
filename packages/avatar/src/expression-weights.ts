/**
 * Authored facial expression weights (ARKit-style morph targets, 0–1).
 * Used by the pose lab; applied after viseme + idle so they preview correctly.
 */

import type { Mesh, Object3D } from "three";

export const AVATAR_EXPRESSION_MORPH_KEYS = [
  // Eyes
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyesLookLeft",
  "eyesLookRight",
  "eyesLookUp",
  "eyesLookDown",
  // Brows
  "browInnerUp",
  "browDownLeft",
  "browDownRight",
  "browOuterUpLeft",
  "browOuterUpRight",
  // Mouth
  "jawOpen",
  "mouthOpen",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthFunnel",
  "mouthPucker",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
] as const;

export type AvatarExpressionMorphKey = (typeof AVATAR_EXPRESSION_MORPH_KEYS)[number];

export type AvatarExpressionWeights = Record<AvatarExpressionMorphKey, number>;

/** Alternate morph names on some RPM / Wolf3D assets. */
const MORPH_ALIASES: Partial<Record<AvatarExpressionMorphKey, string[]>> = {
  eyesLookLeft: ["eyesLookLeft", "eyeLookOutLeft"],
  eyesLookRight: ["eyesLookRight", "eyeLookOutRight"],
};

export const DEFAULT_EXPRESSION_WEIGHTS: AvatarExpressionWeights =
  Object.fromEntries(AVATAR_EXPRESSION_MORPH_KEYS.map((key) => [key, 0])) as AvatarExpressionWeights;

export function cloneExpression(
  weights: Partial<AvatarExpressionWeights> | null | undefined,
): AvatarExpressionWeights {
  const next = { ...DEFAULT_EXPRESSION_WEIGHTS };
  if (!weights) return next;
  for (const key of AVATAR_EXPRESSION_MORPH_KEYS) {
    const value = weights[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = Math.min(1, Math.max(0, value));
    }
  }
  return next;
}

export function expressionHasValues(weights: AvatarExpressionWeights): boolean {
  return AVATAR_EXPRESSION_MORPH_KEYS.some((key) => (weights[key] ?? 0) > 0.001);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function lerpExpression(
  a: AvatarExpressionWeights,
  b: AvatarExpressionWeights,
  t: number,
): AvatarExpressionWeights {
  const u = smoothstep(t);
  const next = { ...DEFAULT_EXPRESSION_WEIGHTS };
  for (const key of AVATAR_EXPRESSION_MORPH_KEYS) {
    next[key] = lerp(a[key] ?? 0, b[key] ?? 0, u);
  }
  return next;
}

/** Max-blend several expression layers (0–1 clamp). */
export function maxBlendExpressions(
  layers: AvatarExpressionWeights[],
): AvatarExpressionWeights {
  const next = { ...DEFAULT_EXPRESSION_WEIGHTS };
  for (const layer of layers) {
    for (const key of AVATAR_EXPRESSION_MORPH_KEYS) {
      next[key] = Math.max(next[key], layer[key] ?? 0);
    }
  }
  return next;
}

/** Mirror Left → Right for paired morphs (scalar copy, no sign flip). */
const EXPRESSION_MIRROR_PAIRS: Array<[AvatarExpressionMorphKey, AvatarExpressionMorphKey]> = [
  ["eyeBlinkLeft", "eyeBlinkRight"],
  ["eyesLookLeft", "eyesLookRight"],
  ["browDownLeft", "browDownRight"],
  ["browOuterUpLeft", "browOuterUpRight"],
  ["mouthSmileLeft", "mouthSmileRight"],
  ["mouthStretchLeft", "mouthStretchRight"],
  ["mouthLowerDownLeft", "mouthLowerDownRight"],
  ["mouthUpperUpLeft", "mouthUpperUpRight"],
];

export function mirrorExpressionLeftToRight(
  weights: AvatarExpressionWeights,
): AvatarExpressionWeights {
  const next = cloneExpression(weights);
  for (const [left, right] of EXPRESSION_MIRROR_PAIRS) {
    next[right] = next[left];
  }
  return next;
}

type MorphChannel = { influences: number[]; index: number };

/**
 * Binds ARKit-style morphs on a GLB and applies authored weights each frame
 * (after viseme + idle so lab preview isn't wiped).
 */
export class ExpressionMorphApplier {
  private channels = new Map<AvatarExpressionMorphKey, MorphChannel[]>();
  private lastApplied = new Set<AvatarExpressionMorphKey>();

  bind(root: Object3D): void {
    this.channels.clear();
    this.lastApplied.clear();

    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) {
        return;
      }
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;

      for (const key of AVATAR_EXPRESSION_MORPH_KEYS) {
        const names = MORPH_ALIASES[key] ?? [key];
        for (const name of names) {
          const index = dict[name];
          if (index == null) continue;
          const list = this.channels.get(key) ?? [];
          list.push({ influences, index });
          this.channels.set(key, list);
          break;
        }
      }
    });
  }

  hasSupport(): boolean {
    return this.channels.size > 0;
  }

  /** Write weights; clears previously authored morphs that are now ~0. */
  apply(weights: AvatarExpressionWeights | null | undefined): void {
    const next = new Set<AvatarExpressionMorphKey>();
    const src = weights ?? DEFAULT_EXPRESSION_WEIGHTS;

    for (const key of AVATAR_EXPRESSION_MORPH_KEYS) {
      const value = Math.min(1, Math.max(0, src[key] ?? 0));
      if (value > 0.001) {
        this.setKey(key, value);
        next.add(key);
      }
    }

    for (const key of this.lastApplied) {
      if (!next.has(key)) this.setKey(key, 0);
    }
    this.lastApplied = next;
  }

  private setKey(key: AvatarExpressionMorphKey, value: number): void {
    const list = this.channels.get(key);
    if (!list) return;
    for (const channel of list) {
      channel.influences[channel.index] = value;
    }
  }
}
