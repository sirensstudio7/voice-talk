"use client";

import { useLayoutEffect, useRef } from "react";

export function FooterFitText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const element = textRef.current;
    if (!container || !element) return;

    function fit() {
      if (!container || !element) return;

      let min = 16;
      let max = 400;
      let best = min;

      while (min <= max) {
        const mid = Math.floor((min + max) / 2);
        element.style.fontSize = `${mid}px`;

        if (element.scrollWidth <= container.clientWidth) {
          best = mid;
          min = mid + 1;
        } else {
          max = mid - 1;
        }
      }

      element.style.fontSize = `${best}px`;
    }

    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(container);

    return () => observer.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <p
        ref={textRef}
        className="whitespace-nowrap font-bold uppercase leading-[0.85] tracking-[-0.06em] text-[#F3AC85]"
        aria-hidden
      >
        {text}
      </p>
    </div>
  );
}
