"use client";

import { type ReactNode } from "react";

import { cn } from '@voicetalk/ui';

type VerticalMarqueeProps = {
  children: ReactNode;
  pauseOnHover?: boolean;
  reverse?: boolean;
  className?: string;
  speed?: number;
};

export function VerticalMarquee({
  children,
  pauseOnHover = false,
  reverse = false,
  className,
  speed = 30,
}: VerticalMarqueeProps) {
  return (
    <div className={cn("group overflow-hidden", className)}>
      <div
        className={cn(
          "pre-footer-vertical-marquee-track flex flex-col",
          reverse && "[animation-direction:reverse]",
          pauseOnHover && "group-hover:[animation-play-state:paused]",
        )}
        style={{ "--duration": `${speed}s` } as React.CSSProperties}
      >
        <div className="flex shrink-0 flex-col">{children}</div>
        <div className="flex shrink-0 flex-col" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
