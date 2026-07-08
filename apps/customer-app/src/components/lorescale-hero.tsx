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
          <p className="text-sm font-medium text-slate-500">Loading Lorescale 3D…</p>
        </div>
      </div>
    ),
  },
);

type LorescaleHeroProps = {
  isTalking: boolean;
};

const USE_PNG_AVATAR = process.env.NEXT_PUBLIC_USE_PNG_AVATAR === "true";

export function LorescaleHero({ isTalking }: LorescaleHeroProps) {
  return (
    <AvatarHero
      isTalking={isTalking}
      assistantName="Lorescale"
      usePngFallback={USE_PNG_AVATAR}
    />
  );
}
