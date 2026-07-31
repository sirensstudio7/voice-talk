"use client";

import { useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import {
  PowerPointViewer,
  type PowerPointViewerHandle,
  type ToolbarActionId,
} from "pptx-react-viewer";
// Do NOT import "pptx-react-viewer/styles" — that CSS writes :root tokens
// (--color-background, etc.) and turns the whole admin shell blue/dark.
// Admin-app already uses Tailwind v4, which the viewer resolves against.

import { loadPptxBytes } from "@/lib/pptx-content-cache";
import { pptxI18n } from "@/lib/pptx-i18n";

type Props = {
  /** Absolute URL that returns the .pptx bytes (may require Authorization). */
  pptxUrl: string | null | undefined;
  /** Optional bearer token when pptxUrl is an authenticated API route. */
  authToken?: string | null;
  /** 1-based slide number from the session engine */
  slideNumber: number;
  /** Fired when the viewer changes slides (toolbar / swipe / keyboard). 1-based. */
  onSlideChange?: (slideNumber: number) => void;
  className?: string;
  /** Viewer chrome background. Preview matches admin white; live can stay dark. */
  background?: "white" | "black";
  /** pptx-react-viewer mode. Prefer "present" — fits the slide without pan scroll. */
  viewerMode?: "preview" | "present";
  /** Show the floating present-mode toolbar (slide counter / timer). */
  presenterChrome?: boolean;
};

/** Present mode keeps a separate presentationSlideIndex; goTo alone won't update it. */
function presentNavigateTo(slideIndex0: number) {
  const digits = String(Math.max(1, slideIndex0 + 1));
  for (const digit of digits) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: digit, bubbles: true }));
  }
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

const HIDDEN_ACTIONS = [
  "share",
  "broadcast",
  "open",
  "save",
  "export",
  "print",
  "undo",
  "redo",
  "ai",
] as ToolbarActionId[];

/**
 * Real PPTX deck viewer (HTML/CSS + animations via pptx-react-viewer).
 * Synced to the AI Presenter session slide index.
 */
