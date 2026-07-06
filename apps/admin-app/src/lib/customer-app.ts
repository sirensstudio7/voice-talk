const CUSTOMER_APP_URL = (process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ?? "http://localhost:6670").replace(/\/$/, "");

export function customerAppUrl(slug: string): string {
  return `${CUSTOMER_APP_URL}/b/${slug}`;
}
