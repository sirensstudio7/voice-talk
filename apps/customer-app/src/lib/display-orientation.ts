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

export const HERO_EMBED_QUERY_PARAM = "embed";
export const HERO_EMBED_QUERY_VALUE = "hero";
export const HERO_FRAME_QUERY_PARAM = "frame";

export function isHeroEmbedSearchParam(search: string): boolean {
  return (
    new URLSearchParams(search).get(HERO_EMBED_QUERY_PARAM) === HERO_EMBED_QUERY_VALUE
  );
}

/** Parent marketing iframe passes expected layout so SSR matches the frame aspect ratio. */
export function resolveHeroEmbedFrameOrientation(search: string): DisplayOrientation | null {
  const frame = new URLSearchParams(search).get(HERO_FRAME_QUERY_PARAM)?.trim().toLowerCase();
  if (frame === "portrait") return "portrait";
  if (frame === "landscape") return "landscape";
  return null;
}

/** Marketing hero iframe: match viewport aspect instead of forcing landscape kiosk layout. */
export function resolveDisplayOrientationSettingForEmbed(
  businessSetting: DisplayOrientationSetting,
  search: string,
): DisplayOrientationSetting {
  if (isHeroEmbedSearchParam(search)) return "auto";
  return businessSetting;
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
  bottomControlsClassName: null as string | null,
};

const PORTRAIT_STACKED_LAYOUT = {
  shellClassName: "relative h-[100dvh] w-full overflow-hidden bg-slate-100",
  frameClassName: "relative h-full w-full overflow-hidden bg-slate-100",
  heroWrapperClassName: "relative z-10 flex justify-center px-3 pt-[14%] pointer-events-none overflow-hidden",
  heroFrameClassName: PORTRAIT_HERO_FRAME_CLASS,
  gradientHeightClass: "h-[45%]",
  transcriptWrapperClass:
    "pointer-events-none absolute inset-x-0 bottom-[calc(9.5rem+3.25rem+1.5rem)] z-30 w-full px-4",
  transcriptInnerClass:
    "pointer-events-auto h-[min(24dvh,12.5rem)] w-full",
  statusOverlayClass:
    "absolute inset-x-0 bottom-[9.5rem] z-20 flex flex-col items-center gap-2 px-6",
  bottomControlsClassName: null as string | null,
};

/** Compact flex stack for the marketing hero iframe — avoids avatar/transcript overlap. */
const HERO_EMBED_PORTRAIT_FRAME_CLASS =
  "relative mx-auto aspect-[2/3] h-full max-h-full w-auto max-w-[74%] translate-y-[17%] [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_96%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_96%)]";

const HERO_EMBED_PORTRAIT_LAYOUT = {
  shellClassName: "relative h-[100dvh] w-full overflow-hidden bg-slate-100",
  frameClassName:
    "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-100",
  heroWrapperClassName:
    "relative z-10 flex min-h-0 flex-1 items-center justify-center px-3 pt-11 pointer-events-none overflow-hidden",
  heroFrameClassName: HERO_EMBED_PORTRAIT_FRAME_CLASS,
  gradientHeightClass: "h-[28%]",
  transcriptWrapperClass: "pointer-events-none relative z-30 shrink-0 px-3 pb-2.5",
  transcriptInnerClass: "pointer-events-auto h-[min(22dvh,10rem)] w-full",
  statusOverlayClass:
    "relative z-20 flex shrink-0 flex-col items-center gap-2.5 px-3 pb-2.5 pt-1.5",
  bottomControlsClassName: "relative z-20 shrink-0 px-3 pb-4 pt-3",
  compactUi: true,
};

export function getExperienceLayout(
  orientation: DisplayOrientation,
  options?: { heroEmbed?: boolean },
) {
  if (options?.heroEmbed && orientation === "portrait") {
    return {
      isLandscape: false,
      ...HERO_EMBED_PORTRAIT_LAYOUT,
    };
  }

  const isLandscape = orientation === "landscape";
  const layout = isLandscape ? LANDSCAPE_KIOSK_LAYOUT : PORTRAIT_STACKED_LAYOUT;

  return {
    isLandscape,
    compactUi: false,
    ...layout,
  };
}
