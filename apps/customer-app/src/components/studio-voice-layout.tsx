"use client";

import {
  CommandLineIcon,
  PaperAirplaneIcon,
  PhoneXMarkIcon,
} from "@heroicons/react/24/outline";
import { useMemo, useState, type ReactNode } from "react";

import { ExperienceBackground } from "@/components/experience-background";
import { LorescaleHero } from "@/components/lorescale-hero";
import { TranscriptPanel } from "@/components/transcript-panel";
import { LanguageToggle, TalkButton } from "@/components/voice-controls";
import { KeyboardInputPanel } from "@/components/keyboard-input-panel";
import { StoreMenuButton } from "@/components/store-menu-panel";
import { useBusinessSlug } from "@/context/business-context";
import { buildBottomGradient } from "@/lib/gradient-style";
import { getStudioSuggestionChips } from "@/lib/transcript-placeholder";
import { useSessionStore } from "@/store/session-store";
import type { AvatarMode } from "@voicetalk/avatar";
import type { AiLanguage } from "@/types/voice";

const STUDIO_HERO_FRAME_CLASS =
  "relative mx-auto aspect-[2/3] h-[118%] max-h-none w-auto origin-bottom overflow-visible";

const SIDE_BUTTON_CLASS =
  "flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/95 text-slate-700 shadow-md transition hover:bg-white";

type StudioVoiceLayoutProps = {
  isLandscape: boolean;
  compact?: boolean;
  backgroundUrl: string;
  gradientColor: string;
  header: ReactNode;
  isTalking: boolean;
  avatarMode: AvatarMode;
  mouthOpen: number;
  isLive: boolean;
  showMic: boolean;
  canTalk: boolean;
  menuEnabled: boolean;
  onStartTalking: () => void;
  onStopTalking: () => void;
  onDisconnect: () => void;
  onSendText: (text: string) => void;
  onLanguageChange: (language: AiLanguage) => void;
  statusSlot?: ReactNode;
  overlaySlot?: ReactNode;
  errorBanner?: ReactNode;
};

function assistantRoleLabel(orderingEnabled: boolean, bookingEnabled: boolean) {
  if (orderingEnabled) return "AI Cashier";
  if (bookingEnabled) return "AI Receptionist";
  return "AI Assistant";
}

function StudioComposer({
  onSendText,
  disabled,
}: {
  onSendText: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSendText(trimmed);
    setValue("");
  };

  return (
    <>
      <form
        className="flex shrink-0 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          aria-label="On-screen keyboard"
          aria-expanded={keyboardOpen}
          disabled={disabled}
          onClick={() => setKeyboardOpen(true)}
        >
          <CommandLineIcon className="h-5 w-5" />
        </button>
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Type a message…"
          className="h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>
      </form>
      <KeyboardInputPanel
        open={keyboardOpen}
        onClose={() => setKeyboardOpen(false)}
        onSend={onSendText}
        disabled={disabled}
      />
    </>
  );
}

export function StudioVoiceLayout({
  isLandscape,
  compact = false,
  backgroundUrl,
  gradientColor,
  header,
  isTalking,
  avatarMode,
  mouthOpen,
  isLive,
  showMic,
  canTalk,
  menuEnabled,
  onStartTalking,
  onStopTalking,
  onDisconnect,
  onSendText,
  onLanguageChange,
  statusSlot,
  overlaySlot,
  errorBanner,
}: StudioVoiceLayoutProps) {
  const businessSlug = useBusinessSlug();
  const {
    assistantName,
    language,
    orderingEnabled,
    bookingEnabled,
    faqMode,
    menuCache,
    menuCacheSlug,
    conversationPhase,
  } = useSessionStore();
  const name = assistantName || "Assistant";
  const roleLabel = assistantRoleLabel(orderingEnabled, bookingEnabled);
  const composerDisabled = conversationPhase === "wrapping_up";
  const chips = useMemo(
    () =>
      getStudioSuggestionChips({
        language,
        orderingEnabled,
        bookingEnabled,
        faqMode,
        businessType: menuCacheSlug === businessSlug ? menuCache?.business_type : undefined,
      }),
    [
      bookingEnabled,
      businessSlug,
      faqMode,
      language,
      menuCache?.business_type,
      menuCacheSlug,
      orderingEnabled,
    ],
  );

  const avatarStage = (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-[1.75rem] bg-slate-200 shadow-[0_8px_32px_rgba(15,23,42,0.08)]">
      <ExperienceBackground backgroundUrl={backgroundUrl} />
      <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center overflow-hidden">
        <LorescaleHero
          isTalking={isTalking}
          mode={avatarMode}
          mouthOpen={mouthOpen}
          frameClassName={STUDIO_HERO_FRAME_CLASS}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[38%]"
        aria-hidden
        style={{ background: buildBottomGradient(gradientColor) }}
      />

      {isLive ? (
        <div className="absolute left-3 top-3 z-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            Live
          </span>
        </div>
      ) : null}

      {errorBanner ? <div className="absolute inset-x-3 top-12 z-30">{errorBanner}</div> : null}
      {overlaySlot}
      {statusSlot ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-24 z-30 flex flex-col items-center gap-2 [&_button]:pointer-events-auto">
          {statusSlot}
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-3 px-4">
        {menuEnabled ? (
          <StoreMenuButton
            className={SIDE_BUTTON_CLASS}
            iconClassName="h-5 w-5"
          />
        ) : null}
        {showMic ? (
          <TalkButton
            disabled={!canTalk}
            isTalking={isTalking}
            onStart={onStartTalking}
            onStop={onStopTalking}
            compact={compact || !isLandscape}
          />
        ) : null}
        {isLive ? (
          <button
            type="button"
            onClick={onDisconnect}
            className={SIDE_BUTTON_CLASS}
            aria-label="End session"
          >
            <PhoneXMarkIcon className="h-5 w-5 text-red-600" />
          </button>
        ) : null}
      </div>
    </div>
  );

  const chatColumn = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_8px_32px_rgba(15,23,42,0.06)] sm:px-5">
      <div className="flex shrink-0 items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-tight text-slate-900">{name}</p>
          <p className="text-sm text-slate-500">{roleLabel}</p>
        </div>
        <LanguageToggle value={language} onChange={onLanguageChange} />
      </div>

      <div className="min-h-0 flex-1">
        <TranscriptPanel onLanguageChange={onLanguageChange} variant="studio" />
      </div>

      {chips.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-2 pb-3 pt-2">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={composerDisabled}
              onClick={() => onSendText(chip.text)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="h-2 shrink-0" />
      )}

      <StudioComposer onSendText={onSendText} disabled={composerDisabled} />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-slate-100">
      {header}
      <div
        className={`flex min-h-0 flex-1 gap-3 px-3 pb-3 ${
          isLandscape ? "flex-col lg:flex-row" : "flex-col"
        }`}
      >
        <div
          className={
            isLandscape
              ? "flex h-[42%] min-h-0 min-w-0 lg:h-auto lg:flex-[1.15]"
              : "flex h-[42%] min-h-0"
          }
        >
          {avatarStage}
        </div>
        <div
          className={
            isLandscape
              ? "flex min-h-0 min-w-0 flex-1 lg:w-[min(100%,26rem)] lg:flex-none"
              : "flex min-h-0 flex-1"
          }
        >
          {chatColumn}
        </div>
      </div>
    </div>
  );
}
