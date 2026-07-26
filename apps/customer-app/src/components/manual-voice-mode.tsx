"use client";

import { BottomControls } from "@/components/voice-controls";

type ManualVoiceModeProps = {
  error: string | null;
  orderingEnabled: boolean;
  bookingEnabled: boolean;
  menuEnabled: boolean;
  canTalk: boolean;
  isTalking: boolean;
  showStartButton?: boolean;
  onStartConversation: () => void;
  onStartTalking: () => void;
  onStopTalking: () => void;
};

export function ManualVoiceMode({
  error,
  orderingEnabled,
  bookingEnabled,
  menuEnabled,
  canTalk,
  isTalking,
  showStartButton = true,
  onStartConversation,
  onStartTalking,
  onStopTalking,
}: ManualVoiceModeProps) {
  const ctaLabel = orderingEnabled
    ? "Order Now"
    : bookingEnabled
      ? "Book appointment"
      : "Start conversation";

  return (
    <>
      {showStartButton ? (
        <div className="absolute inset-x-0 bottom-[9.5rem] z-20 flex flex-col items-center gap-3 px-6">
          <button
            type="button"
            onClick={onStartConversation}
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
            style={{
              background: "rgb(249, 115, 22)",
              boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
            }}
          >
            {ctaLabel}
          </button>
          {error ? (
            <p className="max-w-sm rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <BottomControls
        disabled={!canTalk}
        isTalking={isTalking}
        onStart={onStartTalking}
        onStop={onStopTalking}
        menuEnabled={menuEnabled}
      />
    </>
  );
}
