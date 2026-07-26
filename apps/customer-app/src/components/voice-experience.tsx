"use client";

import { useEffect, useMemo, useState } from "react";

import { LorescaleHero } from "@/components/lorescale-hero";
import { ExperienceBackground } from "@/components/experience-background";
import { AppointmentBookingPanelRoot } from "@/components/appointment-booking-panel";
import { CheckoutPanel } from "@/components/basket-panel";
import { FlyToBasketLayer } from "@/components/fly-to-basket";
import { StoreMenuPanelRoot } from "@/components/store-menu-panel";
import { BottomControls, ExperienceHeader } from "@/components/voice-controls";
import { TranscriptPanel } from "@/components/transcript-panel";
import { useBusinessSlug } from "@/context/business-context";
import { useKioskOrchestrator } from "@/hooks/use-kiosk-orchestrator";
import { useResolvedDisplayOrientation } from "@/hooks/use-resolved-display-orientation";
import { fetchMenu, menuFetchErrorMessage } from "@/lib/menu-api";
import {
  DEFAULT_DISPLAY_ORIENTATION_SETTING,
  getExperienceLayout,
  normalizeDisplayOrientationSetting,
  type DisplayOrientationSetting,
} from "@/lib/display-orientation";
import { buildBottomGradient } from "@/lib/gradient-style";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useKioskStore } from "@/store/kiosk-store";
import { useSessionStore } from "@/store/session-store";
import type { KioskPhase, GreetingTriggerMode } from "@/types/kiosk";

function kioskPhaseToAvatarMode(phase: KioskPhase) {
  if (phase === "greeting") return "greeting";
  if (phase === "listening") return "listening";
  if (phase === "thinking") return "thinking";
  if (phase === "talking") return "talking";
  if (phase === "goodbye") return "goodbye";
  return "idle";
}

function visionIdlePrompt(
  mode: GreetingTriggerMode,
  phase: "waiting" | "ready",
): string {
  if (mode === "gesture") {
    return phase === "waiting"
      ? "Wave your hand when you're ready…"
      : "Wave your hand — the assistant will greet you";
  }
  if (mode === "raise_hand") {
    return phase === "waiting"
      ? "Raise your hand when you're ready…"
      : "Raise your hand — the assistant will greet you";
  }
  return phase === "waiting"
    ? "Visitor detected — the assistant will greet you shortly…"
    : "Listening for visitors…";
}

