"use client";

/**
 * Reusable idle animation hook for GLB avatars (React / R3F).
 *
 * Drives subtle breathing, head sway, blinks, eye micro-saccades, jaw
 * relaxation, and shoulder motion via requestAnimationFrame + delta time.
 *
 * Facial idle (blink / eyes / jaw / head) fades out while `speaking` is true,
 * then eases back in after speech ends. Body breath/shoulders stay gentle.
 *
 * Prefer stepping `AvatarIdleController` inside R3F `useFrame` when the avatar
 * already lives in a Canvas (see avatar-3d.tsx). Use this hook for standalone
 * Three.js scenes or when you only have refs outside the render loop.
 *
 * @example
 * ```tsx
 * const headRef = useRef<Object3D>(null);
 * const eyeRef = useRef<Mesh>(null);
 * useAvatarIdle({
 *   speaking,
 *   headRef,
 *   eyeRef,
 *   jawRef: eyeRef,
 *   blinkMorphTarget: true,
 * });
 * ```
 */

import { useEffect, useRef } from "react";
import type { Object3D } from "three";
import { type Mesh } from "three";

import {
  AvatarIdleController,
  bindAvatarIdleTargets,
} from "./avatar-idle-controller";

export type UseAvatarIdleArgs = {
  /** Pause / fade facial idle while the character is talking. */
  speaking: boolean;
  /** Optional scene root — auto-binds Head / Spine2 / shoulders / morph meshes. */
  rootRef?: React.RefObject<Object3D | null>;
  headRef?: React.RefObject<Object3D | null>;
  /** Mesh (or object containing meshes) used for eye look / blink morphs. */
  eyeRef?: React.RefObject<Object3D | null>;
  /** Mesh used for jawOpen morph (often same as eye/head mesh). */
  jawRef?: React.RefObject<Object3D | null>;
  /** When true, drive eyeBlinkLeft/Right morph targets if present. */
  blinkMorphTarget?: boolean;
  /** Disable the rAF loop entirely. */
  enabled?: boolean;
};

function collectMeshes(root: Object3D | null | undefined): Mesh[] {
  if (!root) return [];
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      meshes.push(mesh);
    }
  });
  const self = root as Mesh;
  if (self.isMesh && self.morphTargetDictionary && self.morphTargetInfluences) {
    if (!meshes.includes(self)) meshes.push(self);
  }
  return meshes;
}

/**
 * Starts a requestAnimationFrame loop that updates an AvatarIdleController.
 * Cleans up the frame handle (and any bind-retry timer) on unmount.
 */
export function useAvatarIdle({
  speaking,
  rootRef,
  headRef,
  eyeRef,
  jawRef,
  blinkMorphTarget = true,
  enabled = true,
}: UseAvatarIdleArgs): void {
  const controllerRef = useRef<AvatarIdleController | null>(null);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  const rafRef = useRef<number>(0);
  const bindRafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AvatarIdleController();
    controllerRef.current = controller;
    let bound = false;
    let bindAttempts = 0;

    const tryBind = (): boolean => {
      if (rootRef?.current) {
        const targets = bindAvatarIdleTargets(rootRef.current);
        controller.bind({
          ...targets,
          enableBlinkMorphs: blinkMorphTarget,
        });
        return true;
      }

      const morphMeshes = [
        ...collectMeshes(eyeRef?.current ?? undefined),
        ...collectMeshes(jawRef?.current ?? undefined),
      ];
      const unique = Array.from(new Set(morphMeshes));
      const head = headRef?.current ?? null;

      if (!head && unique.length === 0) return false;

      controller.bind({
        head,
        morphMeshes: unique,
        enableBlinkMorphs: blinkMorphTarget,
      });
      return true;
    };

    const ensureBound = () => {
      if (bound) return;
      if (tryBind()) {
        bound = true;
        return;
      }
      if (bindAttempts >= 120) return;
      bindAttempts += 1;
      bindRafRef.current = requestAnimationFrame(ensureBound);
    };

    lastTimeRef.current = performance.now();
    ensureBound();

    const tick = (now: number) => {
      if (!bound) ensureBound();
      const last = lastTimeRef.current;
      lastTimeRef.current = now;
      const deltaSec = Math.min(0.05, Math.max(0, (now - last) / 1000));
      controller.update(deltaSec, speakingRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(bindRafRef.current);
      rafRef.current = 0;
      bindRafRef.current = 0;
      controller.reset();
      controllerRef.current = null;
    };
    // Bind once per enabled mount; speaking is read via ref each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rootRef, headRef, eyeRef, jawRef, blinkMorphTarget]);
}

/**
 * Helper for R3F: create a controller and bind targets from a scene graph.
 * Prefer stepping this inside `useFrame` so it stays locked to the render loop.
 */
export function createAvatarIdleFromRoot(root: Object3D): AvatarIdleController {
  const controller = new AvatarIdleController();
  const targets = bindAvatarIdleTargets(root);
  controller.bind(targets);
  return controller;
}
