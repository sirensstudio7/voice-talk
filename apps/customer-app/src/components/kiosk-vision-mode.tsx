"use client";

import { KioskVisionBar } from "@/components/kiosk-vision-bar";
import type { KioskPhase } from "@/types/kiosk";

type KioskVisionModeProps = {
  businessSlug: string;
  kioskPhase: KioskPhase;
};

export function KioskVisionMode({ businessSlug, kioskPhase }: KioskVisionModeProps) {
  return <KioskVisionBar businessSlug={businessSlug} kioskPhase={kioskPhase} />;
}
