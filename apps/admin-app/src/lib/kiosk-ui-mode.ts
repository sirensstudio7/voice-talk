export type KioskUiMode = "classic" | "studio";

export const DEFAULT_KIOSK_UI_MODE: KioskUiMode = "classic";

export function normalizeKioskUiMode(value?: string | null): KioskUiMode {
  return value?.trim().toLowerCase() === "studio" ? "studio" : "classic";
}
