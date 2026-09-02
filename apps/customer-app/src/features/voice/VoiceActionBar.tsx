"use client";

import {
  CommandLineIcon,
  EllipsisHorizontalIcon,
  MicrophoneIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

import { BasketButton } from "@/features/commerce/BasketDrawer";
import { StoreMenuButton } from "@/features/commerce/MenuDrawer";
import { KeyboardInputPanel } from "@/components/keyboard-input-panel";
import { useVoiceStore } from "@/store/voice-store";
import { useCommerceStore } from "@/store/commerce-store";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useBusinessSlug } from "@/context/business-context";
import { AiLanguage } from "@/types/voice";

const DEFAULT_FOOTER_CLASS = "absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 flex justify-center z-10 pointer-events-auto pb-safe";

export function VoiceActionBar({ compact = false }: { compact?: boolean }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const businessSlug = useBusinessSlug();
  const { isTalking, startTalking, stopTalking, sendText } = useVoiceSession(businessSlug);
  const { language, setLanguage, status } = useVoiceStore();
  const { menuEnabled } = useCommerceStore();

  const handleStart = () => startTalking();
  const handleStop = () => stopTalking();
  
  const footerClass = DEFAULT_FOOTER_CLASS;
  const sideButtonClass = "inline-flex items-center justify-center rounded-full bg-slate-900/40 p-3 text-white backdrop-blur-md transition-all hover:bg-slate-800/60 disabled:opacity-50";
  const sideIconClass = compact ? "h-4 w-4" : "h-5 w-5";
  const controlsGridClass = compact
    ? "mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-end gap-x-4"
    : "mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-end gap-x-4 sm:gap-x-6";
  const sideClusterClass = compact
    ? "flex items-end justify-end gap-3"
    : "flex items-end justify-end gap-4 sm:gap-6";

  const isLive = status === "connected" || status === "connecting";

  return (
    <footer className={footerClass}>
      <div className="absolute bottom-8 right-6 z-10">
        <StoreMenuButton />
        <div className="mt-4" />
        <BasketButton />
      </div>

      <div className={controlsGridClass}>
        <div className="flex items-end gap-4 sm:gap-6">
          <button
            onClick={() => setKeyboardOpen(!keyboardOpen)}
            className={sideButtonClass}
            aria-label="Toggle keyboard"
          >
            <CommandLineIcon className={sideIconClass} />
          </button>
        </div>

        <div className="flex justify-center">
          <button
            onPointerDown={handleStart}
            onPointerUp={handleStop}
            onPointerLeave={handleStop}
            className={`relative z-10 inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-white transition-opacity ${
              isTalking ? "bg-red-500 scale-110" : "bg-brand-500 hover:bg-brand-400"
            }`}
          >
            {isTalking ? (
              <EllipsisHorizontalIcon className="h-7 w-7 animate-pulse" />
            ) : (
              <MicrophoneIcon className="h-7 w-7" />
            )}
          </button>
        </div>

        <div className={sideClusterClass}>
           <button
             onClick={() => setLanguage(language === "en" ? "id" : "en")}
             className={sideButtonClass}
           >
             {language.toUpperCase()}
           </button>
        </div>
      </div>
      
      {keyboardOpen && (
        <KeyboardInputPanel
          onSend={(text) => {
            sendText(text);
            setKeyboardOpen(false);
          }}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </footer>
  );
}
