"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { LorescaleHero } from "@/components/lorescale-hero";
import { ExperienceBackground } from "@/components/experience-background";
import { AppointmentBookingPanelRoot } from "@/components/appointment-booking-panel";
import { CheckoutPanel } from "@/components/basket-panel";
import { FlyToBasketLayer } from "@/components/fly-to-basket";
import { SmartPhotoMomentOverlay, shouldOfferPhotoMoment } from "@/components/photo/smart-photo-moment-overlay";
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
  isHeroEmbedSearchParam,
  normalizeDisplayOrientationSetting,
  resolveDisplayOrientationSettingForEmbed,
  resolveHeroEmbedFrameOrientation,
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
  phase: "waiting" | "ready" | "loading" | "starting_camera",
): string {
  if (phase === "loading") {
    return "Loading vision settings…";
  }
  if (phase === "starting_camera") {
    return "Starting camera…";
  }
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
  const setAvatarModelPath = useSessionStore((s) => s.setAvatarModelPath);
  const avatarModelPath = useSessionStore((s) => s.avatarModelPath);
  const assistantName = useSessionStore((s) => s.assistantName) || "Assistant";
  const hydrateLanguageFromStorage = useSessionStore((s) => s.hydrateLanguageFromStorage);
  const visionEnabled = useKioskStore((s) => s.visionEnabled);
  const kioskPhase = useKioskStore((s) => s.kioskPhase);
  const visionConfig = useKioskStore((s) => s.visionConfig);
  const kioskConnected = useKioskStore((s) => s.kioskConnected);
  const visionConfigSynced = useKioskStore((s) => s.visionConfigSynced);
  const browserVisionReady = useKioskStore((s) => s.browserVisionReady);
  const pythonVisionConnected = useKioskStore((s) => s.pythonVisionConnected);
  const browserVisionError = useKioskStore((s) => s.browserVisionError);
  const greetingTriggerMode = visionConfig.greeting_trigger_mode;
  const expectBrowserVision =
    visionConfig.vision_source === "browser" ||
    (visionConfig.vision_source === "auto" && !pythonVisionConnected);

  const voiceSession = useVoiceSession();
  const {
    status,
    isTalking,
    micPrimed,
    continuousListenActive,
    visionGreetingPending,
    greetingPoseActive,
    thumbsUpPoseActive,
    talkingHandPoseActive,
    assistantSpeaking,
    mouthOpen,
    sessionWarm,
    connect,
    disconnect,
    reconnectForLanguageChange,
    primeMicrophone,
    primeAudioOutput,
    unlockAudioSync,
    beginVisionListening,
    startTalking,
    stopTalking,
    sendText,
    sendPhotoReady,
    startContinuousListening,
    stopContinuousListening,
    cancelPrefetch,
    sendGoodbye,
    ensureVisionGreetingDispatched,
    waitForVisionMicReady,
  } = voiceSession;

  const [startingConversation, setStartingConversation] = useState(false);
  const [awaitingGreetingAudio, setAwaitingGreetingAudio] = useState(false);

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
    { assistantSpeaking, continuousListenActive, visionGreetingPending },
  );

  const { error, checkoutPanelOpen, conversationPhase, language, orderingEnabled, menuEnabled, bookingEnabled, menuCacheSlug, setLanguage, paymentCompleteRequest, menuCache } =
    useSessionStore();
  const photoConfig = menuCache?.smart_photo_moment;
  const photoEnabled = shouldOfferPhotoMoment(photoConfig);

  const handlePhotoReady = useCallback(
    (prompt: string) => {
      sendPhotoReady(prompt);
    },
    [sendPhotoReady],
  );

  const handlePhotoFinish = useCallback(() => {
    // Order complete UI already showing via checkoutPhase paid
  }, []);

  const menuReady = menuCacheSlug === businessSlug;
  const showOrdering = menuReady && orderingEnabled;
  const showBooking = menuReady && bookingEnabled;
  const showMenu = menuReady && menuEnabled;
  const isLive = status === "connected" || status === "connecting";
  // Prefetch must keep Order Now visible — only hide once a real session is active.
  const inActiveSession =
    (status === "connected" && !sessionWarm) ||
    (status === "connecting" && startingConversation);
  const canTalk = status !== "connecting" && conversationPhase !== "wrapping_up";
  const showStartButton =
    !visionEnabled &&
    !inActiveSession &&
    !startingConversation &&
    conversationPhase !== "wrapping_up" &&
    !checkoutPanelOpen;

  useEffect(() => {
    if (isLive || error) {
      setStartingConversation(false);
    }
  }, [error, isLive]);

  useEffect(() => {
    if (
      assistantSpeaking ||
      greetingPoseActive ||
      thumbsUpPoseActive ||
      talkingHandPoseActive ||
      error ||
      (!isLive && !startingConversation)
    ) {
      setAwaitingGreetingAudio(false);
    }
  }, [
    assistantSpeaking,
    error,
    greetingPoseActive,
    thumbsUpPoseActive,
    talkingHandPoseActive,
    isLive,
    startingConversation,
  ]);

  // Warm Gemini + voice WS while the customer reads the idle screen (Order Now path).
  useEffect(() => {
    if (visionEnabled) return;
    if (conversationPhase === "wrapping_up") return;
    if (isLive || sessionWarm) return;

    const timer = window.setTimeout(() => {
      void connect({ prefetch: true }).catch(() => {
        // Idle prefetch is best-effort; Order Now still cold-starts if needed.
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    businessSlug,
    connect,
    conversationPhase,
    isLive,
    language,
    sessionWarm,
    visionEnabled,
  ]);

  const avatarMode = useMemo(() => {
    // Short hello wave only — not the whole greeting / talking phase.
    if (greetingPoseActive) return "greeting" as const;
    if (thumbsUpPoseActive) return "acknowledge" as const;
    if (talkingHandPoseActive) return "talk_gesture" as const;
    return kioskPhaseToAvatarMode(kioskPhase);
  }, [greetingPoseActive, thumbsUpPoseActive, talkingHandPoseActive, kioskPhase]);

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
    } else if (sessionWarm) {
      // Prefetch was for the old language — drop it so the warm effect reconnects.
      cancelPrefetch();
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
        setAvatarModelPath(data.avatar_model_path ?? "");
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
  }, [businessSlug, setAssistantName, setAvatarUrl, setAvatarModelPath, setMenuCache]);

  const ensureBusinessAvatarReady = async () => {
    if (avatarModelPath) return;
    try {
      const data = await fetchMenu(businessSlug);
      setMenuLoadError(null);
      setMenuCache(businessSlug, data);
      if (data.assistant_name) setAssistantName(data.assistant_name);
      setAvatarUrl(data.avatar_url ?? "");
      setAvatarModelPath(data.avatar_model_path ?? "");
      setBackgroundUrl(data.background_url ?? "");
      setGradientColor(data.gradient_color ?? "");
      setDisplayOrientationSetting(normalizeDisplayOrientationSetting(data.display_orientation));
      // Let AvatarHero remount onto the RPM model before the greeting wave.
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    } catch (error) {
      setMenuLoadError(menuFetchErrorMessage(error));
    }
  };

  const handleStartTalking = () => {
    void startTalking();
  };

  const handleStartConversation = () => {
    setStartingConversation(true);
    setAwaitingGreetingAudio(true);
    // Must run sync in the click — async-only unlock often misses the gesture.
    unlockAudioSync();
    void (async () => {
      await primeAudioOutput();
      await connect({ requestGreeting: true });
    })();
    void ensureBusinessAvatarReady();
    // Mic opens later via Hold to talk — requesting it here kills greeting audio.
  };

  const searchParams = useSearchParams();
  const search = useMemo(() => {
    const query = searchParams.toString();
    return query ? `?${query}` : "";
  }, [searchParams]);
  const isHeroEmbed = isHeroEmbedSearchParam(search);
  const heroEmbedFrameOrientation = isHeroEmbed ? resolveHeroEmbedFrameOrientation(search) : null;
  const effectiveDisplayOrientationSetting = resolveDisplayOrientationSettingForEmbed(
    displayOrientationSetting,
    search,
  );
  const orientationSettingForLayout =
    heroEmbedFrameOrientation ?? effectiveDisplayOrientationSetting;
  const resolvedDisplayOrientation = useResolvedDisplayOrientation(orientationSettingForLayout);
  const layout = getExperienceLayout(resolvedDisplayOrientation, { heroEmbed: isHeroEmbed });
  const statusOverlayClass = layout.statusOverlayClass;

  const startCtaLabel = showOrdering
    ? "Order Now"
    : showBooking
      ? "Book appointment"
      : "Start conversation";

  const startButton = (
    <>
      <button
        type="button"
        onClick={handleStartConversation}
        className={`inline-flex items-center justify-center rounded-full font-medium text-white transition-opacity hover:opacity-90 ${
          layout.compactUi ? "px-5 py-2.5 text-[13px]" : "px-6 py-3 text-[15px]"
        }`}
        style={{
          background: "rgb(249, 115, 22)",
          boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
        }}
      >
        {startCtaLabel}
      </button>
      {sessionWarm ? (
        <p className="text-center text-[11px] font-medium text-slate-500/90">Ready</p>
      ) : (
        <p className="text-center text-[11px] font-medium text-slate-400">Preparing…</p>
      )}
      {error ? (
        <p className="max-w-sm rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </>
  );

  return (
    <main
      className={layout.shellClassName}
      data-display={resolvedDisplayOrientation}
      data-display-setting={orientationSettingForLayout}
      data-embed={isHeroEmbed ? "hero" : undefined}
      data-avatar-mode={avatarMode}
      data-greeting-pose={greetingPoseActive ? "1" : "0"}
      data-thumbs-up-pose={thumbsUpPoseActive ? "1" : "0"}
      data-talking-hand-pose={talkingHandPoseActive ? "1" : "0"}
      data-avatar-model={avatarModelPath || "default"}
    >
      <div className={layout.frameClassName}>
        <ExperienceBackground backgroundUrl={backgroundUrl} />

        {layout.heroWrapperClassName ? (
          <div className={layout.heroWrapperClassName}>
            <LorescaleHero
              isTalking={isTalking}
              mode={avatarMode}
              mouthOpen={mouthOpen}
              frameClassName={layout.heroFrameClassName}
            />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 overflow-visible">
            <LorescaleHero
              isTalking={isTalking}
              mode={avatarMode}
              mouthOpen={mouthOpen}
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
          compact={layout.compactUi}
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
                : !kioskConnected
                  ? "Connecting to vision hub…"
                  : !visionConfigSynced
                    ? visionIdlePrompt(greetingTriggerMode, "loading")
                    : expectBrowserVision && !browserVisionReady
                      ? visionIdlePrompt(greetingTriggerMode, "starting_camera")
                      : visionIdlePrompt(greetingTriggerMode, "ready")}
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

        {!visionEnabled &&
        (startingConversation || awaitingGreetingAudio) &&
        conversationPhase !== "wrapping_up" &&
        !checkoutPanelOpen &&
        layout.isLandscape ? (
          <div className={statusOverlayClass}>
            <p className="rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 backdrop-blur">
              {assistantName} is joining…
            </p>
          </div>
        ) : null}

        {!visionEnabled && !checkoutPanelOpen && !layout.isLandscape ? (
          <div className={statusOverlayClass} aria-hidden={!showStartButton}>
            {showStartButton ? (
              startButton
            ) : startingConversation || awaitingGreetingAudio ? (
              <p className="rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 backdrop-blur">
                {assistantName} is joining…
              </p>
            ) : null}
          </div>
        ) : null}

        {showStartButton && layout.isLandscape ? (
          <div className={statusOverlayClass}>{startButton}</div>
        ) : null}

        {!checkoutPanelOpen && !visionEnabled ? (
          <BottomControls
            disabled={!canTalk}
            isTalking={isTalking}
            onStart={handleStartTalking}
            onStop={stopTalking}
            onSendText={sendText}
            menuEnabled={showMenu}
            footerClassName={layout.bottomControlsClassName ?? undefined}
            compact={layout.compactUi}
          />
        ) : null}
      </div>

      {photoEnabled && photoConfig ? (
        <SmartPhotoMomentOverlay
          businessSlug={businessSlug}
          config={photoConfig}
          orderId={null}
          paymentCompleteRequest={paymentCompleteRequest}
          assistantSpeaking={assistantSpeaking}
          onRequestPhotoReady={handlePhotoReady}
          onFinishOfferKeepAlive={handlePhotoFinish}
          disconnectVoice={disconnect}
        />
      ) : null}
    </main>
  );
}
