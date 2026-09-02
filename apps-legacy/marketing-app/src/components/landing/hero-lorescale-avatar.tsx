"use client";

import dynamic from "next/dynamic";

const AvatarHero = dynamic(
  () => import("@voicetalk/avatar").then((mod) => ({ default: mod.AvatarHero })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-end justify-center pb-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
          <p className="text-sm font-medium text-slate-500">Loading Alex 3D…</p>
        </div>
      </div>
    ),
  },
);

const RESPONSIVE_PREVIEW_FRAME_CLASS =
  "absolute left-1/2 aspect-[2/3] -translate-x-1/2 top-[10%] w-[85%] max-w-[96%] sm:bottom-8 sm:top-auto sm:w-[72%] sm:max-w-[540px]";

const HERO_PREVIEW_CANVAS_RESIZE = {
  scroll: false,
  offsetSize: true,
} as const;

/** Fallback 3D preview when the live hero iframe cannot load. */
export function HeroLorescaleAvatar() {
  return (
    <AvatarHero
      isTalking={false}
      assistantName="Alex"
      modelPath="/models/thanh.glb"
      frameClassName={RESPONSIVE_PREVIEW_FRAME_CLASS}
      resize={HERO_PREVIEW_CANVAS_RESIZE}
      pauseWhenOffscreen
    />
  );
}
