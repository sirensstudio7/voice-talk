"use client";

import { Component, Suspense, type ReactNode } from "react";

import { Avatar3D } from "./avatar-3d";
import { DEFAULT_MODEL_PATH } from "./model-calibration";

export const HERO_FRAME_CLASS =
  "absolute bottom-12 left-1/2 aspect-[2/3] h-[120vh] max-h-none max-w-[100vw] -translate-x-1/2 [mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)]";

export const COMPACT_HERO_FRAME_CLASS =
  "relative mx-auto aspect-[2/3] h-full max-h-[420px] w-auto [mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_94%)]";

function AvatarHeroFallback({ assistantName }: { assistantName: string }) {
  return (
    <div className="flex h-full w-full items-end justify-center pb-8">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
        <p className="text-sm font-medium text-slate-500">Loading {assistantName} 3D…</p>
        <p className="text-xs text-slate-400">First load may take a few seconds</p>
      </div>
    </div>
  );
}

function AvatarHeroErrorFallback() {
  return (
    <div className="flex h-full w-full items-end justify-center pb-8">
      <p className="max-w-xs rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-center text-sm text-slate-600 shadow-sm">
        Unable to load 3D avatar. Refresh the page to try again.
      </p>
    </div>
  );
}

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

class AvatarHeroErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <AvatarHeroErrorFallback />;
    }

    return this.props.children;
  }
}

export type AvatarHeroProps = {
  isTalking: boolean;
  modelPath?: string;
  assistantName?: string;
  frameClassName?: string;
  pngSrc?: string;
  usePngFallback?: boolean;
};

export function AvatarHero({
  isTalking,
  modelPath = DEFAULT_MODEL_PATH,
  assistantName = "Eva",
  frameClassName = HERO_FRAME_CLASS,
  pngSrc = "/eva-cashier-nobg.png",
  usePngFallback = false,
}: AvatarHeroProps) {
  const ariaLabel = `${assistantName}, AI assistant`;

  if (usePngFallback) {
    return (
      <div
        className={`${frameClassName} ${isTalking ? "avatar-talking" : ""}`}
        aria-label={ariaLabel}
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pngSrc}
          alt={ariaLabel}
          className="h-full w-full object-contain object-bottom"
        />
      </div>
    );
  }

  return (
    <AvatarHeroErrorBoundary>
      <div
        className={`${frameClassName} ${isTalking ? "avatar-talking" : ""}`}
        aria-label={ariaLabel}
        role="img"
      >
        <Suspense fallback={<AvatarHeroFallback assistantName={assistantName} />}>
          <div className="h-full w-full">
            <Avatar3D isTalking={isTalking} modelPath={modelPath} />
          </div>
        </Suspense>
      </div>
    </AvatarHeroErrorBoundary>
  );
}
