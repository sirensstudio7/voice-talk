const DEFAULT_DEMO_SLUG = "sunrise-coffee";
const isProduction = process.env.NODE_ENV === "production";

const DEFAULT_CUSTOMER_URL = isProduction
  ? "https://display.lorescale.com"
  : "http://localhost:6670";
const DEFAULT_ADMIN_URL = isProduction
  ? "https://app.lorescale.com"
  : "http://localhost:6680";

const PLACEHOLDER_URL_PATTERN =
  /your-customer-app|your-admin-app|yourdomain|your-domain|example\.com|placeholder|localhost|127\.0\.0\.1/i;

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function isUsablePublicUrl(url: string | undefined): url is string {
  if (!url?.trim()) return false;
  const normalized = normalizeBaseUrl(url);
  if (!/^https?:\/\//i.test(normalized)) return false;
  if (PLACEHOLDER_URL_PATTERN.test(normalized)) return false;
  return true;
}

function resolvePublicAppUrl(
  envValue: string | undefined,
  productionDefault: string,
  devDefault: string,
): string {
  const fallback = isProduction ? productionDefault : devDefault;
  if (!isUsablePublicUrl(envValue)) return fallback;
  return normalizeBaseUrl(envValue);
}

export const customerAppUrl = resolvePublicAppUrl(
  process.env.NEXT_PUBLIC_CUSTOMER_APP_URL,
  DEFAULT_CUSTOMER_URL,
  "http://localhost:6670",
);

export const adminAppUrl = resolvePublicAppUrl(
  process.env.NEXT_PUBLIC_ADMIN_APP_URL,
  DEFAULT_ADMIN_URL,
  "http://localhost:6680",
);

export const publicApiUrl = resolvePublicAppUrl(
  process.env.NEXT_PUBLIC_API_URL,
  "https://voice-talk-api.onrender.com",
  "http://localhost:8000",
);

export const demoSlug = process.env.NEXT_PUBLIC_DEFAULT_BUSINESS_SLUG ?? DEFAULT_DEMO_SLUG;
export const heroDemoSlug = process.env.NEXT_PUBLIC_HERO_DEMO_SLUG ?? "lorescale";

export const demoUrl = `${customerAppUrl}/${demoSlug}`;
export const heroDemoUrl = `${customerAppUrl}/${heroDemoSlug}?embed=hero`;
export const adminLoginUrl = `${adminAppUrl}/login?fresh=1`;
export const adminSignupUrl = `${adminAppUrl}/signup`;
export const requestDemoUrl = "/request-demo";