export function PptxDeckViewer({
  pptxUrl,
  authToken,
  slideNumber,
  onSlideChange,
  className,
  background = "white",
  viewerMode = "present",
  presenterChrome = true,
}: Props) {
  const viewerRef = useRef<PowerPointViewerHandle>(null);
  const [content, setContent] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState("");
  const [ready, setReady] = useState(false);
  const lastSynced = useRef<number | null>(null);
  const onSlideChangeRef = useRef(onSlideChange);
  onSlideChangeRef.current = onSlideChange;
  const shellBg = background === "black" ? "bg-zinc-950" : "bg-background";
  const mutedFg = background === "black" ? "text-zinc-400" : "text-muted-foreground";
  const errorFg = background === "black" ? "text-zinc-300" : "text-muted-foreground";
  // Letterbox chrome can be dark; slide theme must stay light or PPT fills/text invert.
  const letterbox = background === "black" ? "#09090b" : "#ffffff";
  const slideSurface = "#ffffff";

  useEffect(() => {
    if (!pptxUrl) {
      setContent(null);
      setLoadError("No PPTX file on this presentation.");
      return;
    }

    let cancelled = false;
    setReady(false);
    setLoadError("");
    setContent(null);
    lastSynced.current = null;

    void (async () => {
      try {
        const buf = await loadPptxBytes(pptxUrl, authToken);
        if (!cancelled) setContent(buf);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load PPTX");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pptxUrl, authToken]);

  // Apply viewer mode once the deck has parsed.
  useEffect(() => {
    if (!content) return;
    const timer = window.setInterval(() => {
      const handle = viewerRef.current;
      if (!handle) return;
      try {
        const count = handle.getSlideCount();
        if (count <= 0) return;
        // Imperative setMode bypasses enterPresentMode (no browser fullscreen).
        handle.setMode(viewerMode);
        handle.zoomReset();
        setReady(true);
        window.clearInterval(timer);
      } catch {
        // Viewer still initializing
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [content, viewerMode]);

  // Keep the viewer on the session's current slide (1-based → 0-based).
  useEffect(() => {
    if (!ready || !viewerRef.current) return;
    const index = Math.max(0, (slideNumber || 1) - 1);
    if (lastSynced.current === index) return;
    lastSynced.current = index;
    try {
      // goTo updates the visible slide in present + preview.
      viewerRef.current.goTo(index);
      if (viewerMode === "present") {
        // Also sync presentationSlideIndex used by present-mode chrome.
        presentNavigateTo(index);
      }
    } catch {
      // ignore transient viewer errors during transitions
    }
  }, [ready, slideNumber, viewerMode]);

  if (loadError) {
    return (
      <div
        className={`flex items-center justify-center p-6 text-center text-sm ${shellBg} ${errorFg} ${className ?? ""}`}
      >
        {loadError}
      </div>
    );
  }

  if (!content) {
    return (
      <div
        className={`flex items-center justify-center text-sm ${shellBg} ${mutedFg} ${className ?? ""}`}
      >
        Loading PowerPoint…
      </div>
    );
  }

  return (
    <I18nextProvider i18n={pptxI18n}>
      <div
        className={`pptx-deck-viewer relative overflow-hidden ${shellBg} ${className ?? ""}${
          presenterChrome ? "" : " pptx-deck-viewer--no-chrome"
        }`}
      >
        <PowerPointViewer
          ref={viewerRef}
          content={content}
          canEdit={false}
          fileName="presentation.pptx"
          className="h-full w-full"
          hiddenActions={HIDDEN_ACTIONS}
          theme={{
            colors: {
              background: slideSurface,
              foreground: "#0f172a",
              card: slideSurface,
              muted: "#f1f5f9",
              border: "#e2e8f0",
              primary: "#f97316",
              primaryForeground: "#ffffff",
            },
          }}
          onActiveSlideChange={(slideIndex) => {
            if (lastSynced.current === slideIndex) return;
            lastSynced.current = slideIndex;
            onSlideChangeRef.current?.(slideIndex + 1);
          }}
          onSlideCountChange={() => {
            try {
              viewerRef.current?.setMode(viewerMode);
              setReady(true);
            } catch {
              // ignore
            }
          }}
        />
        <style>{`
          .pptx-deck-viewer [data-pptx-toolbar],
          .pptx-deck-viewer header,
          .pptx-deck-viewer [role="toolbar"],
          .pptx-deck-viewer .pptx-toolbar,
          .pptx-deck-viewer [class*="Toolbar"],
          .pptx-deck-viewer [class*="StatusBar"],
          .pptx-deck-viewer [class*="Ribbon"],
          .pptx-deck-viewer [class*="SlideSorter"],
          .pptx-deck-viewer [class*="Thumbnail"] {
            display: none !important;
          }
          /* Hide editor side panels only — not slide content nodes. */
          .pptx-deck-viewer > div > div > aside,
          .pptx-deck-viewer [data-pptx-sidebar] {
            display: none !important;
          }
          .pptx-deck-viewer {
            --pptx-radius: 0;
            --pptx-background: ${slideSurface};
            background: ${letterbox} !important;
            height: 100%;
            min-height: 0;
          }
          /* Fill only the viewer shell — not every nested slide node. */
          .pptx-deck-viewer > div {
            height: 100% !important;
            min-height: 0 !important;
          }
          /* pptx-react-viewer SlideCanvas uses overflow-auto + my-4 so the
             native-size slide can pan. We embed it as a fit-only stage. */
          .pptx-deck-viewer [data-pptx-viewport] {
            overflow: hidden !important;
            touch-action: none !important;
          }
          .pptx-deck-viewer [data-pptx-viewport] > div {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          /* Present stage must fill the host so ResizeObserver gets real bounds
             (same full-bleed behavior as Preview → In focus). */
          .pptx-deck-viewer [data-pptx-presentation-stage] {
            background: ${letterbox} !important;
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
          }
          .pptx-deck-viewer [data-pptx-presentation-stage] [aria-roledescription="slide"] {
            background-color: ${slideSurface};
          }
          /* Present-mode floating chrome (PresentationToolbar) — light admin look */
          .pptx-deck-viewer div[class*="bg-neutral-900"] {
            background: #ffffff !important;
            border-color: #e2e8f0 !important;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08) !important;
            color: #0f172a !important;
          }
          .pptx-deck-viewer div[class*="bg-neutral-900"] span,
          .pptx-deck-viewer div[class*="bg-neutral-900"] button,
          .pptx-deck-viewer div[class*="bg-neutral-900"] svg {
            color: #475569 !important;
          }
          .pptx-deck-viewer div[class*="bg-neutral-900"] button:hover {
            color: #0f172a !important;
            background: #f1f5f9 !important;
          }
          .pptx-deck-viewer div[class*="bg-neutral-900"] div[class*="bg-white"] {
            background: #e2e8f0 !important;
          }
          .pptx-deck-viewer--no-chrome div[class*="bg-neutral-900"] {
            display: none !important;
          }
        `}</style>
      </div>
    </I18nextProvider>
  );
}
