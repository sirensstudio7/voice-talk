"use client";

import { useLayoutEffect, useState } from "react";

import {
  isPortraitViewport,
  type DisplayOrientation,
  type DisplayOrientationSetting,
} from "@/lib/display-orientation";

function initialResolvedOrientation(setting: DisplayOrientationSetting): DisplayOrientation {
  if (setting === "auto") {
    if (typeof window !== "undefined") {
      return isPortraitViewport() ? "portrait" : "landscape";
    }
    return "landscape";
  }
  return setting;
}

export function useResolvedDisplayOrientation(
  setting: DisplayOrientationSetting,
): DisplayOrientation {
  const [resolved, setResolved] = useState<DisplayOrientation>(() =>
    initialResolvedOrientation(setting),
  );

  useLayoutEffect(() => {
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
