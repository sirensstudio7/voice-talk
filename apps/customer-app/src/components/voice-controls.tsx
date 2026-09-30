"use client";

import {
  CommandLineIcon,
  EllipsisHorizontalIcon,
  HomeIcon,
  LockClosedIcon,
  MicrophoneIcon,
  PhoneXMarkIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { BasketButton } from "@/components/basket-panel";
import { KeyboardInputPanel } from "@/components/keyboard-input-panel";
import { DEFAULT_ASSISTANT_AVATAR, resolveMediaUrl } from "@/lib/menu-api";
import { deferEffectRun } from "@/lib/defer-effect-run";
import { useSessionStore } from "@/store/session-store";
import { StoreMenuButton } from "@/components/store-menu-panel";
import { AiLanguage } from "@/types/voice";
import { languageOption } from "@voicetalk/shared";

const statusLabel = {
  idle: "Ready",
  connecting: "Connecting…",
  connected: "Live",
  error: "Error",
  disconnected: "Offline",
} as const;

const statusDotColor = {
  idle: "bg-slate-400",
  connecting: "bg-amber-500",
  connected: "bg-green-500",
  error: "bg-red-500",
  disconnected: "bg-slate-400",
} as const;

const STATUS_ANIMATION_MS = 320;

function AnimatedStatusLabel({ label }: { label: string }) {
  const labelRef = useRef(label);
  const [current, setCurrent] = useState(label);
  const [previous, setPrevious] = useState<string | null>(null);
  const [canAnimate, setCanAnimate] = useState(false);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setCanAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (label === labelRef.current) return;

    if (!canAnimate) {
      labelRef.current = label;
      deferEffectRun(() => setCurrent(label));
      return;
    }

    setPrevious(labelRef.current);
    labelRef.current = label;
    setCurrent(label);

    const timer = window.setTimeout(() => setPrevious(null), STATUS_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [canAnimate, label]);

  return (
    <span
      className="header-status-track relative inline-block h-[17px] min-w-[3rem] overflow-hidden align-bottom"
      aria-live="polite"
    >
      {previous ? (
        <span className="header-status-label header-status-label--leave absolute inset-x-0 top-0">
          {previous}
        </span>
      ) : null}
      <span
        className={`header-status-label block ${
          previous && canAnimate ? "header-status-label--enter" : ""
        }`}
      >
        {current}
      </span>
    </span>
  );
}

interface ExperienceHeaderProps {
  onDisconnect: () => void;
  onLockKiosk?: () => void;
  orderingEnabled?: boolean;
  bookingEnabled?: boolean;
  compact?: boolean;
  position?: "absolute" | "relative";
}

export function LanguageToggle({
  value,
  onChange,
}: {
  value: AiLanguage;
  onChange: (language: AiLanguage) => void;
}) {
  const availableLanguages = useSessionStore((s) => s.availableLanguages);
  const options = availableLanguages.map(languageOption);
  const groupRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; width: number } | null>(
    null,
  );
  const [canAnimate, setCanAnimate] = useState(false);
  const compact = options.length > 3;

  const syncIndicator = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;

    const activeButton = group.querySelector<HTMLButtonElement>(
      `[data-lang="${value}"]`,
    );
    if (!activeButton) return;

    setIndicator({
      x: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
    });
  }, [value]);

  useLayoutEffect(() => {
    syncIndicator();
  }, [syncIndicator]);

  useLayoutEffect(() => {
    if (canAnimate) return;
    const frame = requestAnimationFrame(() => setCanAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [canAnimate]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(syncIndicator);
    observer.observe(group);
    return () => observer.disconnect();
  }, [syncIndicator]);

  if (compact) {
    return (
      <label className="relative inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 shadow-md">
        <span className="sr-only">AI language</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as AiLanguage)}
          className="max-w-[8.5rem] bg-transparent text-[11px] font-semibold text-slate-700 outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.short} · {option.nativeLabel}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div
      ref={groupRef}
      className="relative inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-md"
      role="group"
      aria-label="AI language"
    >
      {indicator ? (
        <span
          aria-hidden
          className={`language-toggle-pill absolute inset-y-0.5 left-0 rounded-full bg-orange-500 shadow-[0_1px_4px_rgba(249,115,22,0.45)] ${
            canAnimate ? "language-toggle-pill--animated" : ""
          }`}
          style={{
            width: indicator.width,
            transform: `translate3d(${indicator.x}px, 0, 0)`,
          }}
        />
      ) : null}
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            data-lang={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={`relative z-10 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200 ease-out ${
              selected
                ? "text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}

export function ExperienceHeader({
  onDisconnect,
  onLockKiosk,
  orderingEnabled = true,
  bookingEnabled = false,
  compact = false,
  position = "absolute",
}: ExperienceHeaderProps) {
  const { status, error, assistantName, avatarUrl, avatarCacheBust, conversationPhase } =
    useSessionStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLive = status === "connected" || status === "connecting";
  const resolvedAvatarUrl = avatarUrl ? resolveMediaUrl(avatarUrl) : "";
  const assistantAvatarSrc = resolvedAvatarUrl
    ? `${resolvedAvatarUrl}${resolvedAvatarUrl.includes("?") ? "&" : "?"}v=${avatarCacheBust || 0}`
    : DEFAULT_ASSISTANT_AVATAR;

  const statusDot =
    status === "connecting"
      ? `${statusDotColor[status]} animate-pulse`
      : conversationPhase === "wrapping_up"
        ? "bg-amber-500 animate-pulse"
        : statusDotColor[status];

  const liveStatusLabel =
    conversationPhase === "wrapping_up" ? "Ending…" : statusLabel[status];

  const iconButtonClass = compact
    ? "flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
    : "flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50";
  const headerIconClass = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <header
      className={`${
        position === "relative" ? "relative z-20" : "absolute inset-x-0 top-0 z-20"
      } flex items-center justify-between ${
        compact ? "px-3 pt-3" : "px-5 pt-5"
      } ${position === "relative" ? (compact ? "pb-2" : "pb-3") : ""}`}
    >
      <div className={`flex items-center ${compact ? "gap-1.5" : "gap-2.5"}`}>
        <button type="button" className={iconButtonClass} aria-label="Home">
          <HomeIcon className={headerIconClass} />
        </button>
      </div>

      <div className={`flex items-center ${compact ? "gap-1.5" : "gap-2.5"}`}>
        <div
          className={`flex items-center rounded-full border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.05)] ${
            compact ? "gap-1 py-0.5 pl-0.5 pr-1.5" : "gap-1.5 py-1 pl-1 pr-2"
          }`}
          aria-label={`AI ${
            orderingEnabled ? "Cashier" : bookingEnabled ? "Receptionist" : "Assistant"
          } ${assistantName}, ${liveStatusLabel}`}
        >
          <div
            className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 font-semibold text-slate-600 ${
              compact ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"
            }`}
          >
            {assistantAvatarSrc.startsWith("http") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={assistantAvatarSrc}
                src={assistantAvatarSrc}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover object-center"
                aria-hidden
              />
            ) : (
              <Image
                src={assistantAvatarSrc}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                className="h-full w-full object-cover object-center"
                aria-hidden
              />
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-white transition-colors duration-300 ease-out ${statusDot}`}
            />
          </div>
          <p
            className={`flex items-center gap-0.5 whitespace-nowrap pr-0.5 font-semibold leading-none text-slate-900 ${
              compact ? "text-[10px]" : "text-[11px]"
            }`}
          >
            {assistantName}
            <span className="font-normal text-slate-400">·</span>
            <span className="font-medium text-slate-600">
              <AnimatedStatusLabel label={liveStatusLabel} />
            </span>
          </p>
        </div>

        {orderingEnabled ? <BasketButton /> : null}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={iconButtonClass}
            aria-label="More options"
          >
            <EllipsisHorizontalIcon className={headerIconClass} />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              />
              <div className="absolute right-0 top-12 z-20 min-w-[180px] rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
                {isLive ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDisconnect();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    <PhoneXMarkIcon className="h-4 w-4" />
                    End session
                  </button>
                ) : null}
                {onLockKiosk ? (
                  <button
                    type="button"
                    onClick={() => {
                      onLockKiosk();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <LockClosedIcon className="h-4 w-4" />
                    Lock kiosk
                  </button>
                ) : null}
                {error ? (
                  <p className="border-t border-slate-100 px-4 py-2 text-xs font-medium text-red-600">
                    {error}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

interface BottomControlsProps {
  disabled: boolean;
  isTalking: boolean;
  onStart: () => void;
  onStop: () => void;
  onSendText?: (text: string) => void | Promise<void>;
  menuEnabled?: boolean;
  hideMic?: boolean;
  footerClassName?: string;
  compact?: boolean;
}

const DEFAULT_FOOTER_CLASS = "absolute inset-x-0 bottom-0 z-20 px-6 pb-8 pt-16";
const COMPACT_SIDE_BUTTON_CLASS =
  "relative z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.05)] transition hover:bg-slate-50";
const DEFAULT_SIDE_BUTTON_CLASS =
  "relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06),0_12px_28px_rgba(15,23,42,0.05)] transition hover:bg-slate-50";

export function BottomControls({
  disabled,
  isTalking,
  onStart,
  onStop,
  onSendText,
  menuEnabled = true,
  hideMic = false,
  footerClassName,
  compact = false,
}: BottomControlsProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const footerClass = footerClassName ?? DEFAULT_FOOTER_CLASS;
  const floatingChrome = footerClass.includes("absolute");
  const sideButtonClass = compact ? COMPACT_SIDE_BUTTON_CLASS : DEFAULT_SIDE_BUTTON_CLASS;
  const sideIconClass = compact ? "h-4 w-4" : "h-5 w-5";
  const controlsGridClass = compact
    ? "mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-end gap-x-4"
    : "mx-auto grid w-full max-w-lg grid-cols-[1fr_auto_1fr] items-end gap-x-4 sm:gap-x-6";
  const sideClusterClass = compact
    ? "flex items-end justify-end gap-3"
    : "flex items-end justify-end gap-4 sm:gap-6";

  if (hideMic) {
    return (
      <footer className={footerClass}>
        {menuEnabled ? (
          <div
            className={
              floatingChrome
                ? "absolute bottom-8 right-6 z-10"
                : "flex justify-end px-1 pb-1"
            }
          >
            <StoreMenuButton className={sideButtonClass} iconClassName={sideIconClass} />
          </div>
        ) : null}
      </footer>
    );
  }

  return (
    <>
      <footer className={footerClass}>
        <div className={controlsGridClass}>
          <div className={sideClusterClass}>
            <button
              type="button"
              className={sideButtonClass}
              aria-label="Keyboard input"
              aria-expanded={keyboardOpen}
              onClick={() => {
                if (onSendText) setKeyboardOpen(true);
              }}
            >
              <CommandLineIcon className={sideIconClass} />
            </button>
          </div>

          <TalkButton
            disabled={disabled}
            isTalking={isTalking}
            onStart={onStart}
            onStop={onStop}
            compact={compact}
          />

          <div
            className={
              compact
                ? "flex items-end justify-start gap-3"
                : "flex items-end justify-start gap-4 sm:gap-6"
            }
          >
            {menuEnabled ? (
              <StoreMenuButton className={sideButtonClass} iconClassName={sideIconClass} />
            ) : null}
          </div>
        </div>
      </footer>

      {onSendText ? (
        <KeyboardInputPanel
          open={keyboardOpen}
          onClose={() => setKeyboardOpen(false)}
          onSend={onSendText}
        />
      ) : null}
    </>
  );
}

interface TalkButtonProps {
  disabled: boolean;
  isTalking: boolean;
  onStart: () => void;
  onStop: () => void;
  compact?: boolean;
}

export function TalkButton({
  disabled,
  isTalking,
  onStart,
  onStop,
  compact = false,
}: TalkButtonProps) {
  const showHoldPulse = !disabled && !isTalking;
  const shellClass = compact
    ? "relative inline-flex h-11 w-11 items-center justify-center"
    : "relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center";
  const buttonClass = compact
    ? "relative z-10 inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition-opacity"
    : "relative z-10 inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-white transition-opacity";
  const micIconClass = compact ? "h-5 w-5" : "h-7 w-7";

  return (
    <div className={shellClass}>
      {showHoldPulse ? (
        <>
          <span className="mic-hold-pulse" aria-hidden />
          <span className="mic-hold-pulse mic-hold-pulse-delay" aria-hidden />
        </>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onMouseDown={onStart}
        onMouseUp={onStop}
        onMouseLeave={onStop}
        onTouchStart={(event) => {
          event.preventDefault();
          onStart();
        }}
        onTouchEnd={(event) => {
          event.preventDefault();
          onStop();
        }}
        className={`${buttonClass} ${
          disabled ? "cursor-not-allowed bg-slate-300 opacity-60" : "hover:opacity-90"
        }`}
        style={
          disabled
            ? undefined
            : {
                background: "rgb(249, 115, 22)",
                boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
              }
        }
        aria-label={isTalking ? "Release to stop talking" : "Hold to talk"}
      >
        <MicrophoneIcon className={micIconClass} />
      </button>
    </div>
  );
}
