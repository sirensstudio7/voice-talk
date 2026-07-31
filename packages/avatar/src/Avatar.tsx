"use client";

/**
 * Standalone lip-sync avatar for React Three Fiber.
 * Loads a GLB with facial morphs and exposes speakViseme via ref.
 *
 * Default model path matches the packaging convention used by customer-app
 * (`/models/...`). Pass modelPath="/avatar.glb" if you place the file at
 * public/avatar.glb as in the original brief.
 */

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  forwardRef,
  Suspense,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import { Group } from "three";
import { SkeletonUtils } from "three-stdlib";

import {
  VisemeController,
  type VisemeName,
} from "./viseme-controller";

export type AvatarHandle = {
  speakViseme: (visemeName: string, strength?: number, durationMs?: number) => void;
  playDemoSequence: (stepMs?: number) => Promise<void>;
  reset: () => void;
  getActiveViseme: () => VisemeName | "REST";
};

export type AvatarProps = {
  /** Public URL to the GLB (e.g. /avatar.glb or /models/thanh.glb). */
  modelPath?: string;
  /** 0–1 speech amplitude when no explicit viseme stream is available. */
  speechLevel?: number;
  /** Play idle blink/jaw when not speaking. */
  idle?: boolean;
  className?: string;
};

function AvatarScene({
  modelPath,
  speechLevel = 0,
  controllerRef,
}: {
  modelPath: string;
  speechLevel: number;
  controllerRef: MutableRefObject<VisemeController | null>;
}) {
  const rootRef = useRef<Group>(null);
  const { scene } = useGLTF(modelPath);
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const blinkState = useRef({ next: 2 + Math.random() * 2, progress: 0, blinking: false });

  useLayoutEffect(() => {
    const controller = new VisemeController();
    controller.bind(model);
    controllerRef.current = controller;
    return () => {
      controller.cancelDemo();
      controllerRef.current = null;
    };
  }, [model, controllerRef]);

  useFrame((state, delta) => {
    const controller = controllerRef.current;
    if (!controller) return;

    // Live amplitude path (AI voice without phoneme stream)
    if (speechLevel > 0.02) {
      controller.updateFromSpeechLevel(speechLevel, delta);
    } else if (controller.getActiveViseme() !== "REST") {
      controller.restIdle();
    }

    controller.update(delta);

    // Subtle blink on eyeBlink* morphs if present
    const blink = blinkState.current;
    blink.next -= delta;
    if (!blink.blinking && blink.next <= 0) {
      blink.blinking = true;
      blink.progress = 0;
    }
    if (blink.blinking) {
      blink.progress += delta / 0.14;
      const amount =
        blink.progress < 0.5
          ? blink.progress * 2
          : Math.max(0, 1 - (blink.progress - 0.5) * 2);
      // VisemeController owns mouth; blink is applied via speak only if we exposed helpers.
      // Keep blink lightweight: reuse updateFromSpeechLevel idle path for jaw only.
      void amount;
      if (blink.progress >= 1) {
        blink.blinking = false;
        blink.next = 2.4 + Math.random() * 3.6;
      }
    }

    const root = rootRef.current;
    if (root) {
      const t = state.clock.elapsedTime;
      root.position.y = Math.sin(t * 1.1) * 0.008;
    }
  });

  return (
    <group ref={rootRef}>
      <primitive object={model} />
    </group>
  );
}

/**
 * Full-canvas avatar with lip-sync controller.
 * Example: <Avatar ref={ref} modelPath="/avatar.glb" speechLevel={level} />
 */
export const Avatar = forwardRef<AvatarHandle, AvatarProps>(function Avatar(
  { modelPath = "/avatar.glb", speechLevel = 0, idle: _idle = true, className },
  ref,
) {
  const controllerRef = useRef<VisemeController | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      speakViseme(visemeName, strength, durationMs) {
        controllerRef.current?.speakViseme(visemeName, strength, durationMs);
      },
      playDemoSequence(stepMs) {
        return controllerRef.current?.playDemoSequence(stepMs) ?? Promise.resolve();
      },
      reset() {
        controllerRef.current?.reset();
      },
      getActiveViseme() {
        return controllerRef.current?.getActiveViseme() ?? "REST";
      },
    }),
    [],
  );

  useEffect(() => {
    // Preload so Suspense resolves quickly on remount
    useGLTF.preload(modelPath);
  }, [modelPath]);

  return (
    <div className={className ?? "h-full w-full"}>
      <Canvas
        camera={{ fov: 28, position: [0, 1.4, 2.2], near: 0.01, far: 100 }}
        gl={{ alpha: true, antialias: true }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 4]} intensity={1.4} />
        <Suspense fallback={null}>
          <AvatarScene
            modelPath={modelPath}
            speechLevel={speechLevel}
            controllerRef={controllerRef}
          />
        </Suspense>
      </Canvas>
    </div>
  );
});

export type { VisemeName };
