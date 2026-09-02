"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useGLTF } from "@react-three/drei";

import type { AvatarMode } from "@voicetalk/avatar";

import { resolveMediaUrl } from "@/lib/menu-api";
import { useSessionStore } from "@/store/session-store";

const AvatarHero = dynamic(
  () => import("@voicetalk/avatar").then((mod) => ({ default: mod.AvatarHero })),
  {
    ssr: false,
    loading: () => null,
  },
);

type LorescaleHeroProps = {
  isTalking: boolean;
  mode?: AvatarMode;
  mouthOpen?: number;
  frameClassName?: string;
};

const USE_PNG_AVATAR = process.env.NEXT_PUBLIC_USE_PNG_AVATAR === "true";
const DEFAULT_PNG = "/lorescale-cashier-nobg.png";

export function LorescaleHero({
  isTalking,
  mode = "idle",
  mouthOpen = 0,
  frameClassName,
}: LorescaleHeroProps) {
  const assistantName = useSessionStore((s) => s.assistantName);
  const avatarModelPath = useSessionStore((s) => s.avatarModelPath);
  const avatarUrl = useSessionStore((s) => s.avatarUrl);
  const name = assistantName || "Lorescale";
  // 2D assistant photo is header/chat only — never used as a 3D stage stand-in.
  const pngOnlySrc = avatarUrl ? resolveMediaUrl(avatarUrl) : DEFAULT_PNG;

  // Warm the GLB in the browser cache as soon as the menu path is known.
  useEffect(() => {
    if (!avatarModelPath || USE_PNG_AVATAR) return;
    try {
      useGLTF.preload(avatarModelPath);
    } catch {
      // Preload is best-effort.
    }
  }, [avatarModelPath]);

  if (USE_PNG_AVATAR) {
    return (
      <AvatarHero
        isTalking={isTalking}
        mode={mode}
        mouthOpen={mouthOpen}
        assistantName={name}
        usePngFallback
        pngSrc={pngOnlySrc}
        frameClassName={frameClassName}
      />
    );
  }

  // Wait for the GLB path — keep the stage empty (no 2D assistant photo flash).
  if (!avatarModelPath) {
    return (
      <div
        className={frameClassName}
        aria-label={`${name}, AI assistant`}
        role="img"
      />
    );
  }

  return (
    <AvatarHero
      key={avatarModelPath}
      isTalking={isTalking}
      mode={mode}
      modelPath={avatarModelPath}
      framing="bust"
      mouthOpen={mouthOpen}
      assistantName={name}
      frameClassName={frameClassName}
    />
  );
}
