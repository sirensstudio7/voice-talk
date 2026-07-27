"use client";

import { useLayoutEffect, useState } from "react";

import { HeroLorescaleAvatar } from "@/components/landing/hero-lorescale-avatar";
import { heroDemoUrl } from "@/lib/site-links";

const PREVIEW_CLASS =
  "hero-voice-preview relative aspect-[9/16] w-full overflow-hidden bg-slate-100 sm:aspect-[1140/774]";

/** Match Tailwind sm: — desktop hero frame is landscape, mobile is portrait. */
const DESKTOP_FRAME_MEDIA = "(min-width: 640px)";

function buildHeroDemoUrl(isDesktopFrame: boolean): string {
  const frame = isDesktopFrame ? "landscape" : "portrait";
  return `${heroDemoUrl}&frame=${frame}`;
}

export function HeroVoicePreview() {
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [iframeFailed, setIframeFailed] = useState(false);

  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_FRAME_MEDIA);
    const update = () => setIframeSrc(buildHeroDemoUrl(mediaQuery.matches));
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  if (iframeFailed) {
    return (
      <div className={PREVIEW_CLASS}>
        <HeroLorescaleAvatar />
      </div>
    );
  }

  if (!iframeSrc) {
    return <div className={PREVIEW_CLASS} aria-hidden />;
  }

  return (
    <iframe
      src={iframeSrc}
      title="Talk to Lorescale — ask about features, pricing, and how to get started"
      className={PREVIEW_CLASS}
      allow="microphone; autoplay"
      onError={() => setIframeFailed(true)}
      style={{ touchAction: "manipulation" }}
    />
  );
}
