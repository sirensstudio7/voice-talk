"use client";

import { useParams } from "next/navigation";

import { BusinessProvider } from "@/context/business-context";
import { VoiceExperience } from "@/components/voice-experience";

export function BusinessVoicePage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "sunrise-coffee";

  return (
    <BusinessProvider slug={slug}>
      <VoiceExperience />
    </BusinessProvider>
  );
}
