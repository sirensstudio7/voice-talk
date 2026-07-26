"use client";

import { heroDemoUrl } from "@/lib/site-links";

export function HeroVoicePreview() {
  return (
    <iframe
      src={heroDemoUrl}
      title="Talk to Lorescale — ask about features, pricing, and how to get started"
      className="hero-voice-preview relative aspect-[9/16] w-full min-h-[28rem] overflow-hidden bg-slate-100 sm:aspect-[1140/774] sm:min-h-0"
      allow="microphone; autoplay"
    />
  );
}
