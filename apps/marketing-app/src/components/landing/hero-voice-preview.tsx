"use client";

import { useState } from "react";

import { HeroLorescaleAvatar } from "@/components/landing/hero-lorescale-avatar";
import { heroDemoUrl } from "@/lib/site-links";

const PREVIEW_CLASS =
  "hero-voice-preview relative aspect-[9/16] w-full overflow-hidden bg-slate-100 sm:aspect-[1140/774]";

export function HeroVoicePreview() {
  const [iframeFailed, setIframeFailed] = useState(false);

  if (iframeFailed) {
    return (
      <div className={PREVIEW_CLASS}>
        <HeroLorescaleAvatar />
      </div>
    );
  }

  return (
    <iframe
      src={heroDemoUrl}
      title="Talk to Lorescale — ask about features, pricing, and how to get started"
      className={PREVIEW_CLASS}
      allow="microphone; autoplay"
      onError={() => setIframeFailed(true)}
    />
  );
}