export function VoiceExperience() {
  const businessSlug = useBusinessSlug();
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [gradientColor, setGradientColor] = useState("");
  const [displayOrientationSetting, setDisplayOrientationSetting] =
    useState<DisplayOrientationSetting>(DEFAULT_DISPLAY_ORIENTATION_SETTING);
  const [menuLoadError, setMenuLoadError] = useState<string | null>(null);
  const setMenuCache = useSessionStore((s) => s.setMenuCache);
  const setAssistantName = useSessionStore((s) => s.setAssistantName);
  const setAvatarUrl = useSessionStore((s) => s.setAvatarUrl);
  const hydrateLanguageFromStorage = useSessionStore((s) => s.hydrateLanguageFromStorage);
  const visionEnabled = useKioskStore((s) => s.visionEnabled);
  const kioskPhase = useKioskStore((s) => s.kioskPhase);
  const visionConfig = useKioskStore((s) => s.visionConfig);
  const kioskConnected = useKioskStore((s) => s.kioskConnected);
  const browserVisionError = useKioskStore((s) => s.browserVisionError);
  const greetingTriggerMode = visionConfig.greeting_trigger_mode;

  const voiceSession = useVoiceSession();
  const {
    status,
    isTalking,
    micPrimed,
    continuousListenActive,
    assistantSpeaking,
    connect,
    disconnect,
    reconnectForLanguageChange,
    primeMicrophone,
    primeAudioOutput,
    beginVisionListening,
    startTalking,
    stopTalking,
    startContinuousListening,
    stopContinuousListening,
    cancelPrefetch,
    sendGoodbye,
    ensureVisionGreetingDispatched,
    waitForVisionMicReady,
  } = voiceSession;

  useKioskOrchestrator(
    {
      connect,
      disconnect,
      cancelPrefetch,
      startContinuousListening,
      stopContinuousListening,
      sendGoodbye,
      primeMicrophone,
      primeAudioOutput,
      beginVisionListening,
      ensureVisionGreetingDispatched,
      waitForVisionMicReady,
    },
    { assistantSpeaking, continuousListenActive },
  );

  const { error, checkoutPanelOpen, conversationPhase, freshOrderRequest, language, orderingEnabled, menuEnabled, bookingEnabled, menuCacheSlug, setLanguage } =
    useSessionStore();
  const menuReady = menuCacheSlug === businessSlug;
  const showOrdering = menuReady && orderingEnabled;
  const showBooking = menuReady && bookingEnabled;
  const showMenu = menuReady && menuEnabled;
  const isLive = status === "connected" || status === "connecting";
  const canTalk = status !== "connecting" && conversationPhase !== "wrapping_up";
  const avatarMode = useMemo(() => kioskPhaseToAvatarMode(kioskPhase), [kioskPhase]);

  const visionMicLabel = useMemo(() => {
    if (assistantSpeaking) return "Assistant speaking…";
    if (isTalking) return "Hearing you…";
    if (continuousListenActive) return "Listening…";
    if (isLive && kioskPhase === "greeting") return "Assistant greeting you…";
    if (isLive && kioskPhase === "talking" && !continuousListenActive) {
      return "Assistant greeting you…";
    }
    if (isLive && (kioskPhase === "listening" || kioskPhase === "talking")) {
      return "Opening microphone…";
    }
    if (visionEnabled && greetingTriggerMode === "raise_hand") {
      return "Raise your hand — the assistant will greet you";
    }
    return "Preparing microphone…";
  }, [assistantSpeaking, continuousListenActive, greetingTriggerMode, isTalking, isLive, kioskPhase, visionEnabled]);

  const handleLanguageChange = (nextLanguage: typeof language) => {
    if (nextLanguage === language) return;
    const wasLive = status === "connected" || status === "connecting";
    setLanguage(nextLanguage);
    if (wasLive) {
      void reconnectForLanguageChange();
    }
  };

  useEffect(() => {
    hydrateLanguageFromStorage();
  }, [hydrateLanguageFromStorage]);

  // Vision kiosk: no talk button — prime mic silently on load (if already allowed) or first tap.
  useEffect(() => {
    if (!visionEnabled || micPrimed) return;

    void primeMicrophone();

    const primeOnInteraction = () => {
      void primeMicrophone();
    };
    window.addEventListener("pointerdown", primeOnInteraction, { once: true });
    return () => window.removeEventListener("pointerdown", primeOnInteraction);
  }, [micPrimed, primeMicrophone, visionEnabled]);

  useEffect(() => {
    let cancelled = false;

    const preloadMenu = async () => {
      try {
        const data = await fetchMenu(businessSlug);
        if (cancelled) return;

        setMenuLoadError(null);
        setMenuCache(businessSlug, data);

        if (data.assistant_name) {
          setAssistantName(data.assistant_name);
        }

        setAvatarUrl(data.avatar_url ?? "");
        setBackgroundUrl(data.background_url ?? "");
        setGradientColor(data.gradient_color ?? "");
        setDisplayOrientationSetting(normalizeDisplayOrientationSetting(data.display_orientation));
      } catch (error) {
        if (!cancelled) {
          setMenuLoadError(menuFetchErrorMessage(error));
        }
      }
    };

    void preloadMenu();

    const handleFocus = () => {
      void preloadMenu();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, [businessSlug, setAssistantName, setAvatarUrl, setMenuCache]);

  const handleStartTalking = () => {
    void startTalking();
  };

  const resolvedDisplayOrientation = useResolvedDisplayOrientation(displayOrientationSetting);
  const layout = getExperienceLayout(resolvedDisplayOrientation);
  const statusOverlayClass = layout.statusOverlayClass;

  return (
    <main
      className={layout.shellClassName}
      data-display={resolvedDisplayOrientation}
      data-display-setting={displayOrientationSetting}
    >
      <div className={layout.frameClassName}>
        <ExperienceBackground backgroundUrl={backgroundUrl} />

        {layout.heroWrapperClassName ? (
          <div className={layout.heroWrapperClassName}>
            <LorescaleHero
              key={freshOrderRequest}
              isTalking={isTalking}
              mode={avatarMode}
              frameClassName={layout.heroFrameClassName}
            />
          </div>
        ) : (
          <div key={freshOrderRequest} className="absolute inset-0">
            <LorescaleHero
              isTalking={isTalking}
              mode={avatarMode}
              frameClassName={layout.heroFrameClassName}
            />
          </div>
        )}

        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 ${layout.gradientHeightClass}`}
          aria-hidden
          style={{
            background: buildBottomGradient(gradientColor),
          }}
        />

        <ExperienceHeader
          onDisconnect={disconnect}
          orderingEnabled={showOrdering}
          bookingEnabled={showBooking}
        />

        {showMenu ? <StoreMenuPanelRoot /> : null}
        {showBooking ? <AppointmentBookingPanelRoot /> : null}
        {showOrdering ? (
          <>
            <FlyToBasketLayer />
            <CheckoutPanel />
          </>
        ) : null}

        {!checkoutPanelOpen ? (
          <div className={layout.transcriptWrapperClass}>
            <div className={layout.transcriptInnerClass}>
              <TranscriptPanel
                onLanguageChange={handleLanguageChange}
                variant={layout.isLandscape ? "landscape" : "portrait"}
              />
            </div>
          </div>
        ) : null}

        {menuLoadError && !checkoutPanelOpen ? (
          <div className="absolute inset-x-0 top-[4.5rem] z-20 flex justify-center px-6">
            <p className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-800">
              {menuLoadError} Vision kiosk settings may be unavailable until the menu loads.
            </p>
          </div>
        ) : null}

        {visionEnabled && browserVisionError && !checkoutPanelOpen ? (
          <div className="absolute inset-x-0 top-[4.5rem] z-20 flex justify-center px-6">
            <p className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-800">
              {browserVisionError}
            </p>
          </div>
        ) : null}

        {visionEnabled && isLive && !checkoutPanelOpen ? (
          <div className={statusOverlayClass}>
            <p className="rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 backdrop-blur">
              {visionMicLabel}
            </p>
          </div>
        ) : null}

        {visionEnabled && !isLive && error && !checkoutPanelOpen ? (
          <div className={statusOverlayClass}>
            <p className="max-w-sm rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-medium text-red-700">
              {error}
            </p>
          </div>
        ) : null}

        {visionEnabled && !isLive && conversationPhase !== "wrapping_up" && !checkoutPanelOpen ? (
          <div className={statusOverlayClass}>
            <p className="rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 backdrop-blur">
              {kioskPhase === "waiting"
                ? visionIdlePrompt(greetingTriggerMode, "waiting")
                : kioskConnected
                  ? visionIdlePrompt(greetingTriggerMode, "ready")
                  : "Connecting to vision hub…"}
            </p>
          </div>
        ) : null}

        {visionEnabled && isLive && error && !checkoutPanelOpen ? (
          <div className={statusOverlayClass}>
            <p className="max-w-sm rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-medium text-red-700">
              {error}
            </p>
          </div>
        ) : null}

        {!visionEnabled && !isLive && conversationPhase !== "wrapping_up" && !checkoutPanelOpen ? (
          <div className={statusOverlayClass}>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    await primeMicrophone();
                  } catch {
                    // Playback can still work; mic is only needed after the greeting.
                  }
                  await connect({ requestGreeting: true });
                })();
              }}
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
              style={{
                background: "rgb(249, 115, 22)",
                boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
              }}
            >
              {showOrdering ? "Order Now" : showBooking ? "Book appointment" : "Start conversation"}
            </button>
            {error ? (
              <p className="max-w-sm rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-medium text-red-700">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        {!checkoutPanelOpen && !visionEnabled ? (
          <BottomControls
            disabled={!canTalk}
            isTalking={isTalking}
            onStart={handleStartTalking}
            onStop={stopTalking}
            menuEnabled={showMenu}
          />
        ) : null}
      </div>
    </main>
  );
}
