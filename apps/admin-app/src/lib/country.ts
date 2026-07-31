const ID_TIMEZONES = new Set([
  "Asia/Jakarta",
  "Asia/Pontianak",
  "Asia/Makassar",
  "Asia/Jayapura",
]);

/** Best-effort ISO country detection from the browser (used at signup / billing fallback). */
export function detectCountryCode(): string {
  if (typeof window === "undefined") return "";

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && ID_TIMEZONES.has(tz)) return "ID";
  } catch {
    // ignore
  }

  const lang = (navigator.language || "").toLowerCase();
  if (lang === "id" || lang.startsWith("id-")) return "ID";

  // locale region suffix, e.g. en-US → US
  const match = lang.match(/-([a-z]{2})$/i);
  if (match?.[1]) return match[1].toUpperCase();

  return "";
}

export function isIndonesiaCountry(country: string | null | undefined): boolean {
  return (country ?? "").trim().toUpperCase() === "ID";
}
