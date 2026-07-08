"use client";

import { useEffect, useState } from "react";

import { LorescaleHero } from "@/components/lorescale-hero";
import { ExperienceBackground } from "@/components/experience-background";
import { AppointmentBookingPanelRoot } from "@/components/appointment-booking-panel";
import { CheckoutPanel } from "@/components/basket-panel";
import { FlyToBasketLayer } from "@/components/fly-to-basket";
import { StoreMenuPanelRoot } from "@/components/store-menu-panel";
import { BottomControls, ExperienceHeader } from "@/components/voice-controls";
import { TranscriptPanel } from "@/components/transcript-panel";
import { useBusinessSlug } from "@/context/business-context";
import { fetchMenu } from "@/lib/menu-api";
import { BOTTOM_GRADIENT_HEIGHT_CLASS, buildBottomGradient } from "@/lib/gradient-style";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useSessionStore } from "@/store/session-store";

export function VoiceExperience() {
  const businessSlug = useBusinessSlug();
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [gradientColor, setGradientColor] = useState("");
  const setMenuCache = useSessionStore((s) => s.setMenuCache);
  const setAssistantName = useSessionStore((s) => s.setAssistantName);
  const setAvatarUrl = useSessionStore((s) => s.setAvatarUrl);
  const hydrateLanguageFromStorage = useSessionStore((s) => s.hydrateLanguageFromStorage);
  const {
    status,
    isTalking,
    connect,
    disconnect,
    reconnectForLanguageChange,
    startTalking,
    stopTalking,
  } = useVoiceSession();

  const { error, checkoutPanelOpen, freshOrderRequest, language, orderingEnabled, menuEnabled, bookingEnabled, setLanguage } =
    useSessionStore();
  const isLive = status === "connected" || status === "connecting";
  const canTalk = status !== "connecting";

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

  useEffect(() => {
    let cancelled = false;

    const preloadMenu = async () => {
      try {
        const data = await fetchMenu(businessSlug);
        if (cancelled) return;

        setMenuCache(businessSlug, data);

        if (data.assistant_name) {
          setAssistantName(data.assistant_name);
        }

        setAvatarUrl(data.avatar_url ?? "");
        setBackgroundUrl(data.background_url ?? "");
        setGradientColor(data.gradient_color ?? "");
      } catch {
        // Menu preload is optional for fly animation fallback.
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

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-slate-100">
      <ExperienceBackground backgroundUrl={backgroundUrl} />

      <div key={freshOrderRequest} className="absolute inset-0">
        <LorescaleHero isTalking={isTalking} />
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 ${BOTTOM_GRADIENT_HEIGHT_CLASS}`}
        aria-hidden
        style={{
          background: buildBottomGradient(gradientColor),
        }}
      />

      <ExperienceHeader
        onDisconnect={disconnect}
        orderingEnabled={orderingEnabled}
        bookingEnabled={bookingEnabled}
      />

      {menuEnabled ? <StoreMenuPanelRoot /> : null}
      {bookingEnabled ? <AppointmentBookingPanelRoot /> : null}
      {orderingEnabled ? (
        <>
          <FlyToBasketLayer />
          <CheckoutPanel />
        </>
      ) : null}

      {!checkoutPanelOpen ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[14%] z-30 flex items-end justify-start px-6 pb-[calc(2rem+4.5rem+1.5rem)]">
          <div className="pointer-events-auto flex max-h-full min-h-0 w-72 max-w-[calc(100vw-3rem)] flex-col">
            <TranscriptPanel onLanguageChange={handleLanguageChange} />
          </div>
        </div>
      ) : null}

      {!isLive && !checkoutPanelOpen ? (
        <div className="absolute inset-x-0 bottom-[9.5rem] z-20 flex flex-col items-center gap-3 px-6">
          <button
            type="button"
            onClick={() => {
              void connect({ requestGreeting: true });
            }}
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
            style={{
              background: "rgb(249, 115, 22)",
              boxShadow: "rgba(255, 255, 255, 0.35) 0px 2.5px 5px 0px inset",
            }}
          >
            {orderingEnabled ? "Order Now" : bookingEnabled ? "Book appointment" : "Start conversation"}
          </button>
          {error ? (
            <p className="max-w-sm rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {!checkoutPanelOpen ? (
        <BottomControls
          disabled={!canTalk}
          isTalking={isTalking}
          onStart={handleStartTalking}
          onStop={stopTalking}
          orderingEnabled={orderingEnabled}
          menuEnabled={menuEnabled}
          bookingEnabled={bookingEnabled}
        />
      ) : null}
    </main>
  );
}
