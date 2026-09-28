export type KioskUiMode = "classic" | "studio";

export const DEFAULT_KIOSK_UI_MODE: KioskUiMode = "classic";
export const KIOSK_UI_QUERY_PARAM = "ui";

function storageKey(slug: string) {
  return `lorescale_kiosk_ui_${slug}`;
}

export function normalizeKioskUiMode(value?: string | null): KioskUiMode {
  return value?.trim().toLowerCase() === "studio" ? "studio" : "classic";
}

export function parseKioskUiSearchParam(search: string): KioskUiMode | null {
  const raw = new URLSearchParams(search).get(KIOSK_UI_QUERY_PARAM)?.trim().toLowerCase();
  if (raw === "classic" || raw === "studio") return raw;
  return null;
}

export function readStoredKioskUiMode(slug: string): KioskUiMode | null {
  if (typeof window === "undefined" || !slug) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (raw === "classic" || raw === "studio") return raw;
  } catch {
    // ignore quota / private mode
  }
  return null;
}

export function persistKioskUiMode(slug: string, mode: KioskUiMode) {
  if (typeof window === "undefined" || !slug) return;
  try {
    window.localStorage.setItem(storageKey(slug), mode);
  } catch {
    // ignore
  }
}

export function resolveKioskUiMode(options: {
  queryMode?: KioskUiMode | null;
  storedMode?: KioskUiMode | null;
  businessDefault?: KioskUiMode | null;
}): KioskUiMode {
  return options.queryMode ?? options.storedMode ?? options.businessDefault ?? DEFAULT_KIOSK_UI_MODE;
}

export function writeKioskUiQueryParam(mode: KioskUiMode) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(KIOSK_UI_QUERY_PARAM, mode);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, "", next);
}
