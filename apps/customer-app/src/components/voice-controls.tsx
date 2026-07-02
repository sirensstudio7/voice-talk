"use client";

import {
  ChevronDown,
  Home,
  Keyboard,
  Mic,
  MoreHorizontal,
  PhoneOff,
  Share,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { useSessionStore } from "@/store/session-store";
import { StoreMenuButton } from "@/components/store-menu-panel";

const statusLabel = {
  idle: "Ready",
  connecting: "Connecting…",
  connected: "Live",
  error: "Error",
  disconnected: "Offline",
} as const;

interface ExperienceHeaderProps {
  onDisconnect: () => void;
}

export function ExperienceHeader({ onDisconnect }: ExperienceHeaderProps) {
  const { status, error } = useSessionStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLive = status === "connected" || status === "connecting";

  const statusDot =
    status === "connected"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : status === "connecting"
          ? "bg-amber-500 animate-pulse"
          : "bg-slate-400";

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-5">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-4 shadow-md">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-100">
            <Image
              src="/eva-cashier-nobg.png"
              alt="Eva"
              width={36}
              height={36}
              className="h-full w-full object-cover object-top"
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${statusDot}`}
            />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold leading-tight text-slate-900">
              AI Cashier
            </p>
            <p className="flex items-center gap-0.5 text-[11px] font-medium text-slate-600">
              Eva · {statusLabel[status]}
              <ChevronDown className="h-3 w-3" />
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
            aria-label="More options"
          >
            <MoreHorizontal className="h-4 w-4" />
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
                    <PhoneOff className="h-4 w-4" />
                    End session
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
}

export function BottomControls({
  disabled,
  isTalking,
  onStart,
  onStop,
}: BottomControlsProps) {
  return (
    <footer className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-center gap-6 px-6 pb-8 pt-16">
      <StoreMenuButton />

      <button
        type="button"
        className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
        aria-label="Keyboard input"
      >
        <Keyboard className="h-5 w-5" />
      </button>

      <TalkButton
        disabled={disabled}
        isTalking={isTalking}
        onStart={onStart}
        onStop={onStop}
      />

      <button
        type="button"
        className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
        aria-label="Share"
      >
        <Share className="h-5 w-5" />
      </button>
    </footer>
  );
}

interface TalkButtonProps {
  disabled: boolean;
  isTalking: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function TalkButton({
  disabled,
  isTalking,
  onStart,
  onStop,
}: TalkButtonProps) {
  const showHoldPulse = !disabled && !isTalking;

  return (
    <div className="relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center">
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
        className={`relative z-10 inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-white transition-all ${
          disabled
            ? "cursor-not-allowed bg-slate-300 opacity-60"
            : isTalking
              ? "mic-glow mic-glow-active scale-105"
              : "mic-glow hover:scale-105 active:scale-95"
        }`}
        aria-label={isTalking ? "Release to stop talking" : "Hold to talk"}
      >
        <Mic className="h-7 w-7" />
      </button>
    </div>
  );
}
