"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { CampaignBannerLayout } from "@/lib/api";
import { customerAppUrl } from "@/lib/customer-app";
import { cn } from "@/lib/cn";

const AvatarHero = dynamic(
  () => import("@voicetalk/avatar").then((mod) => ({ default: mod.AvatarHero })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    ),
  },
);

/** Virtual kiosk viewport sizes — iframe renders at these, then CSS-scales into the card. */
const DESIGN_SIZE = {
  landscape: { width: 1280, height: 800 },
  portrait: { width: 390, height: 844 },
} as const;

function PreviewChrome({
  orientation,
  layout,
  children,
}: {
  orientation: "landscape" | "portrait";
  layout: CampaignBannerLayout;
  children: ReactNode;
}) {
  const isLandscape = orientation === "landscape";
  const rightHiddenOnPortrait = layout === "right" && !isLandscape;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">
          {isLandscape ? "Landscape" : "Portrait"}
        </p>
        {rightHiddenOnPortrait ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200/80">
            Banner hidden
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm",
          isLandscape ? "aspect-[16/10]" : "aspect-[9/16] mx-auto max-w-[180px]",
        )}
      >
        {children}

        <div className="pointer-events-none absolute inset-x-[3%] top-[2.5%] z-10 h-[2.2%] rounded-full bg-white/75 ring-1 ring-black/5" />
        <div className="pointer-events-none absolute inset-x-[32%] bottom-[2.5%] z-10 h-[2.8%] rounded-full bg-slate-900/75" />

        {rightHiddenOnPortrait ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/25 backdrop-blur-[1px]">
            <p className="rounded-md bg-white/95 px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">
              Hidden on portrait
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AvatarFallback({
  modelPath,
  assistantName,
  orientation,
}: {
  modelPath: string;
  assistantName: string;
  orientation: "landscape" | "portrait";
}) {
  const isLandscape = orientation === "landscape";
  return (
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,#fff7ed_0%,#e2e8f0_75%)]">
      <AvatarHero
        isTalking={false}
        mode="idle"
        modelPath={modelPath}
        assistantName={assistantName}
        framing="bust"
        frameClassName={
          isLandscape
            ? "absolute bottom-0 left-1/2 aspect-[2/3] h-[92%] w-auto -translate-x-1/2"
            : "absolute inset-x-0 bottom-0 top-[8%] mx-auto aspect-[2/3] h-auto max-h-full w-full"
        }
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-200/90 to-transparent"
        aria-hidden
      />
    </div>
  );
}

function ScaledIframe({
  src,
  orientation,
  onFail,
}: {
  src: string;
  orientation: "landscape" | "portrait";
  onFail: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 0, offsetX: 0, offsetY: 0 });
  const [loaded, setLoaded] = useState(false);
  const design = DESIGN_SIZE[orientation];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const scale = Math.min(width / design.width, height / design.height);
      // Center leftover space when aspect ratios don't match exactly.
      const offsetX = (width - design.width * scale) / 2;
      const offsetY = (height - design.height * scale) / 2;
      setFit({ scale, offsetX, offsetY });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [design.height, design.width]);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-hidden">
      {!loaded || fit.scale <= 0 ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-slate-100">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
        </div>
      ) : null}
      <iframe
        key={src}
        src={src}
        title={`${orientation} kiosk preview`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={onFail}
        sandbox="allow-scripts allow-same-origin"
        className="absolute border-0"
        style={{
          width: design.width,
          height: design.height,
          left: fit.offsetX,
          top: fit.offsetY,
          transform: `scale(${fit.scale || 0.01})`,
          transformOrigin: "top left",
          pointerEvents: "none",
          opacity: loaded && fit.scale > 0 ? 1 : 0,
        }}
      />
    </div>
  );
}

function EmbeddedKiosk({
  slug,
  orientation,
  revision,
  modelPath,
  assistantName,
}: {
  slug: string;
  orientation: "landscape" | "portrait";
  revision: number;
  modelPath: string;
  assistantName: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [slug, orientation, revision]);

  if (!slug || failed) {
    return (
      <AvatarFallback
        modelPath={modelPath}
        assistantName={assistantName}
        orientation={orientation}
      />
    );
  }

  const src = `${customerAppUrl(slug)}?embed=hero&frame=${orientation}&cb_preview=${revision}`;

  return <ScaledIframe src={src} orientation={orientation} onFail={() => setFailed(true)} />;
}

export function CampaignBannerLayoutPreview({
  slug,
  layout,
  revision,
  modelPath,
  assistantName,
}: {
  slug: string;
  layout: CampaignBannerLayout;
  revision: number;
  modelPath: string;
  assistantName: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">Preview</p>
        <p className="text-xs text-slate-500">Live kiosk · {layout} layout</p>
      </div>
      <div className="grid items-end gap-4 sm:grid-cols-[1.35fr_0.65fr]">
        <PreviewChrome orientation="landscape" layout={layout}>
          <EmbeddedKiosk
            slug={slug}
            orientation="landscape"
            revision={revision}
            modelPath={modelPath}
            assistantName={assistantName}
          />
        </PreviewChrome>
        <PreviewChrome orientation="portrait" layout={layout}>
          <EmbeddedKiosk
            slug={slug}
            orientation="portrait"
            revision={revision}
            modelPath={modelPath}
            assistantName={assistantName}
          />
        </PreviewChrome>
      </div>
      {layout === "right" ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Right layout shows on landscape kiosks only. Portrait hides the banner so it does not
          crowd the avatar.
        </p>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Live 3D kiosk preview scaled to the card. Uploaded banners appear here when the add-on
          is enabled.
        </p>
      )}
    </div>
  );
}
