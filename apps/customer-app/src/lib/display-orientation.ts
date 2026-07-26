import {
  HERO_FRAME_CLASS,
  PORTRAIT_HERO_FRAME_CLASS,
} from "@voicetalk/avatar";

import { BOTTOM_GRADIENT_HEIGHT_CLASS } from "@/lib/gradient-style";

export type DisplayOrientation = "portrait" | "landscape";

export type DisplayOrientationSetting = DisplayOrientation | "auto";

export const DEFAULT_DISPLAY_ORIENTATION: DisplayOrientation = "landscape";

export const DEFAULT_DISPLAY_ORIENTATION_SETTING: DisplayOrientationSetting = "landscape";

/** Portrait phones: 9 wide × 16 tall */
export const PORTRAIT_ASPECT_CLASS = "aspect-[9/16]";

export function normalizeDisplayOrientationSetting(
  value?: string | null,
): DisplayOrientationSetting {
  const cleaned = value?.trim().toLowerCase();
  if (cleaned === "portrait") return "portrait";
  if (cleaned === "auto") return "auto";
  return "landscape";
}

/** @deprecated Use normalizeDisplayOrientationSetting for API values that may include auto. */
export function normalizeDisplayOrientation(value?: string | null): DisplayOrientation {
  return normalizeDisplayOrientationSetting(value) === "portrait" ? "portrait" : "landscape";
}

export function isPortraitViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < window.innerHeight;
}

export function resolveDisplayOrientation(
  setting: DisplayOrientationSetting,
): DisplayOrientation {
  if (setting === "auto") {
    return isPortraitViewport() ? "portrait" : "landscape";
  }
  return setting;
}

const LANDSCAPE_KIOSK_LAYOUT = {
  shellClassName: "relative h-[100dvh] w-full overflow-hidden bg-slate-100",
  frameClassName: "relative h-full w-full overflow-hidden",
  heroWrapperClassName: null as string | null,
  heroFrameClassName: HERO_FRAME_CLASS,
  gradientHeightClass: BOTTOM_GRADIENT_HEIGHT_CLASS,
  transcriptWrapperClass:
    "pointer-events-none absolute inset-x-0 bottom-0 top-[14%] z-30 flex items-end justify-start px-6 pb-[calc(2rem+4.5rem+1.5rem)]",
  transcriptInnerClass:
    "pointer-events-auto flex max-h-full min-h-0 w-72 max-w-[calc(100vw-3rem)] flex-col",
  statusOverlayClass:
    "absolute inset-x-0 bottom-[9.5rem] z-20 flex flex-col items-center gap-2 px-6",
};

const PORTRAIT_STACKED_LAYOUT = {
  shellClassName: "relative h-[100dvh] w-full overflow-hidden bg-slate-100",
  frameClassName: "relative h-full w-full overflow-hidden bg-slate-100",
  heroWrapperClassName: "relative z-10 flex justify-center px-3 pt-[14%]",
  heroFrameClassName: PORTRAIT_HERO_FRAME_CLASS,
  gradientHeightClass: "h-[45%]",
  transcriptWrapperClass:
    "pointer-events-none absolute inset-x-0 bottom-[calc(9.5rem+3.25rem+1.5rem)] z-30 w-full px-4",
  transcriptInnerClass:
    "pointer-events-auto h-[min(24dvh,12.5rem)] w-full",
  statusOverlayClass:
    "absolute inset-x-0 bottom-[9.5rem] z-20 flex flex-col items-center gap-2 px-6",
};

export function getExperienceLayout(orientation: DisplayOrientation) {
  const isLandscape = orientation === "landscape";
  const layout = isLandscape ? LANDSCAPE_KIOSK_LAYOUT : PORTRAIT_STACKED_LAYOUT;

  return {
    isLandscape,
    ...layout,
  };
}
