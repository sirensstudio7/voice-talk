"use client";

import { ExperienceBackground } from "@/components/ExperienceBackground";
import { AvatarViewport } from "@/features/avatar/AvatarViewport";
import { TranscriptFeed } from "@/features/voice/TranscriptFeed";
import { VoiceActionBar } from "@/features/voice/VoiceActionBar";
import { MenuDrawer } from "@/features/commerce/MenuDrawer";
import { BasketDrawer } from "@/features/commerce/BasketDrawer";
import { PaymentModal } from "@/features/commerce/PaymentModal";
import { FlyToBasket } from "@/features/commerce/FlyToBasket";
import { AppointmentDrawer } from "@/features/booking/AppointmentDrawer";
import { PhotoMomentOverlay } from "@/features/photo/PhotoMomentOverlay";
import { MicPermissionBanner } from "@/components/MicPermissionBanner";

export function VoiceStage() {
  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col bg-black">
      <ExperienceBackground />
      <AvatarViewport />
      
      <div className="absolute inset-0 flex flex-col pointer-events-none z-10 p-4">
        <div className="flex-1 min-h-0 relative pointer-events-auto">
          <TranscriptFeed />
        </div>
        
        <div className="flex-shrink-0 mt-4 pointer-events-auto">
          <VoiceActionBar />
        </div>
      </div>

      <MenuDrawer />
      <BasketDrawer />
      <PaymentModal />
      <FlyToBasket />
      <AppointmentDrawer />
      <PhotoMomentOverlay />
      <MicPermissionBanner />
    </div>
  );
}
