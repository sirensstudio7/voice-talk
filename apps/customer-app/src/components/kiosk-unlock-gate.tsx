"use client";

import { ArrowLeftIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  getKioskSlugFromLocation,
  getStoredKioskToken,
  KioskAccessError,
  unlockKioskDisplay,
} from "@/lib/kiosk-access";

import { deferEffectRun } from "@/lib/defer-effect-run";
import { useIsClient } from "@/lib/use-is-client";
const PIN_LENGTH = 6;

function displayLabel(slug: string) {
  if (!slug || slug === "default") return "Main display";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function businessLabel(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function leaveUnlockScreen(businessSlug: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.has("kiosk")) {
    url.searchParams.delete("kiosk");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.location.assign(next);
    return;
  }
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.assign(`/${businessSlug}`);
}

function normalizePinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

export function KioskUnlockGate({
  businessSlug,
  children,
}: {
  businessSlug: string;
  children: ReactNode;
}) {
  const kioskSlug = getKioskSlugFromLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const isClient = useIsClient();
  const [unlockedBySubmit, setUnlockedBySubmit] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  const displayName = displayLabel(kioskSlug);
  const businessName = businessLabel(businessSlug);
  const unlocked =
    unlockedBySubmit || (isClient && Boolean(getStoredKioskToken(businessSlug, kioskSlug)));

  useEffect(() => {
    if (!isClient || unlocked) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [isClient, unlocked]);

  async function submit(nextPin = pin) {
    if (nextPin.length !== PIN_LENGTH || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await unlockKioskDisplay({ businessSlug, kioskSlug, pin: nextPin });
      setUnlockedBySubmit(true);
    } catch (err) {
      if (err instanceof KioskAccessError && err.status === 409) {
        setError(
          "This display is already unlocked elsewhere. On the tablet, open ⋮ and choose Lock kiosk. In Admin, open Kiosks and tap End session on this display.",
        );
      } else {
        setError(err instanceof Error ? err.message : "That PIN didn’t work. Try again.");
      }
      setPin("");
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      inputRef.current?.focus({ preventScroll: true });
    } finally {
      setSubmitting(false);
    }
  }

  function updatePin(next: string) {
    if (submitting) return;
    setError(null);
    setPin(normalizePinInput(next));
  }

  function onPinKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      event.key === "Backspace" ||
      event.key === "Delete" ||
      event.key === "Tab" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "Home" ||
      event.key === "End" ||
      event.key === "Enter"
    ) {
      return;
    }
    if (event.key.length === 1 && !/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  function onPinPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    updatePin(event.clipboardData.getData("text"));
  }

  useEffect(() => {
    if (submitting || error || pin.length !== PIN_LENGTH) return;
    deferEffectRun(() => void submit(pin));
    // submit is recreated each render and reads the latest pin/business/kiosk values;
    // the guards keep this effect from re-submitting after a completed attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, submitting, error]);

  if (!isClient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
      </div>
    );
  }

  if (unlocked) return children;

  const activeIndex = Math.min(pin.length, PIN_LENGTH - 1);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4 py-10">
      <div className="relative w-full max-w-[420px] rounded-2xl border border-neutral-200/80 bg-white px-6 pb-8 pt-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:px-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => leaveUnlockScreen(businessSlug)}
            aria-label="Go back"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
          >
            <ArrowLeftIcon className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => leaveUnlockScreen(businessSlug)}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex min-h-[7.5rem] w-full items-center justify-center px-2">
            <Image
              src="/lorescale-logo.png"
              alt="Lorescale"
              width={320}
              height={96}
              priority
              className="h-24 w-auto max-w-[18rem] object-contain sm:h-28 sm:max-w-[20rem]"
            />
          </div>

          <h1 className="text-[1.35rem] font-semibold tracking-tight text-neutral-900">
            Enter staff PIN
          </h1>
          <p className="mt-3 max-w-[19rem] text-[0.9375rem] leading-relaxed text-neutral-500">
            Enter the PIN your team set for{" "}
            <span className="font-semibold text-neutral-800">{displayName}</span> at{" "}
            <span className="font-semibold text-neutral-800">{businessName}</span>.
          </p>

          <form
            className="mt-8 w-full"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              id="kiosk-staff-pin"
              ref={inputRef}
              type="tel"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              enterKeyHint="done"
              maxLength={PIN_LENGTH}
              value={pin}
              disabled={submitting}
              onChange={(event) => updatePin(event.target.value)}
              onKeyDown={onPinKeyDown}
              onPaste={onPinPaste}
              className="sr-only"
              aria-label="Staff PIN"
            />

            <label
              htmlFor="kiosk-staff-pin"
              onClick={() => inputRef.current?.focus({ preventScroll: true })}
              className={`flex cursor-text justify-center gap-2 sm:gap-2.5 ${shake ? "pin-shake" : ""}`}
            >
              {Array.from({ length: PIN_LENGTH }).map((_, index) => {
                const digit = pin[index] ?? "";
                const isActive = index === activeIndex && !submitting;
                return (
                  <div
                    key={index}
                    aria-hidden
                    className={`flex h-12 w-11 items-center justify-center rounded-xl border text-xl font-semibold tabular-nums text-neutral-900 transition sm:h-[3.25rem] sm:w-12 ${
                      error
                        ? "border-rose-200 bg-rose-50/40"
                        : isActive
                          ? "border-violet-300 bg-white ring-2 ring-violet-100"
                          : digit
                            ? "border-neutral-200 bg-white"
                            : "border-neutral-200 bg-[#fcfcfc]"
                    }`}
                  >
                    {digit}
                  </div>
                );
              })}
            </label>

            {error ? (
              <p className="mt-4 text-sm text-rose-600" role="alert">
                {error}
              </p>
            ) : submitting ? (
              <p className="mt-4 text-sm text-neutral-400">Verifying…</p>
            ) : (
              <p className="mt-4 text-sm text-neutral-400">6-digit PIN</p>
            )}
          </form>

          <p className="mt-8 text-sm text-neutral-500">
            Not this display?{" "}
            <button
              type="button"
              onClick={() => leaveUnlockScreen(businessSlug)}
              className="font-medium text-[#6366f1] hover:text-[#4f46e5]"
            >
              Go back
            </button>
          </p>
        </div>

        <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-neutral-400">
          Protected by
          <span className="font-semibold tracking-tight text-neutral-500">Lorescale</span>
        </p>
      </div>
    </div>
  );
}
