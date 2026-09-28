"use client";

import { useParams, useSearchParams } from "next/navigation";

import { BusinessProvider } from "@/context/business-context";
import { KioskUnlockGate } from "@/components/kiosk-unlock-gate";
import { VoiceExperience } from "@/components/voice-experience";
import { isHeroEmbedSearchParam } from "@/lib/display-orientation";

export function BusinessVoicePage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params.slug === "string" ? params.slug : "sunrise-coffee";
  const search = searchParams.toString();
  const isHeroEmbed = isHeroEmbedSearchParam(search ? `?${search}` : "");

  return (
    <BusinessProvider slug={slug}>
      {isHeroEmbed ? (
        <VoiceExperience />
      ) : (
        <KioskUnlockGate businessSlug={slug}>
          <VoiceExperience />
        </KioskUnlockGate>
      )}
    </BusinessProvider>
  );
}
