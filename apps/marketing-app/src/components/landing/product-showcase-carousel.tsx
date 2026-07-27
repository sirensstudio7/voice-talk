"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

import {
  BrowserChrome,
  PRODUCT_SHOWCASE_SLIDES,
} from "@/components/landing/product-showcase-mockups";

const AUTOPLAY_MS = 5500;
const PROGRESS_RING_SIZE = 40;
const PROGRESS_RING_STROKE = 3;
const PROGRESS_RING_RADIUS = (PROGRESS_RING_SIZE - PROGRESS_RING_STROKE) / 2;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

function SlideProgressBar({
  slideId,
  paused,
  reduceMotion,
  durationMs,
}: {
  slideId: string;
  paused: boolean;
  reduceMotion: boolean;
  durationMs: number;
}) {
  const center = PROGRESS_RING_SIZE / 2;

  return (
    <div className="mt-8">
      <div
        role="progressbar"
        aria-label="Time until next preview"
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative shrink-0"
        style={{ width: PROGRESS_RING_SIZE, height: PROGRESS_RING_SIZE }}
      >
        <svg
          width={PROGRESS_RING_SIZE}
          height={PROGRESS_RING_SIZE}
          viewBox={`0 0 ${PROGRESS_RING_SIZE} ${PROGRESS_RING_SIZE}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={center}
            cy={center}
            r={PROGRESS_RING_RADIUS}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={PROGRESS_RING_STROKE}
          />
          <circle
            key={slideId}
            cx={center}
            cy={center}
            r={PROGRESS_RING_RADIUS}
            fill="none"
            stroke="#f97316"
            strokeWidth={PROGRESS_RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
            className={reduceMotion ? undefined : "showcase-slide-progress-ring"}
            style={{
              strokeDashoffset: reduceMotion ? 0 : PROGRESS_RING_CIRCUMFERENCE,
              ...(reduceMotion
                ? {}
                : {
                    ["--progress-circumference" as string]: `${PROGRESS_RING_CIRCUMFERENCE}`,
                    animationDuration: `${durationMs}ms`,
                    animationPlayState: paused ? "paused" : "running",
                  }),
            }}
          />
        </svg>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      className="mt-0.5 h-4 w-4 shrink-0 text-orange-500"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M13.333 4 6 11.333 2.667 8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ProductShowcaseCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const slideCount = PRODUCT_SHOWCASE_SLIDES.length;
  const activeSlide = PRODUCT_SHOWCASE_SLIDES[activeIndex];

  const goNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % slideCount);
  }, [slideCount]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reduceMotion) return;

    const timer = window.setInterval(goNext, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [goNext, paused, reduceMotion]);

  return (
    <div className="mt-12 lg:mt-16">
      <div
        className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 xl:gap-16"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Details — left on desktop, below mockup on mobile */}
        <div className="order-2 lg:order-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeSlide.id}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="w-fit rounded-full bg-[#f1efec] px-4 py-1 text-xs font-medium uppercase tracking-wider text-black">
                {activeSlide.eyebrow}
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {activeSlide.title}
              </h3>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                {activeSlide.description}
              </p>

              <ul className="mt-6 space-y-3">
                {activeSlide.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
                    <CheckIcon />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          <SlideProgressBar
            slideId={activeSlide.id}
            paused={paused}
            reduceMotion={reduceMotion}
            durationMs={AUTOPLAY_MS}
          />
        </div>

        {/* Product mockup — right on desktop, top on mobile */}
        <div className="order-1 lg:order-2">
          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeSlide.id}
                  initial={reduceMotion ? false : { opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: -40 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <BrowserChrome title={activeSlide.browserTitle} compact>
                    {activeSlide.mockup}
                  </BrowserChrome>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
