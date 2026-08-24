"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ITEM_SIZE = 168;
const ITEM_GAP = 20;
const STRIDE = ITEM_SIZE + ITEM_GAP;
const VIEWPORT_H = ITEM_SIZE * 3 + ITEM_GAP * 2;
const CENTER_PAD = (VIEWPORT_H - ITEM_SIZE) / 2;
/** Enough copies so the strip can scroll for a long time. */
const LOOPS = 48;
/** Items per second while spinning (bottom → top). */
const SPIN_SPEED = 9;
const MIN_SPIN_MS = 2000;
const STOP_MS = 1400;
const WIN_ANIM_MS = 5000;
const SPIN_SOUND_SRC = "/sounds/lucky-spin-wheel.mp3";
const WIN_SOUND_SRC = "/sounds/lucky-spin-win.mp3";
const CONFETTI_SOUND_SRC = "/sounds/lucky-spin-confetti.mp3";
const CONFETTI_COLORS = [
  "#fb923c",
  "#fbbf24",
  "#34d399",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#ffffff",
  "#facc15",
];

function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${API_URL.replace(/\/$/, "")}${url}`;
  return url;
}

/** Higher index → strip translates up → items travel bottom → top. */
function offsetForPosition(position: number): number {
  return -(position * STRIDE) + CENTER_PAD;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export type LuckySpinPublicConfig = {
  active: boolean;
  enabled: boolean;
  ai_voice_enabled?: boolean;
  campaign: {
    id: string;
    name: string;
  } | null;
  prizes: Array<{
    id: string;
    name: string;
    image_url: string;
    probability: number;
  }>;
};

export type LuckySpinWinResult = {
  voucher_code: string;
  prize: {
    id: string;
    name: string;
    image_url: string;
    description: string;
  };
};

/** Anchored above the Lucky Spin mini 3D avatar (bottom-right). */
export const LUCKY_SPIN_WIN_CARD_FRAME_CLASS =
  "pointer-events-auto absolute right-6 z-[46] w-[min(17.5rem,calc(100vw-3rem))] bottom-[calc(1.5rem+min(78vh,520px)+0.75rem)] md:bottom-[calc(1.5rem+min(78vh,500px)+0.75rem)]";

/**
 * Win reveal as a tear-off redeem stub — matches the kiosk panel language
 * (white / slate) instead of a celebration banner.
 */
export function LuckySpinWinCard({
  result,
  className,
}: {
  result: LuckySpinWinResult;
  className?: string;
}) {
  return (
    <div
      className={[
        "lucky-spin-win-card relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center gap-3 px-3.5 pt-3.5">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
          {result.prize.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.prize.image_url}
              alt=""
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span className="text-xs font-semibold text-slate-400">
              {result.prize.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wide text-slate-500">
            You pulled
          </p>
          <p className="mt-0.5 truncate text-lg font-semibold leading-tight tracking-tight text-slate-900">
            {result.prize.name}
          </p>
        </div>
      </div>

      {/* Perforation */}
      <div
        className="relative mx-3.5 my-3 h-px"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle, rgb(148 163 184) 1px, transparent 1.5px)",
          backgroundSize: "8px 2px",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "center",
        }}
      >
        <span className="absolute -left-[1.15rem] top-1/2 size-3 -translate-y-1/2 rounded-full bg-slate-100 ring-1 ring-slate-200" />
        <span className="absolute -right-[1.15rem] top-1/2 size-3 -translate-y-1/2 rounded-full bg-slate-100 ring-1 ring-slate-200" />
      </div>

      <div className="px-3.5 pb-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.14em] text-slate-400 uppercase">
              Redeem code
            </p>
            <p className="mt-1 font-mono text-base font-semibold tracking-[0.14em] text-slate-900">
              {result.voucher_code}
            </p>
          </div>
          <span className="mb-0.5 shrink-0 text-[11px] font-medium text-orange-600">
            Show staff
          </span>
        </div>
      </div>
    </div>
  );
}

type PrizeItem = {
  id: string;
  name: string;
  image_url: string;
  probability: number;
};

export function shouldShowLuckySpin(
  config: LuckySpinPublicConfig | null | undefined,
): boolean {
  return Boolean(config?.active && config.enabled && config.campaign);
}

type LuckySpinWidgetProps = {
  businessSlug: string;
  config: LuckySpinPublicConfig;
  className?: string;
  onWin?: (result: LuckySpinWinResult) => void;
  /** Call synchronously from the Spin click so TTS can play. */
  onSpinStart?: () => void;
};

type ConfettiPiece = {
  id: string;
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  drift: number;
  rotate: number;
  round: boolean;
};

function WinConfetti({ burstKey }: { burstKey: number }) {
  const [mounted, setMounted] = useState(false);
  const pieces = useMemo<ConfettiPiece[]>(() => {
    return Array.from({ length: 100 }, (_, i) => ({
      id: `${burstKey}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.8 + Math.random() * 2.2,
      size: 8 + Math.random() * 10,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      drift: (Math.random() - 0.5) * 240,
      rotate: 360 + Math.random() * 720,
      round: Math.random() > 0.5,
    }));
  }, [burstKey]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
      aria-hidden
    >
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="lucky-spin-confetti-piece"
          style={
            {
              left: `${piece.left}%`,
              width: piece.round ? piece.size : Math.max(4, piece.size * 0.45),
              height: piece.size,
              borderRadius: piece.round ? "999px" : "2px",
              backgroundColor: piece.color,
              animationDuration: `${piece.duration}s`,
              animationDelay: `${piece.delay}s`,
              "--confetti-x": `${piece.drift}px`,
              "--confetti-rot": `${piece.rotate}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  );
}

function PrizeVisual({
  prize,
  focused,
  motion,
  celebrate,
  celebrateKey,
}: {
  prize: PrizeItem;
  focused: boolean;
  motion: "idle" | "spinning" | "stopping";
  celebrate?: boolean;
  celebrateKey?: number;
}) {
  const tone =
    motion !== "idle"
      ? "scale-100 opacity-90"
      : focused
        ? "scale-100 opacity-100"
        : "scale-[0.72] opacity-40 blur-[1.5px]";

  return (
    <div
      className={[
        "relative flex size-[168px] items-center justify-center bg-transparent",
        celebrate ? "" : "transition-all duration-300",
        tone,
      ].join(" ")}
    >
      {prize.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={celebrate ? `win-${celebrateKey}` : `idle-${prize.id}`}
          src={prize.image_url}
          alt={prize.name}
          className={[
            "bg-transparent object-contain",
            focused && motion === "idle" ? "h-[92%] w-[92%]" : "h-[78%] w-[78%]",
            celebrate ? "lucky-spin-win-pop" : "",
          ].join(" ")}
          style={
            celebrate
              ? {
                  animationName: "lucky-spin-win-pop",
                  animationDuration: "5s",
                  animationTimingFunction: "linear",
                  animationFillMode: "both",
                  transformOrigin: "center center",
                }
              : undefined
          }
          draggable={false}
        />
      ) : (
        <span
          key={celebrate ? `win-text-${celebrateKey}` : `idle-text-${prize.id}`}
          className={[
            "text-sm font-semibold text-white",
            celebrate ? "lucky-spin-win-pop inline-block" : "",
          ].join(" ")}
          style={
            celebrate
              ? {
                  animationName: "lucky-spin-win-pop",
                  animationDuration: "5s",
                  animationTimingFunction: "linear",
                  animationFillMode: "both",
                  transformOrigin: "center center",
                }
              : undefined
          }
        >
          {prize.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function LuckySpinWidget({
  businessSlug,
  config,
  className,
  onWin,
  onSpinStart,
}: LuckySpinWidgetProps) {
  const [motion, setMotion] = useState<"idle" | "spinning" | "stopping">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LuckySpinWinResult | null>(null);
  const [position, setPosition] = useState(0);
  const [offsetY, setOffsetY] = useState(() => offsetForPosition(0));
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [celebrating, setCelebrating] = useState(false);

  const positionRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const confettiAudioRef = useRef<HTMLAudioElement | null>(null);
  const busy = motion !== "idle";

  function ensureSpinAudio() {
    if (typeof window === "undefined") return null;
    if (!spinAudioRef.current) {
      const audio = new Audio(SPIN_SOUND_SRC);
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.85;
      spinAudioRef.current = audio;
    }
    return spinAudioRef.current;
  }

  function ensureWinAudio() {
    if (typeof window === "undefined") return null;
    if (!winAudioRef.current) {
      const audio = new Audio(WIN_SOUND_SRC);
      audio.preload = "auto";
      audio.volume = 0.9;
      winAudioRef.current = audio;
    }
    return winAudioRef.current;
  }

  function ensureConfettiAudio() {
    if (typeof window === "undefined") return null;
    if (!confettiAudioRef.current) {
      const audio = new Audio(CONFETTI_SOUND_SRC);
      audio.preload = "auto";
      audio.volume = 0.85;
      confettiAudioRef.current = audio;
    }
    return confettiAudioRef.current;
  }

  function playOneShot(audio: HTMLAudioElement | null) {
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // ignore autoplay failures
      });
    } catch {
      // ignore
    }
  }

  function startSpinSound() {
    const audio = ensureSpinAudio();
    if (!audio) return;
    try {
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Autoplay may be blocked until a user gesture; Spin click usually unlocks it.
      });
    } catch {
      // ignore playback errors
    }
  }

  function stopSpinSound() {
    const audio = spinAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
  }

  function playWinSound() {
    playOneShot(ensureWinAudio());
  }

  function playConfettiSound() {
    playOneShot(ensureConfettiAudio());
  }

  const prizes = useMemo<PrizeItem[]>(() => {
    const list = config.prizes.length
      ? config.prizes
      : [{ id: "empty", name: "Prize", image_url: "", probability: 100 }];
    return list.map((prize) => ({
      ...prize,
      image_url: resolveAssetUrl(prize.image_url),
    }));
  }, [config.prizes]);

  const strip = useMemo(() => {
    const items: PrizeItem[] = [];
    for (let loop = 0; loop < LOOPS; loop += 1) {
      for (const prize of prizes) items.push(prize);
    }
    return items;
  }, [prizes]);

  function applyPosition(next: number) {
    positionRef.current = next;
    setPosition(next);
    setOffsetY(offsetForPosition(next));
  }

  function stopRaf() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  /** Continuous bottom→top scroll. Optionally wrap within the strip. */
  function startLoopSpin() {
    stopRaf();
    let last = performance.now();
    const cycle = Math.max(prizes.length, 1);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let next = positionRef.current + SPIN_SPEED * dt;

      // Wrap early in the strip so we never run out of items while looping.
      const wrapAt = cycle * (LOOPS - 8);
      if (next > wrapAt) {
        next = cycle * 2 + (next % cycle);
      }

      applyPosition(next);
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
  }

  function easeOutCubic(t: number) {
    return 1 - (1 - t) ** 3;
  }

  function animateTo(target: number, durationMs: number) {
    stopRaf();
    const from = positionRef.current;
    const start = performance.now();

    return new Promise<void>((resolve) => {
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        applyPosition(from + (target - from) * easeOutCubic(t));
        if (t < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          rafRef.current = null;
          applyPosition(target);
          resolve();
        }
      };
      rafRef.current = requestAnimationFrame(frame);
    });
  }

  useEffect(() => {
    return () => {
      stopRaf();
      stopSpinSound();
      spinAudioRef.current = null;
      if (winAudioRef.current) {
        winAudioRef.current.pause();
        winAudioRef.current = null;
      }
      if (confettiAudioRef.current) {
        confettiAudioRef.current.pause();
        confettiAudioRef.current = null;
      }
    };
  }, []);

  async function onSpin() {
    if (busy || celebrating || prizes.length === 0) return;
    onSpinStart?.();
    setError(null);
    setResult(null);
    setCelebrating(false);
    setMotion("spinning");
    ensureWinAudio();
    ensureConfettiAudio();
    startSpinSound();
    startLoopSpin(); // instant continuous bottom → top loop

    try {
      const [response] = await Promise.all([
        fetch(`${API_URL}/public/lucky-spin/${encodeURIComponent(businessSlug)}/spin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        sleep(MIN_SPIN_MS),
      ]);
      const data = (await response.json()) as { detail?: string } & LuckySpinWinResult;
      if (!response.ok) {
        throw new Error(data.detail || "Spin failed");
      }

      const prizeIndex = Math.max(
        0,
        prizes.findIndex((prize) => prize.id === data.prize.id),
      );
      const cycle = prizes.length;
      const current = positionRef.current;

      // Next time this prize passes the center, plus a couple full loops, then ease stop.
      let target = Math.floor(current) + 1;
      while (target % cycle !== prizeIndex) target += 1;
      target += cycle * 2;

      setMotion("stopping");
      await animateTo(target, STOP_MS);
      stopSpinSound();
      playWinSound();
      playConfettiSound();

      // Stay on the landed index while celebrating — don't snap away mid-animation.
      const winResult: LuckySpinWinResult = {
        ...data,
        prize: {
          ...data.prize,
          image_url: resolveAssetUrl(data.prize.image_url),
        },
      };
      setResult(winResult);
      setCelebrateKey((key) => key + 1);
      setCelebrating(true);
      setMotion("idle");
      onWin?.(winResult);

      await sleep(WIN_ANIM_MS);
      setCelebrating(false);

      // Quiet wrap after the full win animation finishes.
      const quiet = cycle * 2 + prizeIndex;
      applyPosition(quiet);
    } catch (err) {
      stopRaf();
      stopSpinSound();
      setCelebrating(false);
      setMotion("idle");
      setError(err instanceof Error ? err.message : "Spin failed");
    }
  }

  const focusedIndex = Math.round(position);

  return (
    <div
      className={[
        "pointer-events-auto flex w-[min(90vw,24rem)] flex-col items-center text-white",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {celebrating ? <WinConfetti burstKey={celebrateKey} /> : null}

      <div
        className="relative w-full overflow-hidden bg-transparent"
        style={{ height: VIEWPORT_H }}
      >
        <div
          className="absolute inset-x-0 top-0 flex flex-col items-center bg-transparent will-change-transform"
          style={{
            transform: `translate3d(0, ${offsetY}px, 0)`,
            gap: ITEM_GAP,
          }}
        >
          {strip.map((prize, index) => {
            const focused = motion === "idle" && index === focusedIndex;
            const celebrate = Boolean(celebrating && focused);
            return (
              <div
                key={`${prize.id}-${index}`}
                className="flex shrink-0 items-center justify-center"
                style={{ height: ITEM_SIZE, width: ITEM_SIZE }}
              >
                <PrizeVisual
                  prize={prize}
                  focused={focused}
                  motion={motion}
                  celebrate={celebrate}
                  celebrateKey={celebrateKey}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex w-full flex-col items-center gap-3">
        <button
          type="button"
          disabled={busy || celebrating}
          onClick={() => void onSpin()}
          className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/15 px-7 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowPathIcon
            className={["size-4", busy ? "animate-spin" : ""].join(" ")}
            aria-hidden
          />
          {busy ? "Spinning…" : result ? "Spin Again" : "Spin"}
        </button>

        {error ? (
          <p className="rounded-full bg-red-500/80 px-3 py-1 text-center text-xs font-medium text-white">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Bottom-right mini avatar frame when Lucky Spin is on (landscape). */
export const LUCKY_SPIN_MINI_HERO_FRAME_CLASS =
  "absolute bottom-6 right-6 aspect-[2/3] h-[min(78vh,520px)] w-auto max-w-[min(62vw,480px)] origin-bottom-right overflow-visible transition-all duration-300 ease-out md:h-[min(78vh,500px)]";
