"use client";

import { OrbitControls, useGLTF } from "@react-three/drei";
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
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SkeletonUtils } from "three-stdlib";

import { DEFAULT_MODEL_PATH, getModelCalibration } from "./model-calibration";
import {
  AvatarIdleController,
  type AvatarIdlePoseOffsets,
} from "./avatar-idle-controller";
import {
  ExpressionMorphApplier,
  type AvatarExpressionWeights,
} from "./expression-weights";
import { VisemeController } from "./viseme-controller";

/** Scrubbable idle preview for the superadmin pose lab. */
export type AvatarIdleLabClock = {
  /** Seconds into the loop. */
  time: number;
  /** Loop length in seconds. */
  period: number;
  /** 0 = frozen static pose, 1 = full breath/sway/blink. */
  jitter: number;
};

type BlinkRig = {
  lashMesh: Mesh;
  lashBaseScaleY: number;
  lashBasePosY: number;
  lashAnchorY: number;
  eyeMaterials: Array<Material & { opacity?: number; transparent?: boolean }>;
};

const MIN_LASH_SCALE = 0.04;

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

export type AvatarFraming = "full" | "bust";

/** Hip line as a fraction of body height from the feet (head → hips crop). */
const BUST_HIP_FRACTION = 0.46;

function findSkeletonBone(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((object) => {
    if (found) return;
    const mesh = object as Mesh & {
      isSkinnedMesh?: boolean;
      skeleton?: { getBoneByName: (boneName: string) => Object3D | undefined };
    };
    if (mesh.isSkinnedMesh && mesh.skeleton) {
      found = mesh.skeleton.getBoneByName(name) ?? null;
    }
  });
  if (found) return found;
  root.traverse((object) => {
    if (!found && object.name === name) found = object;
  });
  return found;
}

function fitCameraToModel(
  camera: PerspectiveCamera,
  target: Group,
  viewportWidth: number,
  viewportHeight: number,
  framing: AvatarFraming = "full",
): Vector3 | null {
  target.updateWorldMatrix(true, true);

  const box = new Box3().setFromObject(target);
  if (box.isEmpty()) {
    return null;
  }

  const modelSize = new Vector3();
  box.getSize(modelSize);

  let frameMinY = box.min.y;
  let frameMaxY = box.max.y;
  // Keep horizontal zoom stable when arms move (don't use ultra-narrow torso width).
  let frameWidth = Math.max(modelSize.x, modelSize.y * 0.38);

  if (framing === "bust") {
    const head = findSkeletonBone(target, "Head");
    const hips = findSkeletonBone(target, "Hips");

    if (head && hips) {
      const headPos = new Vector3();
      const hipsPos = new Vector3();
      head.getWorldPosition(headPos);
      hips.getWorldPosition(hipsPos);
      // Exact head → hips crop
      frameMinY = hipsPos.y;
      frameMaxY = headPos.y + (headPos.y - hipsPos.y) * 0.12;
    } else {
      frameMinY = box.min.y + modelSize.y * BUST_HIP_FRACTION;
      frameMaxY = box.max.y;
    }
  }

  const frameHeight = Math.max(frameMaxY - frameMinY, modelSize.y * 0.2);

  const fovRad = (camera.fov * Math.PI) / 180;
  const aspect = viewportWidth / Math.max(viewportHeight, 1);

  // Bust margins — head→hips fill; extra bottom gap so hips aren't clipped.
  const topMargin = framing === "bust" ? 1.05 : 1.04;
  const sideMargin = framing === "bust" ? 1.1 : 1.05;
  const bottomGap = frameHeight * (framing === "bust" ? 0.06 : 0.01);

  // Bust zoom is locked to the classic 2/3 hero aspect so hips→head size stays
  // identical even when the WebGL canvas is rendered wider for arm clearance.
  const fitAspect = framing === "bust" ? Math.min(aspect, 2 / 3) : aspect;

  const distForHeight =
    (frameHeight * topMargin) / (2 * Math.tan(fovRad / 2));
  const distForWidth =
    (frameWidth * sideMargin) / (2 * Math.tan(fovRad / 2) * fitAspect);
  const distance = Math.max(distForHeight, distForWidth);

  const halfViewHeight = distance * Math.tan(fovRad / 2);
  const lookAtX = (box.min.x + box.max.x) / 2;
  const lookAtZ = (box.min.z + box.max.z) / 2;
  const lookAtY = frameMinY + halfViewHeight - bottomGap;

  camera.position.set(lookAtX, lookAtY, lookAtZ + distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.lookAt(lookAtX, lookAtY, lookAtZ);
  camera.updateProjectionMatrix();
  return new Vector3(lookAtX, lookAtY, lookAtZ);
}

function BottomFitCamera({
  target,
  framing,
  fitKey,
  enableOrbit = false,
}: {
  target: RefObject<Group | null>;
  framing: AvatarFraming;
  /** Bump to re-run fit after pose / model settles. */
  fitKey?: string | number;
  /** Allow drag-to-orbit (superadmin pose lab). */
  enableOrbit?: boolean;
}) {
  const { camera, size } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useLayoutEffect(() => {
    const group = target.current;
    if (!group) {
      return;
    }

    const applyFit = () => {
      if (!target.current) {
        return;
      }

      const lookAt = fitCameraToModel(
        camera as PerspectiveCamera,
        target.current,
        size.width,
        size.height,
        framing,
      );
      if (lookAt && controlsRef.current) {
        controlsRef.current.target.copy(lookAt);
        controlsRef.current.update();
      }
    };

    applyFit();
    const frameA = requestAnimationFrame(applyFit);
    const frameB = requestAnimationFrame(() => requestAnimationFrame(applyFit));
    const t1 = window.setTimeout(applyFit, 50);
    const t2 = window.setTimeout(applyFit, 200);
    const t3 = window.setTimeout(applyFit, 500);

    return () => {
      cancelAnimationFrame(frameA);
      cancelAnimationFrame(frameB);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [camera, fitKey, framing, size.height, size.width, target]);

  if (!enableOrbit) return null;

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableZoom
      enableRotate
      minDistance={0.35}
      maxDistance={6}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI - 0.2}
      rotateSpeed={0.7}
      zoomSpeed={0.85}
    />
  );
}

export type AvatarMode =
  | "idle"
  | "greeting"
  | "acknowledge"
  | "talk_gesture"
  | "listening"
  | "thinking"
  | "talking"
  | "goodbye";

function modeOffsets(mode: AvatarMode, t: number) {
  switch (mode) {
    case "greeting":
    case "acknowledge":
    case "talk_gesture":
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

type MouthMorphTarget = {
  influences: number[];
  jawOpenIndex: number | null;
  mouthOpenIndex: number | null;
};

function setupMouthMorphs(model: Object3D): MouthMorphTarget[] {
  const targets: MouthMorphTarget[] = [];

  model.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) {
      return;
    }

    const dictionary = mesh.morphTargetDictionary;
    const jawOpenIndex = dictionary.jawOpen ?? dictionary.JawOpen ?? null;
    const mouthOpenIndex = dictionary.mouthOpen ?? dictionary.MouthOpen ?? null;
    if (jawOpenIndex == null && mouthOpenIndex == null) {
      return;
    }

    targets.push({
      influences: mesh.morphTargetInfluences,
      jawOpenIndex: typeof jawOpenIndex === "number" ? jawOpenIndex : null,
      mouthOpenIndex: typeof mouthOpenIndex === "number" ? mouthOpenIndex : null,
    });
  });

  return targets;
}

