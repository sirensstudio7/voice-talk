"use client";

import { useEffect, useState } from "react";

import { deferEffectRun } from "@/lib/defer-effect-run";
import { useIsClient } from "@/lib/use-is-client";

export const SLIDE_OVER_DURATION_MS = 300;

export function slideOverBackdropClass(visible: boolean) {
  return `fixed inset-0 bg-slate-900/30 backdrop-blur-[2px] transition-opacity duration-300 ${
    visible ? "opacity-100" : "opacity-0"
  }`;
}

export function slideOverPanelClass(visible: boolean, extra = "") {
  return `fixed right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-slate-200 shadow-2xl transition-transform duration-300 ease-out ${extra} ${
    visible ? "translate-x-0" : "translate-x-full"
  }`;
}

export function useSlideOver(open: boolean) {
  const isClient = useIsClient();
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (open) {
      deferEffectRun(() => setIsRendered(true));
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(frame);
    }

    deferEffectRun(() => setIsVisible(false));
    const timer = window.setTimeout(() => setIsRendered(false), SLIDE_OVER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { mounted: isClient, isRendered, isVisible };
}
