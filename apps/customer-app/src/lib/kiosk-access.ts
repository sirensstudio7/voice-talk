const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEFAULT_KIOSK_SLUG = "default";

export class KioskAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KioskAccessError";
    this.status = status;
  }
}

export function getKioskSlugFromLocation(): string {
  if (typeof window === "undefined") return DEFAULT_KIOSK_SLUG;
  const value = new URLSearchParams(window.location.search).get("kiosk")?.trim().toLowerCase();
  return value || DEFAULT_KIOSK_SLUG;
}

function storageKey(businessSlug: string, kioskSlug: string): string {
  return `lorescale_kiosk_token:${businessSlug}:${kioskSlug}`;
}

export function getStoredKioskToken(businessSlug: string, kioskSlug: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(storageKey(businessSlug, kioskSlug));
}

export function storeKioskToken(businessSlug: string, kioskSlug: string, token: string): void {
  window.sessionStorage.setItem(storageKey(businessSlug, kioskSlug), token);
}

export function clearStoredKioskToken(businessSlug: string, kioskSlug?: string): void {
  if (typeof window === "undefined") return;
  const slug = kioskSlug ?? getKioskSlugFromLocation();
  window.sessionStorage.removeItem(storageKey(businessSlug, slug));
}

export function appendKioskAuth(url: URL, businessSlug: string): void {
  const kioskSlug = getKioskSlugFromLocation();
  const token = getStoredKioskToken(businessSlug, kioskSlug);
  url.searchParams.set("kiosk_id", kioskSlug);
  if (token) url.searchParams.set("token", token);
}

export async function unlockKioskDisplay(opts: {
  businessSlug: string;
  kioskSlug: string;
  pin: string;
}): Promise<{ access_token: string; kiosk: { name: string; slug: string } }> {
  const response = await fetch(`${API_URL}/public/kiosks/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business: opts.businessSlug,
      kiosk: opts.kioskSlug,
      pin: opts.pin,
    }),
  });
  const text = await response.text();
  let body: { detail?: string; access_token?: string; kiosk?: { name: string; slug: string } } = {};
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    body = {};
  }
  if (!response.ok || !body.access_token || !body.kiosk) {
    throw new KioskAccessError(body.detail || "Invalid PIN.", response.status);
  }
  storeKioskToken(opts.businessSlug, body.kiosk.slug, body.access_token);
  return { access_token: body.access_token, kiosk: body.kiosk };
}

export async function releaseKioskDisplay(opts: {
  businessSlug: string;
  kioskSlug?: string;
}): Promise<void> {
  const kioskSlug = opts.kioskSlug ?? getKioskSlugFromLocation();
  const token = getStoredKioskToken(opts.businessSlug, kioskSlug);
  if (!token) {
    clearStoredKioskToken(opts.businessSlug, kioskSlug);
    return;
  }
  const response = await fetch(`${API_URL}/public/kiosks/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      business: opts.businessSlug,
      kiosk: kioskSlug,
      token,
    }),
  });
  clearStoredKioskToken(opts.businessSlug, kioskSlug);
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    let detail = "Could not release kiosk.";
    try {
      const body = text ? (JSON.parse(text) as { detail?: string }) : {};
      if (body.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new KioskAccessError(detail, response.status);
  }
}

export async function lockKioskAndReturnToPin(businessSlug: string): Promise<void> {
  try {
    await releaseKioskDisplay({ businessSlug });
  } catch {
    clearStoredKioskToken(businessSlug);
  }
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}
