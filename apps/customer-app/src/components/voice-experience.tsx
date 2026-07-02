"use client";

import { EvaHero } from "@/components/eva-hero";
import { MicPermissionBanner } from "@/components/mic-permission-banner";
import { BottomControls, ExperienceHeader } from "@/components/voice-controls";
import { TranscriptPanel } from "@/components/transcript-panel";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useSessionStore } from "@/store/session-store";

export function VoiceExperience() {
  const {
    status,
    isTalking,
    connect,
    disconnect,
    startTalking,
    stopTalking,
  } = useVoiceSession();

  const { error } = useSessionStore();
  const isLive = status === "connected" || status === "connecting";
  const canTalk = status !== "connecting";

  const handleStartTalking = () => {
    void startTalking();
  };

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-slate-100">
      <div className="absolute inset-0 bg-slate-100">
        <EvaHero isTalking={isTalking} />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[30rem]"
        aria-hidden
        style={{
          background:
            "linear-gradient(to top, rgb(241 245 249) 0%, rgb(241 245 249) 35%, rgba(241, 245, 249, 0) 55%, rgba(241, 245, 249, 0) 100%)",
        }}
      />

      <ExperienceHeader onDisconnect={disconnect} />

      <MicPermissionBanner />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[14%] z-30 flex items-end justify-start px-6 pb-[calc(2rem+4.5rem+1.5rem)]">
        <div className="pointer-events-auto flex max-h-full min-h-0 w-72 max-w-[calc(100vw-3rem)] flex-col">
          <TranscriptPanel />
        </div>
      </div>

      {!isLive ? (
        <div className="absolute inset-x-0 bottom-[9.5rem] z-20 flex flex-col items-center gap-3 px-6">
          <button
            type="button"
            onClick={() => {
              void connect();
            }}
            className="rounded-full bg-orange-500 px-8 py-3 text-sm font-bold text-white shadow-[0_4px_24px_rgba(249,115,22,0.4)] transition hover:bg-orange-600 hover:scale-[1.02] active:scale-[0.98]"
          >
            Order Now
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
        onStart={handleStartTalking}
        onStop={stopTalking}
      />
    </main>
  );
}
