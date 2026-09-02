"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useGLTF } from "@react-three/drei";
import type { AvatarMode } from "@voicetalk/avatar";

import { useVoiceStore } from "@/store/voice-store";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useBusinessSlug } from "@/context/business-context";

const AvatarHero = dynamic(
  () => import("@voicetalk/avatar").then((mod) => ({ default: mod.AvatarHero })),
  { ssr: false, loading: () => null }
);

const USE_PNG_AVATAR = process.env.NEXT_PUBLIC_USE_PNG_AVATAR === "true";
const DEFAULT_PNG = "/lorescale-cashier-nobg.png";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

export function AvatarViewport() {
  const slug = useBusinessSlug();
  const { isTalking, mouthOpen } = useVoiceSession(slug);
  const assistantName = useVoiceStore((s) => s.assistantName);
  const avatarModelPath = useVoiceStore((s) => s.avatarModelPath);
  const avatarUrl = useVoiceStore((s) => s.avatarUrl);
  const kioskPhase = useVoiceStore((s) => s.kioskPhase);
  
  const name = assistantName || "Lorescale";
  const pngOnlySrc = avatarUrl ? resolveMediaUrl(avatarUrl) : DEFAULT_PNG;

  let mode: AvatarMode = "idle";
  if (kioskPhase === "greeting") mode = "greeting";
  else if (kioskPhase === "listening") mode = "listening";
  else if (kioskPhase === "thinking") mode = "thinking";
  else if (kioskPhase === "talking") mode = "talking";
  else if (kioskPhase === "goodbye") mode = "goodbye";

  useEffect(() => {
    if (!avatarModelPath || USE_PNG_AVATAR) return;
    try {
      useGLTF.preload(avatarModelPath);
    } catch {}
  }, [avatarModelPath]);

  const frameClassName = "absolute inset-0 z-0 h-full w-full object-cover object-center";

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
