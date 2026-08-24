import { create } from "zustand";

import {
  DEFAULT_VISION_CONFIG,
  type GreetingTriggerMode,
  type KioskPhase,
  type VisionConfig,
  type VisionSource,
} from "@/types/kiosk";

function normalizeGreetingTriggerMode(
  mode: string | undefined,
): GreetingTriggerMode {
  if (mode === "gesture") return "gesture";
  if (mode === "raise_hand") return "raise_hand";
  return "presence";
}

function normalizeVisionSource(source: string | undefined): VisionSource {
  if (source === "python") return "python";
  if (source === "browser") return "browser";
  if (source === "human") return "human";
  return "auto";
}

function normalizeStartHotkey(value: string | undefined): string {
  const raw = String(value ?? "").trim();
  const key = raw === " " || raw.toLowerCase() === "space" ? "Space" : raw;
  return key || DEFAULT_VISION_CONFIG.start_hotkey;
}

function normalizeVisionConfig(config: VisionConfig): VisionConfig {
  return {
    ...DEFAULT_VISION_CONFIG,
    ...config,
    start_hotkey: normalizeStartHotkey(config.start_hotkey),
    vision_source: normalizeVisionSource(config.vision_source),
    greeting_trigger_mode: normalizeGreetingTriggerMode(config.greeting_trigger_mode),
  };
}

export type LuckySpinConfig = {
  active: boolean;
  enabled: boolean;
  /** When false, skip AI voice congrats after a win (live MC). Default true. */
  ai_voice_enabled: boolean;
  campaign: { id: string; name: string } | null;
  prizes: Array<{
    id: string;
    name: string;
    image_url: string;
    probability: number;
  }>;
};

export type CampaignBannerConfig = {
  active: boolean;
  enabled: boolean;
  layout: "top" | "right" | "bottom";
  items: Array<{
    id: string;
    title: string;
    image_url: string;
    target_url: string | null;
    qr_url: string | null;
    duration_sec: number;
    display_order: number;
  }>;
};

interface KioskStore {
  visionConfig: VisionConfig;
  kioskPhase: KioskPhase;
  visionEnabled: boolean;
  visionConfigSynced: boolean;
  browserVisionReady: boolean;
  kioskConnected: boolean;
  pythonVisionConnected: boolean;
  browserVisionError: string | null;
  luckySpinConfig: LuckySpinConfig | null;
  campaignBannerConfig: CampaignBannerConfig | null;
  setVisionConfig: (config: VisionConfig) => void;
  setKioskPhase: (phase: KioskPhase) => void;
  setKioskConnected: (connected: boolean) => void;
  setPythonVisionConnected: (connected: boolean) => void;
  setBrowserVisionError: (error: string | null) => void;
  setBrowserVisionReady: (ready: boolean) => void;
  setLuckySpinConfig: (config: LuckySpinConfig | null) => void;
  setCampaignBannerConfig: (config: CampaignBannerConfig | null) => void;
}

export const useKioskStore = create<KioskStore>((set) => ({
  visionConfig: DEFAULT_VISION_CONFIG,
  kioskPhase: "idle",
  visionEnabled: false,
  visionConfigSynced: false,
  browserVisionReady: false,
  kioskConnected: false,
  pythonVisionConnected: false,
  browserVisionError: null,
  luckySpinConfig: null,
  campaignBannerConfig: null,
  setVisionConfig: (config) =>
    set((state) => {
      const keepPhase =
        state.kioskPhase === "waiting" ||
        state.kioskPhase === "greeting" ||
        state.kioskPhase === "listening" ||
        state.kioskPhase === "talking" ||
        state.kioskPhase === "goodbye";

      return {
        visionConfig: normalizeVisionConfig(config),
        visionEnabled: Boolean(config.camera_trigger_enabled),
        visionConfigSynced: true,
        kioskPhase: keepPhase ? state.kioskPhase : "idle",
      };
    }),
  setKioskPhase: (kioskPhase) => set({ kioskPhase }),
  setKioskConnected: (kioskConnected) => set({ kioskConnected }),
  setPythonVisionConnected: (pythonVisionConnected) => set({ pythonVisionConnected }),
  setBrowserVisionError: (browserVisionError) => set({ browserVisionError }),
  setBrowserVisionReady: (browserVisionReady) => set({ browserVisionReady }),
  setLuckySpinConfig: (luckySpinConfig) => set({ luckySpinConfig }),
  setCampaignBannerConfig: (campaignBannerConfig) => set({ campaignBannerConfig }),
}));
