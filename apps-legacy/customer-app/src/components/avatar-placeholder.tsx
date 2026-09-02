"use client";

import { useSessionStore } from "@/store/session-store";

export function AvatarPlaceholder() {
  const { isTalking } = useSessionStore();

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-end justify-center">
      <div
        className={`relative flex h-[85%] w-full max-w-lg flex-col items-center justify-end pb-[22%] ${
          isTalking ? "avatar-talking" : ""
        }`}
      >
        <div className="relative flex flex-col items-center">
          <div
            className={`relative flex h-52 w-52 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-100 via-amber-50 to-sky-100 shadow-[0_20px_60px_rgba(15,23,42,0.15)] ring-[6px] ring-white ${
              isTalking ? "ring-orange-400" : ""
            }`}
          >
            <span className="text-[5.5rem] leading-none" role="img" aria-label="Lorescale">
              👩‍🍳
            </span>
          </div>

          <div className="mt-4 text-center">
            <p className="text-2xl font-bold tracking-tight text-slate-900">Lorescale</p>
            <p className="text-sm font-medium text-slate-600">Sunrise Coffee</p>
          </div>
        </div>

        {isTalking && (
          <div className="absolute inset-x-[20%] top-[8%] bottom-[30%] rounded-[3rem] border-2 border-orange-400/50" />
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-slate-100 via-slate-50/80 to-transparent" />
    </div>
  );
}
