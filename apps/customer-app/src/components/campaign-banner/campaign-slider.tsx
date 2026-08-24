"use client";

import { useEffect, useRef, useState } from "react";

import { trackCampaignBannerEvent } from "@/lib/campaign-banner-api";
import type { CampaignBannerConfig } from "@/store/kiosk-store";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Props = {
  businessSlug: string;
  config: CampaignBannerConfig;
  layout: "top" | "right" | "bottom";
  paused: boolean;
  className?: string;
};

function clampDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return 5;
  return Math.min(30, Math.max(3, Math.round(seconds)));
}

export function shouldShowCampaignBanner(
  config: CampaignBannerConfig | null | undefined,
): boolean {
  return Boolean(
    config?.active &&
      config.enabled &&
      Array.isArray(config.items) &&
      config.items.length > 0,
  );
}

export function CampaignSlider({
  businessSlug,
  config,
  layout,
  paused,
  className,
}: Props) {
  const items = config.items;
  const [index, setIndex] = useState(0);
  const [pausedByTouch, setPausedByTouch] = useState(false);
  const impressedRef = useRef<Set<string>>(new Set());
  const dwellTimerRef = useRef<number | null>(null);

  const current = items[index] ?? items[0];
  const slidePaused = paused || pausedByTouch;
  const multi = items.length > 1;

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  useEffect(() => {
    if (!current || slidePaused) return;
    if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
    dwellTimerRef.current = window.setTimeout(() => {
      if (impressedRef.current.has(current.id)) return;
      impressedRef.current.add(current.id);
      void trackCampaignBannerEvent({
        slug: businessSlug,
        bannerId: current.id,
        eventName: "campaign_banner_impression",
        metadata: { layout },
      });
    }, 1000);
    return () => {
      if (dwellTimerRef.current) window.clearTimeout(dwellTimerRef.current);
    };
  }, [businessSlug, current, layout, slidePaused]);

  useEffect(() => {
    if (!multi || slidePaused || !current) return;
    const ms = clampDuration(current.duration_sec) * 1000;
    const timer = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [current, items.length, multi, slidePaused]);

  if (!current) return null;

  const frameClass =
    layout === "right"
      ? "h-full w-[280px] max-w-[34vw]"
      : layout === "bottom"
        ? "h-[120px] w-full"
        : "h-[96px] w-full sm:h-[110px]";

  function onActivate() {
    void trackCampaignBannerEvent({
      slug: businessSlug,
      bannerId: current.id,
      eventName: "campaign_banner_click",
      metadata: { layout },
    });
    if (current.target_url) {
      window.open(current.target_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div
      className={cx(
        "pointer-events-auto overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 backdrop-blur",
        frameClass,
        className,
      )}
      onPointerDown={() => setPausedByTouch(true)}
      onPointerUp={() => setPausedByTouch(false)}
      onPointerLeave={() => setPausedByTouch(false)}
    >
      <button
        type="button"
        onClick={onActivate}
        className="relative block h-full w-full overflow-hidden text-left"
        aria-label={current.title}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.image_url}
          alt={current.title}
          className="h-full w-full object-cover object-center transition-opacity duration-300"
          draggable={false}
        />
        {current.qr_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(current.qr_url)}`}
            alt=""
            className={cx(
              "absolute rounded-md bg-white p-1 shadow",
              layout === "right" ? "bottom-3 right-3 size-14" : "bottom-2 right-2 size-11",
            )}
          />
        ) : null}
      </button>
      {multi ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
          {items.map((item, i) => (
            <span
              key={item.id}
              className={cx(
                "h-1.5 w-1.5 rounded-full",
                i === index ? "bg-white shadow" : "bg-white/50",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