function applyMouthOpen(targets: MouthMorphTarget[], amount: number) {
  const open = Math.max(0, Math.min(0.35, amount * 0.45));
  for (const target of targets) {
    if (target.jawOpenIndex != null) {
      target.influences[target.jawOpenIndex] = open;
    }
    if (target.mouthOpenIndex != null) {
      target.influences[target.mouthOpenIndex] = open * 0.5;
    }
  }
}

function AvatarModel({
  isTalking,
  mode = "idle",
  modelPath,
  mouthOpen = 0,
  idlePose,
  expressionWeights,
  idleLab,
}: {
  isTalking: boolean;
  mode?: AvatarMode;
  modelPath: string;
  mouthOpen?: number;
  idlePose?: AvatarIdlePoseOffsets;
  expressionWeights?: AvatarExpressionWeights | null;
  idleLab?: AvatarIdleLabClock | null;
}) {
  const calibration = getModelCalibration(modelPath);
  const rootRef = useRef<Group>(null);
  const blinkRigRef = useRef<BlinkRig | null>(null);
  const mouthMorphsRef = useRef<MouthMorphTarget[]>([]);
  const visemeRef = useRef<VisemeController | null>(null);
  const idleRef = useRef<AvatarIdleController | null>(null);
  const expressionRef = useRef<ExpressionMorphApplier | null>(null);
  // Keep latest mode for useFrame (avoids stale closures if the callback is reused).
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const idleLabRef = useRef(idleLab);
  idleLabRef.current = idleLab;
  const expressionWeightsRef = useRef(expressionWeights);
  expressionWeightsRef.current = expressionWeights;

  const { scene } = useGLTF(modelPath);
  const model = useMemo(() => {
    // scene.clone(true) breaks SkinnedMesh ↔ Bone links; SkeletonUtils keeps them bound.
    const clone = SkeletonUtils.clone(scene);
    prepareMaterials(clone);
    return clone;
  }, [scene]);

  useLayoutEffect(() => {
    blinkRigRef.current = setupBlinkRig(model);
    mouthMorphsRef.current = setupMouthMorphs(model);

    const viseme = new VisemeController();
    viseme.bind(model);
    visemeRef.current = viseme.hasMorphSupport() ? viseme : null;

    const idle = new AvatarIdleController();
    idle.bindFromRoot(model);
    if (idlePose) idle.setPoseOffsets(idlePose);
    idleRef.current = idle;

    const expression = new ExpressionMorphApplier();
    expression.bind(model);
    expressionRef.current = expression;

    return () => {
      viseme.cancelDemo();
      visemeRef.current = null;
      idle.reset();
      idleRef.current = null;
      expressionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pose applied in separate effect
  }, [model]);

  useEffect(() => {
    if (idlePose) {
      idleRef.current?.setPoseOffsets(idlePose);
    }
  }, [idlePose]);

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
    const lab = idleLabRef.current;
    const root = rootRef.current;
    if (root) {
      const t = lab ? lab.time : state.clock.elapsedTime;
      const jitter = lab ? lab.jitter : 1;
      // Soft whole-body settle; bone-level breath lives in AvatarIdleController.
      const bob = Math.sin(t * 1.1) * 0.004 * jitter;
      const effectiveMode: AvatarMode = isTalking ? "talking" : mode;
      const offsets = modeOffsets(effectiveMode, t);
      root.position.y = calibration.bottomOffset + bob + offsets.talkBob * jitter;
      root.rotation.z = offsets.sway * jitter;
      root.rotation.x = offsets.lean * jitter;
    }

    const currentMode = modeRef.current;
    // Idle facial motion runs when this is false (see AvatarIdleController).
    const speaking =
      isTalking || currentMode === "talking" || mouthOpen > 0.04;

    // Viseme / mouth first so idle jaw/smile only layers when not speaking.
    const viseme = visemeRef.current;
    if (viseme) {
      viseme.updateFromSpeechLevel(mouthOpen, delta);
      viseme.update(delta);
    } else {
      applyMouthOpen(mouthMorphsRef.current, mouthOpen);
    }

    const idle = idleRef.current;
    if (idle) {
      // Wave / thumbs-up / talking hand gesture — mutually exclusive overlays.
      if (currentMode === "greeting") {
        idle.setGreetingActive(true);
      } else if (currentMode === "acknowledge") {
        idle.setThumbsUpActive(true);
      } else if (currentMode === "talk_gesture") {
        idle.setTalkingHandActive(true);
      } else {
        idle.setGreetingActive(false);
        idle.setThumbsUpActive(false);
        idle.setTalkingHandActive(false);
      }
      if (lab) {
        idle.updateLab(lab.time, lab.period, lab.jitter, speaking);
      } else {
        idle.update(delta, speaking);
      }
      const blinkAmount = idle.getBlinkAmount();
      const rig = blinkRigRef.current;
      if (rig) {
        applyBlink(rig, blinkAmount);
      }
    }

    // Authored face morphs last — viseme restIdle + idle smile would wipe them otherwise.
    expressionRef.current?.apply(expressionWeightsRef.current);
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
  framing,
  mouthOpen,
  idlePose,
  expressionWeights,
  idleLab,
  enableOrbit = false,
}: {
  isTalking: boolean;
  mode?: AvatarMode;
  modelPath: string;
  framing: AvatarFraming;
  mouthOpen: number;
  idlePose?: AvatarIdlePoseOffsets;
  expressionWeights?: AvatarExpressionWeights | null;
  idleLab?: AvatarIdleLabClock | null;
  enableOrbit?: boolean;
}) {
  const fitRef = useRef<Group>(null);
  // Don't refit on every pose slider tick — keeps size/position locked like before.
  const fitKey = `${modelPath}:${framing}`;

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-3, 2, 2]} intensity={0.55} />
      <directionalLight position={[0, 1, -2]} intensity={0.25} />
      <group ref={fitRef}>
        <AvatarModel
          isTalking={isTalking}
          mode={mode}
          modelPath={modelPath}
          mouthOpen={mouthOpen}
          idlePose={idlePose}
          expressionWeights={expressionWeights}
          idleLab={idleLab}
        />
      </group>
      <BottomFitCamera
        target={fitRef}
        framing={framing}
        fitKey={fitKey}
        enableOrbit={enableOrbit}
      />
    </>
  );
}

