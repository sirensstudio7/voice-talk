"use client";

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Box3,
  DoubleSide,
  Group,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
} from "three";

import { DEFAULT_MODEL_PATH, getModelCalibration } from "./model-calibration";

useGLTF.preload(DEFAULT_MODEL_PATH);

type BlinkState = {
  nextBlink: number;
  blinkProgress: number;
  blinking: boolean;
  doubleBlinkPending: boolean;
};

type BlinkRig = {
  lashMesh: Mesh;
  lashBaseScaleY: number;
  lashBasePosY: number;
  lashAnchorY: number;
  eyeMaterials: Array<Material & { opacity?: number; transparent?: boolean }>;
};

const BLINK_CLOSE_S = 0.07;
const BLINK_HOLD_S = 0.035;
const BLINK_OPEN_S = 0.14;
const BLINK_DURATION_S = BLINK_CLOSE_S + BLINK_HOLD_S + BLINK_OPEN_S;
const MIN_LASH_SCALE = 0.04;

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function getBlinkAmount(progress: number): number {
  const closeEnd = BLINK_CLOSE_S / BLINK_DURATION_S;
  const holdEnd = (BLINK_CLOSE_S + BLINK_HOLD_S) / BLINK_DURATION_S;

  if (progress < closeEnd) {
    return easeInCubic(progress / closeEnd);
  }

  if (progress < holdEnd) {
    return 1;
  }

  return 1 - easeOutCubic((progress - holdEnd) / (1 - holdEnd));
}

function collectMaterials(mesh: Mesh | null) {
  if (!mesh?.material) {
    return [];
  }

  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Array<
    Material & { opacity?: number; transparent?: boolean }
  >;
}

function setupBlinkRig(model: Object3D): BlinkRig | null {
  let lashMesh: Mesh | undefined;
  let eyeMesh: Mesh | undefined;

  model.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) {
      return;
    }

    const name = mesh.name;
    if (name.includes("Eyelash")) {
      lashMesh = mesh;
    } else if (name.includes("Eye_Eye") && !name.includes("Sclera")) {
      eyeMesh = mesh;
    }
  });

  if (!lashMesh) {
    return null;
  }

  lashMesh.geometry.computeBoundingBox();
  const bbox = lashMesh.geometry.boundingBox;
  const lashAnchorY = bbox?.min.y ?? -1;

  const eyeMaterials = collectMaterials(eyeMesh ?? null);
  for (const material of eyeMaterials) {
    material.transparent = true;
    material.needsUpdate = true;
  }

  return {
    lashMesh,
    lashBaseScaleY: lashMesh.scale.y,
    lashBasePosY: lashMesh.position.y,
    lashAnchorY,
    eyeMaterials,
  };
}

function applyBlink(rig: BlinkRig, amount: number) {
  const closeFactor = 1 - amount * (1 - MIN_LASH_SCALE);
  rig.lashMesh.scale.y = rig.lashBaseScaleY * closeFactor;
  rig.lashMesh.position.y =
    rig.lashBasePosY + rig.lashAnchorY * rig.lashBaseScaleY * (1 - closeFactor);

  const eyeHidden = Math.max(0, (amount - 0.45) / 0.55);
  for (const material of rig.eyeMaterials) {
    material.opacity = 1 - eyeHidden * 0.98;
    material.depthWrite = material.opacity > 0.95;
    material.needsUpdate = true;
  }
}

function prepareMaterials(object: Object3D) {
  object.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    mesh.frustumCulled = false;

    const meshName = mesh.name;
    if (meshName.includes("EyeScleraReflect") || meshName.includes("MeniscusEye")) {
      mesh.visible = false;
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const mat = material as Material & {
        map?: { colorSpace: string };
        emissiveMap?: { colorSpace: string };
        transparent?: boolean;
        opacity?: number;
        side?: number;
        depthWrite?: boolean;
      };

      const needsDoubleSide =
        meshName.includes("Hair") ||
        meshName.includes("Eyelash") ||
        meshName.includes("Mouth");
      mat.side = needsDoubleSide ? DoubleSide : mat.side;

      if (mat.map) {
        mat.map.colorSpace = SRGBColorSpace;
      }

      if ("emissiveMap" in mat && mat.emissiveMap) {
        mat.emissiveMap.colorSpace = SRGBColorSpace;
      }

      if (meshName.includes("Eyelash")) {
        mat.transparent = true;
        mat.depthWrite = false;
      }

      mat.needsUpdate = true;
    }
  });
}

