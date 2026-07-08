"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function getMinScale(width: number) {
  if (width >= 1024) return 0.804;
  if (width >= 640) return 0.84;
  return 0.92;
}

function getScrollProgress(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;

  const start = viewportHeight * 0.92;
  const end = viewportHeight * 0.28;
  const progress = (start - rect.top) / (start - end);

  return Math.min(1, Math.max(0, progress));
}

function getSideInset(width: number, progress: number) {
  const maxInset = width >= 1024 ? 30 : width >= 640 ? 20 : 12;
  return maxInset * progress;
}

export function HeroDashboardScale({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.92);
  const [sideInset, setSideInset] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;

    const updateScale = () => {
      frame = 0;
      const minScale = getMinScale(window.innerWidth);
      const progress = getScrollProgress(container);
      setScale(minScale + (1 - minScale) * progress);
      setSideInset(getSideInset(window.innerWidth, progress));
    };

    const onScrollOrResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateScale);
    };

    updateScale();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full"
      style={{
        paddingLeft: sideInset,
        paddingRight: sideInset,
      }}
    >
      <div
        className="origin-center will-change-transform"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