export type Avatar3DProps = {
  isTalking: boolean;
  mode?: AvatarMode;
  modelPath?: string;
  /** Camera crop: full body, or head-to-hips bust shot. */
  framing?: AvatarFraming;
  /** 0–1 jaw/mouth open amount for lip sync. */
  mouthOpen?: number;
  /** Live idle arm/hand pose offsets (degrees from bind). */
  idlePose?: AvatarIdlePoseOffsets;
  /** Authored facial morph weights (0–1) — pose lab expressions. */
  expressionWeights?: AvatarExpressionWeights | null;
  /** Scrubbable idle cycle (superadmin pose lab). */
  idleLab?: AvatarIdleLabClock | null;
  /** Drag to orbit / scroll to zoom the camera (pose lab). */
  enableOrbit?: boolean;
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
  framing = "full",
  mouthOpen = 0,
  idlePose,
  expressionWeights = null,
  idleLab = null,
  enableOrbit = false,
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
        <Scene
          isTalking={isTalking}
          mode={mode}
          modelPath={modelPath}
          framing={framing}
          mouthOpen={mouthOpen}
          idlePose={idlePose}
          expressionWeights={expressionWeights}
          idleLab={idleLab}
          enableOrbit={enableOrbit}
        />
      </Canvas>
    </div>
  );
}
