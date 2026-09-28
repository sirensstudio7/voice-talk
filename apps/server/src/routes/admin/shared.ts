
import { normalizeVoiceGender, normalizeVoicePreset } from "@voicetalk/shared";
import type { aiRules, voiceSessions } from "../../db/schema.js";

export const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DISPLAY_ORIENTATIONS = new Set(["portrait", "landscape", "auto"]);

export const KIOSK_UI_MODES = new Set(["classic", "studio"]);

export const ADDON_MONTHLY_IDR = 199_000;

export const ADDON_DURATION_DISCOUNTS: Record<number, number> = {
  1: 0,
  3: 0.05,
  6: 0.1,
  12: 0.15,
};

/** Prefer checkout Amount in notes; otherwise derive from Duration. */

export function normalizeKioskUiMode(value: string | undefined | null): "classic" | "studio" {
  const cleaned = value?.trim().toLowerCase();
  return cleaned === "studio" ? "studio" : "classic";
}

export function aiRulesOut(r: typeof aiRules.$inferSelect) {
  return {
    id: r.id,
    assistant_name: r.assistantName,
    avatar_url: r.avatarUrl || "",
    avatar_model_path: r.avatarModelPath || "",
    personality: r.personality,
    tone: r.tone,
    language: r.language,
    behavioral_rules: r.behavioralRules,
    tool_instructions: r.toolInstructions,
    idle_timeout_seconds: r.idleTimeoutSeconds,
    voice_preset: normalizeVoicePreset(r.voicePreset),
    voice_gender: normalizeVoiceGender(r.voiceGender),
  };
}

export type ConversationSessionRow = typeof voiceSessions.$inferSelect;

export type ConversationKioskOut = {
  id: string;
  name: string;
  slug: string;
};
