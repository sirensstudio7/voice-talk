"use client";

import { ReactLenis } from "lenis/react";
import { useLayoutEffect, useState, type ReactNode } from "react";

const LENIS_OPTIONS = {
  autoRaf: true,
  lerp: 0.1,
  duration: 1.1,
  smoothWheel: true,
  touchMultiplier: 1.2,
  anchors: {
    offset: -72,
  },
} as const;

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  if (!enabled) {
    return children;
  }

  return (
    <ReactLenis root options={LENIS_OPTIONS}>
      {children}
    </ReactLenis>
  );
}
