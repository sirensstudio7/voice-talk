const DEFAULT_DEMO_SLUG = "sunrise-coffee";
const isProduction = process.env.NODE_ENV === "production";

const DEFAULT_CUSTOMER_URL = isProduction
  ? "https://voice-talk-customer.vercel.app"
  : "http://localhost:6670";
const DEFAULT_ADMIN_URL = isProduction
  ? "https://app.lorescale.com"
  : "http://localhost:6680";

export const customerAppUrl = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ?? DEFAULT_CUSTOMER_URL;
export const adminAppUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? DEFAULT_ADMIN_URL;
export const demoSlug = process.env.NEXT_PUBLIC_DEFAULT_BUSINESS_SLUG ?? DEFAULT_DEMO_SLUG;

export const demoUrl = `${customerAppUrl.replace(/\/$/, "")}/b/${demoSlug}`;
export const adminLoginUrl = `${adminAppUrl.replace(/\/$/, "")}/login`;
