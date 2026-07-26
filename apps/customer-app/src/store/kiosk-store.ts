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
  return "auto";
}

function normalizeVisionConfig(config: VisionConfig): VisionConfig {
  return {
    ...DEFAULT_VISION_CONFIG,
    ...config,
    vision_source: normalizeVisionSource(config.vision_source),
    greeting_trigger_mode: normalizeGreetingTriggerMode(config.greeting_trigger_mode),
  };
}

interface KioskStore {
  visionConfig: VisionConfig;
  kioskPhase: KioskPhase;
  visionEnabled: boolean;
  kioskConnected: boolean;
  pythonVisionConnected: boolean;
  browserVisionError: string | null;
  setVisionConfig: (config: VisionConfig) => void;
  setKioskPhase: (phase: KioskPhase) => void;
  setKioskConnected: (connected: boolean) => void;
  setPythonVisionConnected: (connected: boolean) => void;
  setBrowserVisionError: (error: string | null) => void;
}

export const useKioskStore = create<KioskStore>((set) => ({
  visionConfig: DEFAULT_VISION_CONFIG,
  kioskPhase: "idle",
  visionEnabled: false,
  kioskConnected: false,
  pythonVisionConnected: false,
  browserVisionError: null,
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
        kioskPhase: keepPhase ? state.kioskPhase : "idle",
      };
    }),
  setKioskPhase: (kioskPhase) => set({ kioskPhase }),
  setKioskConnected: (kioskConnected) => set({ kioskConnected }),
  setPythonVisionConnected: (pythonVisionConnected) => set({ pythonVisionConnected }),
  setBrowserVisionError: (browserVisionError) => set({ browserVisionError }),
}));