function fitCameraToModel(
  camera: PerspectiveCamera,
  target: Group,
  viewportWidth: number,
  viewportHeight: number,
) {
  target.updateWorldMatrix(true, true);

  const box = new Box3().setFromObject(target);
  if (box.isEmpty()) {
    return;
  }

  const modelSize = new Vector3();
  box.getSize(modelSize);

  const fovRad = (camera.fov * Math.PI) / 180;
  const aspect = viewportWidth / viewportHeight;

  const topMargin = 1.04;
  const sideMargin = 1.05;
  const bottomGap = modelSize.y * 0.01;

  const distForHeight =
    (modelSize.y * topMargin) / (2 * Math.tan(fovRad / 2));
  const distForWidth =
    (modelSize.x * sideMargin) / (2 * Math.tan(fovRad / 2) * aspect);
  const distance = Math.max(distForHeight, distForWidth);

  const halfViewHeight = distance * Math.tan(fovRad / 2);
  const lookAtX = (box.min.x + box.max.x) / 2;
  const lookAtZ = (box.min.z + box.max.z) / 2;
  const lookAtY = box.min.y + halfViewHeight - bottomGap;

  camera.position.set(lookAtX, lookAtY, lookAtZ + distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.lookAt(lookAtX, lookAtY, lookAtZ);
  camera.updateProjectionMatrix();
}

function BottomFitCamera({ target }: { target: RefObject<Group | null> }) {
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    const group = target.current;
    if (!group) {
      return;
    }

    const applyFit = () => {
      if (!target.current) {
        return;
      }

      fitCameraToModel(
        camera as PerspectiveCamera,
        target.current,
        size.width,
        size.height,
      );
    };

    applyFit();
    const firstFrame = requestAnimationFrame(applyFit);
    const secondFrame = requestAnimationFrame(() => {
      requestAnimationFrame(applyFit);
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [camera, size.height, size.width, target]);

  return null;
}

export type AvatarMode = "idle" | "greeting" | "listening" | "thinking" | "talking" | "goodbye";

function modeOffsets(mode: AvatarMode, t: number) {
  switch (mode) {
    case "greeting":
      return { lean: 0.02, sway: Math.sin(t * 2.5) * 0.012, talkBob: 0 };
    case "listening":
      return { lean: 0.035, sway: Math.sin(t * 1.4) * 0.006, talkBob: 0 };
    case "thinking":
      return { lean: -0.01, sway: Math.sin(t * 0.8) * 0.004, talkBob: 0 };
    case "talking":
      return { lean: 0.02, sway: 0, talkBob: Math.sin(t * 7) * 0.005 };
    case "goodbye":
      return { lean: 0.015, sway: Math.sin(t * 2) * 0.01, talkBob: 0 };
    case "idle":
    default:
      return { lean: 0, sway: 0, talkBob: 0 };
  }
}

function AvatarModel({
  isTalking,
  mode = "idle",
  modelPath,
}: {
  isTalking: boolean;
  mode?: AvatarMode;
  modelPath: string;
}) {
  const calibration = getModelCalibration(modelPath);
  const rootRef = useRef<Group>(null);
  const blinkRigRef = useRef<BlinkRig | null>(null);
  const blinkState = useRef<BlinkState>({
    nextBlink: 2 + Math.random() * 2,
    blinkProgress: 0,
    blinking: false,
    doubleBlinkPending: false,
  });

  const { scene } = useGLTF(modelPath);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    prepareMaterials(clone);
    return clone;
  }, [scene]);

  useLayoutEffect(() => {
    blinkRigRef.current = setupBlinkRig(model);
  }, [model]);

  useEffect(() => {
    model.traverse((object) => {
      const name = object.name;

      if (
        name === "Camera" ||
        name.startsWith("Sun") ||
        name === "Object_10" ||
        name === "Object_16" ||
        name === "Object_17"
      ) {
        object.visible = false;
      }
    });
  }, [model]);

  useFrame((state, delta) => {
    const root = rootRef.current;
    if (root) {
      const t = state.clock.elapsedTime;
      const bob = Math.sin(t * 1.1) * 0.008;
      const effectiveMode: AvatarMode = isTalking ? "talking" : mode;
      const offsets = modeOffsets(effectiveMode, t);
      root.position.y = calibration.bottomOffset + bob + offsets.talkBob;
      root.rotation.z = offsets.sway;
      root.rotation.x = offsets.lean;
    }

    const blink = blinkState.current;
    blink.nextBlink -= delta;

    if (!blink.blinking && blink.nextBlink <= 0) {
      blink.blinking = true;
      blink.blinkProgress = 0;
    }

    if (blink.blinking) {
      blink.blinkProgress += delta / BLINK_DURATION_S;

      if (blink.blinkProgress >= 1) {
        blink.blinking = false;
        blink.blinkProgress = 0;

        if (blink.doubleBlinkPending) {
          blink.doubleBlinkPending = false;
          blink.nextBlink = 0.12 + Math.random() * 0.08;
        } else {
          blink.nextBlink = 2.4 + Math.random() * 3.6;

          if (Math.random() < 0.14) {
            blink.doubleBlinkPending = true;
            blink.nextBlink = 0.12 + Math.random() * 0.08;
          }
        }
      }
    }

    const rig = blinkRigRef.current;
    if (!rig) {
      return;
    }

    const amount = blink.blinking ? getBlinkAmount(blink.blinkProgress) : 0;
    applyBlink(rig, amount);
  });

  return (
    <group ref={rootRef}>
      <group scale={calibration.scale}>
        <group
          position={[
            -calibration.center.x,
            -calibration.center.y,
            -calibration.center.z,
          ]}
        >
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}

function Scene({
  isTalking,
  mode,
  modelPath,
}: {
  isTalking: boolean;
  mode?: AvatarMode;
  modelPath: string;
}) {
  const fitRef = useRef<Group>(null);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-3, 2, 2]} intensity={0.55} />
      <directionalLight position={[0, 1, -2]} intensity={0.25} />
      <group ref={fitRef}>
        <AvatarModel isTalking={isTalking} mode={mode} modelPath={modelPath} />
      </group>
      <BottomFitCamera target={fitRef} />
    </>
  );
}

export type Avatar3DProps = {
  isTalking: boolean;
  mode?: AvatarMode;
  modelPath?: string;
  resize?: {
    scroll?: boolean;
    offsetSize?: boolean;
    debounce?: number | { scroll: number; resize: number };
  };
  /** Pause the render loop when the canvas is off-screen. */
  pauseWhenOffscreen?: boolean;
};

export function Avatar3D({
  isTalking,
  mode = "idle",
  modelPath = DEFAULT_MODEL_PATH,
  resize,
  pauseWhenOffscreen = false,
}: Avatar3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!pauseWhenOffscreen) {
      setIsVisible(true);
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "120px", threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [pauseWhenOffscreen]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <Canvas
        className="h-full w-full"
        dpr={[1, 2]}
        frameloop={pauseWhenOffscreen && !isVisible ? "never" : "always"}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 28, near: 0.01, far: 100 }}
        resize={resize}
        style={{ width: "100%", height: "100%", display: "block", background: "transparent" }}
      >
        <Scene isTalking={isTalking} mode={mode} modelPath={modelPath} />
      </Canvas>
    </div>
  );
}
