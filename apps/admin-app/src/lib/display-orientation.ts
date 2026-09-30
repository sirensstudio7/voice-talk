"use client";

import { useEffect, useState } from "react";

import { deferEffectRun } from "@/lib/defer-effect-run";

export type DisplayOrientation = "portrait" | "landscape";

export type DisplayOrientationSetting = DisplayOrientation | "auto";

export function normalizeDisplayOrientationSetting(
  value?: string | null,
): DisplayOrientationSetting {
  const cleaned = value?.trim().toLowerCase();
  if (cleaned === "portrait") return "portrait";
  if (cleaned === "auto") return "auto";
  return "landscape";
}

function isPortraitViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < window.innerHeight;
}

function initialResolvedOrientation(setting: DisplayOrientationSetting): DisplayOrientation {
  if (setting === "auto") return "landscape";
  return setting;
}

export function useResolvedDisplayOrientation(
  setting: DisplayOrientationSetting,
): DisplayOrientation {
  const [resolved, setResolved] = useState<DisplayOrientation>(() =>
    initialResolvedOrientation(setting),
  );

  useEffect(() => {
    if (setting !== "auto") {
      deferEffectRun(() => setResolved(setting));
      return;
    }

    const update = () => {
      setResolved(isPortraitViewport() ? "portrait" : "landscape");
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [setting]);

  return resolved;
}
