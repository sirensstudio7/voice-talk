import type { VisionSettings } from "../db/schema.js";

export const GREETING_TRIGGER_MODES = ["presence", "gesture", "raise_hand"] as const;
export type GreetingTriggerMode = (typeof GREETING_TRIGGER_MODES)[number];

export const VISION_SOURCES = ["auto", "python", "browser", "human"] as const;
export type VisionSource = (typeof VISION_SOURCES)[number];

/** Sources that run detection in the customer browser tab (not the Python sidecar). */
export function isBrowserClassVisionSource(source: VisionSource): boolean {
  return source === "browser" || source === "human";
}

export const DEFAULT_VISION_SETTINGS = {
  cameraTriggerEnabled: false,
  startHotkey: "Enter",
  visionSource: "auto" as VisionSource,
  greetingTriggerMode: "presence" as GreetingTriggerMode,
  greetingDelaySeconds: 3,
  detectionDistanceM: 2,
  cooldownSeconds: 30,
  lostTimeoutSeconds: 5,
  silenceTimeoutSeconds: 15,
  autoGoodbyeTimeoutSeconds: 10,
  greetingScript: "Hello, welcome. How may I assist you today?",
  goodbyeScript: "Thank you. Have a wonderful day.",
} as const;

export function normalizeGreetingTriggerMode(value: unknown): GreetingTriggerMode {
  const mode = String(value ?? "").trim().toLowerCase();
  if (mode === "gesture") return "gesture";
  if (mode === "raise_hand") return "raise_hand";
  return "presence";
}

export function normalizeVisionSource(value: unknown): VisionSource {
  const source = String(value ?? "").trim().toLowerCase();
  if (source === "python") return "python";
  if (source === "browser") return "browser";
  if (source === "human") return "human";
  return "auto";
}

const BLOCKED_HOTKEYS = new Set([
  "Tab",
  "Escape",
  "Meta",
  "Control",
  "Alt",
  "Shift",
  "Dead",
]);

export function normalizeStartHotkey(value: unknown): string {
  const raw = String(value ?? "").trim();
  const key = raw === " " || raw.toLowerCase() === "space" ? "Space" : raw;
  if (!key || key.length > 32 || BLOCKED_HOTKEYS.has(key)) {
    return DEFAULT_VISION_SETTINGS.startHotkey;
  }
  return key;
}

export function visionSettingsOut(settings: VisionSettings) {
  return {
    camera_trigger_enabled: settings.cameraTriggerEnabled,
    start_hotkey: normalizeStartHotkey(settings.startHotkey),
    vision_source: normalizeVisionSource(settings.visionSource),
    greeting_trigger_mode: normalizeGreetingTriggerMode(settings.greetingTriggerMode),
    greeting_delay_seconds: settings.greetingDelaySeconds,
    detection_distance_m: settings.detectionDistanceM,
    cooldown_seconds: settings.cooldownSeconds,
    lost_timeout_seconds: settings.lostTimeoutSeconds,
    silence_timeout_seconds: settings.silenceTimeoutSeconds,
    auto_goodbye_timeout_seconds: settings.autoGoodbyeTimeoutSeconds,
    greeting_script: settings.greetingScript,
    goodbye_script: settings.goodbyeScript,
  };
}

export function normalizeGreetingDelaySeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VISION_SETTINGS.greetingDelaySeconds;
  return Math.max(1, Math.min(30, Math.round(n)));
}

export function normalizeCooldownSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VISION_SETTINGS.cooldownSeconds;
  return Math.max(0, Math.min(300, Math.round(n)));
}

export function normalizeLostTimeoutSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VISION_SETTINGS.lostTimeoutSeconds;
  return Math.max(1, Math.min(60, Math.round(n)));
}

export function normalizeSilenceTimeoutSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VISION_SETTINGS.silenceTimeoutSeconds;
  return Math.max(5, Math.min(120, Math.round(n)));
}

export function normalizeAutoGoodbyeTimeoutSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VISION_SETTINGS.autoGoodbyeTimeoutSeconds;
  return Math.max(5, Math.min(120, Math.round(n)));
}

export function normalizeDetectionDistanceM(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VISION_SETTINGS.detectionDistanceM;
  return Math.round(Math.max(1, Math.min(2.5, n)) * 10) / 10;
}

export function normalizeVisionScript(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.slice(0, 500);
}
