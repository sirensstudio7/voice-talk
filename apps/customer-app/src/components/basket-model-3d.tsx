"use client";

import { Bounds, Center, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { Group, SRGBColorSpace, type Material, type Mesh } from "three";

const MODEL_PATH = "/models/cart-basket.web.glb";
const VIEWPORT_HEIGHT_PX = 176;

useGLTF.preload(MODEL_PATH, true, true);

function prepareMaterials(root: Group) {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];

    for (const mat of materials) {
      if ("map" in mat && mat.map) {
        mat.map.colorSpace = SRGBColorSpace;
      }

      if ("emissiveMap" in mat && mat.emissiveMap) {
        mat.emissiveMap.colorSpace = SRGBColorSpace;
      }

      mat.needsUpdate = true;
    }
  });
}

function CartBasketModel() {
  const spinRef = useRef<Group>(null);
  const { scene } = useGLTF(MODEL_PATH, true, true);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    prepareMaterials(clone);
    return clone;
  }, [scene]);

  useFrame((_, delta) => {
    if (spinRef.current) {
      spinRef.current.rotation.y += delta * 0.55;
    }
  });

  return (
    <group ref={spinRef}>
      <primitive object={model} />
    </group>
  );
}

function BasketScene() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 7, 5]} intensity={1.15} />
      <directionalLight position={[-4, 3, -2]} intensity={0.35} />
      <Bounds fit clip observe margin={1.35}>
        <Center>
          <CartBasketModel />
        </Center>
      </Bounds>
    </>
  );
}

type BasketModel3DProps = {
  className?: string;
};

export function BasketModel3D({ className }: BasketModel3DProps) {
  return (
    <div
      className={className}
      style={{ width: "100%", height: VIEWPORT_HEIGHT_PX, minHeight: VIEWPORT_HEIGHT_PX }}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 28, near: 0.1, far: 500 }}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <Suspense fallback={null}>
          <BasketScene />
        </Suspense>
      </Canvas>
    </div>
  );
}
