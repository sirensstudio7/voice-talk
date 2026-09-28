const CUSTOMER_APP_URL = (process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ?? "http://localhost:6670").replace(/\/$/, "");

export function customerAppUrl(slug: string, kioskSlug?: string): string {
  const base = `${CUSTOMER_APP_URL}/${slug}`;
  if (!kioskSlug || kioskSlug === "default") return base;
  return `${base}?kiosk=${encodeURIComponent(kioskSlug)}`;
}
