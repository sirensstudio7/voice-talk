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
          <p className="text-sm font-medium text-slate-500">Loading Eva 3D…</p>
        </div>
      </div>
    ),
  },
);

const HERO_PREVIEW_FRAME_CLASS =
  "absolute bottom-8 left-1/2 aspect-[2/3] w-[72%] max-w-[540px] -translate-x-1/2 [mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)]";

const HERO_PREVIEW_CANVAS_RESIZE = {
  scroll: false,
  offsetSize: true,
} as const;

export function HeroEvaAvatar() {
  return (
    <AvatarHero
      isTalking={false}
      assistantName="Eva"
      frameClassName={HERO_PREVIEW_FRAME_CLASS}
      resize={HERO_PREVIEW_CANVAS_RESIZE}
    />
  );
}
