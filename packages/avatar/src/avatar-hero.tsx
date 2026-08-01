"use client";

import { Component, Suspense, type ReactNode } from "react";

import {
  Avatar3D,
  type Avatar3DProps,
  type AvatarFraming,
  type AvatarMode,
} from "./avatar-3d";
import { DEFAULT_MODEL_PATH } from "./model-calibration";

export const HERO_FRAME_CLASS =
  "absolute bottom-0 left-1/2 aspect-[2/3] h-[120vh] max-h-none max-w-[100vw] -translate-x-1/2 overflow-visible";

export const COMPACT_HERO_FRAME_CLASS =
  "relative mx-auto aspect-[2/3] h-full max-h-[420px] w-auto overflow-visible";

export const LANDSCAPE_HERO_FRAME_CLASS =
  "absolute bottom-0 right-[6%] aspect-[2/3] h-[110vh] max-h-none max-w-[48vw] w-auto overflow-visible";

export const PORTRAIT_HERO_FRAME_CLASS =
  "relative mx-auto aspect-[2/3] w-[68%] max-w-[88%] shrink-0 overflow-visible";

function AvatarHeroFallback({
  assistantName,
  pngSrc,
}: {
  assistantName: string;
  pngSrc?: string;
}) {
  if (pngSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pngSrc}
        alt=""
        className="h-full w-full object-contain object-bottom"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-end justify-center pb-8">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
        <p className="text-sm font-medium text-slate-500">Loading {assistantName} 3D…</p>
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
  mode?: AvatarMode;
  modelPath?: string;
  framing?: AvatarFraming;
  mouthOpen?: number;
  /** Live idle arm/hand pose offsets (degrees from bind). */
  idlePose?: Avatar3DProps["idlePose"];
  /** Authored facial morph weights (0–1). */
  expressionWeights?: Avatar3DProps["expressionWeights"];
  /** Scrubbable idle cycle (superadmin pose lab). */
  idleLab?: Avatar3DProps["idleLab"];
  /** Drag to orbit / scroll to zoom (superadmin pose lab). */
  enableOrbit?: boolean;
  assistantName?: string;
  frameClassName?: string;
  pngSrc?: string;
  usePngFallback?: boolean;
  resize?: Avatar3DProps["resize"];
  pauseWhenOffscreen?: Avatar3DProps["pauseWhenOffscreen"];
  performanceMode?: Avatar3DProps["performanceMode"];
  pauseWhenHidden?: Avatar3DProps["pauseWhenHidden"];
};

export function AvatarHero({
  isTalking,
  mode = "idle",
  modelPath = DEFAULT_MODEL_PATH,
  framing = "full",
  mouthOpen = 0,
  idlePose,
  expressionWeights = null,
  idleLab = null,
  enableOrbit = false,
  assistantName = "Lorescale",
  frameClassName = HERO_FRAME_CLASS,
  pngSrc = "/lorescale-cashier-nobg.png",
  usePngFallback = false,
  resize,
  pauseWhenOffscreen = false,
  performanceMode = "default",
  pauseWhenHidden = false,
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
        <Suspense
          fallback={<AvatarHeroFallback assistantName={assistantName} />}
        >
          {/*
            Keep a normal in-flow 2/3 box for layout/height. For kiosk bust, paint
            a wider WebGL layer on top so arms aren't cropped — camera zoom still
            uses the classic 2/3 hips→head fit.
          */}
          <div className="relative h-full w-full">
            <div
              className={
                framing === "bust" && !enableOrbit
                  ? "absolute inset-y-0 left-1/2 h-full w-[min(100vw,150%)] -translate-x-1/2"
                  : "h-full w-full"
              }
            >
              <Avatar3D
                isTalking={isTalking}
                mode={mode}
                modelPath={modelPath}
                framing={framing}
                mouthOpen={mouthOpen}
                idlePose={idlePose}
                expressionWeights={expressionWeights}
                idleLab={idleLab}
                enableOrbit={enableOrbit}
                resize={resize}
                pauseWhenOffscreen={pauseWhenOffscreen}
                performanceMode={performanceMode}
                pauseWhenHidden={pauseWhenHidden}
              />
            </div>
          </div>
        </Suspense>
      </div>
    </AvatarHeroErrorBoundary>
  );
}
