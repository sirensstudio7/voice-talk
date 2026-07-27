"use client";

import { useEffect, useState } from "react";

import {
  isPortraitViewport,
  type DisplayOrientation,
  type DisplayOrientationSetting,
} from "@/lib/display-orientation";

function initialResolvedOrientation(
  setting: DisplayOrientationSetting,
  heroEmbed?: boolean,
): DisplayOrientation {
  if (setting === "auto") {
    if (typeof window !== "undefined") {
      return isPortraitViewport() ? "portrait" : "landscape";
    }
    // Marketing hero iframe is portrait on mobile; avoid landscape SSR flash/overlap.
    if (heroEmbed) return "portrait";
    return "landscape";
  }
  return setting;
}

export function useResolvedDisplayOrientation(
  setting: DisplayOrientationSetting,
  options?: { heroEmbed?: boolean },
): DisplayOrientation {
  const [resolved, setResolved] = useState<DisplayOrientation>(() =>
    initialResolvedOrientation(setting, options?.heroEmbed),
  );

  useEffect(() => {
    if (setting !== "auto") {
      setResolved(setting);
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
