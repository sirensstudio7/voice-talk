const isProduction = process.env.NODE_ENV === "production";

const DEFAULT_MARKETING_URL = isProduction
  ? "https://lorescale.com"
  : "http://localhost:6690";

export const marketingAppUrl =
  process.env.NEXT_PUBLIC_MARKETING_APP_URL ?? DEFAULT_MARKETING_URL;

export const marketingLandingUrl = `${marketingAppUrl.replace(/\/$/, "")}/`;
