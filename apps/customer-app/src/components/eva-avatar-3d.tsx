"use client";

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
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

const MODEL_PATH = "/models/angelica3d.glb";

// Sketchfab export bounds from gltf-transform inspect.
const MODEL_CENTER = { x: 0, y: 378.74, z: 104.52 };
const MODEL_SCALE = 0.0105;
// Distance from centered origin down to the model's lowest vertex (hair/chin).
const MODEL_BOTTOM_OFFSET = 96.273 * MODEL_SCALE;

useGLTF.preload(MODEL_PATH);

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
  lashTopY: number;
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
  let lashMesh: Mesh | null = null;
  let eyeMesh: Mesh | null = null;

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

  const mesh = lashMesh;
  mesh.geometry.computeBoundingBox();
  const topY = mesh.geometry.boundingBox?.max.y ?? 1;

  const eyeMaterials = collectMaterials(eyeMesh);
  for (const material of eyeMaterials) {
    material.transparent = true;
    material.needsUpdate = true;
  }

  return {
    lashMesh: mesh,
    lashBaseScaleY: mesh.scale.y,
    lashBasePosY: mesh.position.y,
    lashTopY: topY,
    eyeMaterials,
  };
}

function applyBlink(rig: BlinkRig, amount: number) {
  const closeFactor = 1 - amount * (1 - MIN_LASH_SCALE);
  rig.lashMesh.scale.y = rig.lashBaseScaleY * closeFactor;
  rig.lashMesh.position.y =
    rig.lashBasePosY + rig.lashTopY * rig.lashBaseScaleY * (1 - closeFactor);

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

function EvaModel({ isTalking }: { isTalking: boolean }) {
  const rootRef = useRef<Group>(null);
  const blinkRigRef = useRef<BlinkRig | null>(null);
  const blinkState = useRef<BlinkState>({
    nextBlink: 2 + Math.random() * 2,
    blinkProgress: 0,
    blinking: false,
    doubleBlinkPending: false,
  });

  const { scene } = useGLTF(MODEL_PATH);
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
      const talkBob = isTalking ? Math.sin(t * 7) * 0.005 : 0;
      root.position.y = MODEL_BOTTOM_OFFSET + bob + talkBob;
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
      <group scale={MODEL_SCALE}>
        <group position={[-MODEL_CENTER.x, -MODEL_CENTER.y, -MODEL_CENTER.z]}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}

function Scene({ isTalking }: { isTalking: boolean }) {
  const fitRef = useRef<Group>(null);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} />
      <directionalLight position={[-3, 2, 2]} intensity={0.55} />
      <directionalLight position={[0, 1, -2]} intensity={0.25} />
      <group ref={fitRef}>
        <EvaModel isTalking={isTalking} />
      </group>
      <BottomFitCamera target={fitRef} />
    </>
  );
}

type EvaAvatar3DProps = {
  isTalking: boolean;
};

export function EvaAvatar3D({ isTalking }: EvaAvatar3DProps) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 28, near: 0.01, far: 100 }}
      style={{ background: "transparent" }}
    >
      <Scene isTalking={isTalking} />
    </Canvas>
  );
}
