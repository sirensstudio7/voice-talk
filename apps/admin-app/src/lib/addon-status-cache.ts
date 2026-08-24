import type { AddonStatus } from "@/lib/api";

const cache = new Map<string, AddonStatus>();

function cacheKey(businessId: string, code: string) {
  return `${businessId}:${code}`;
}

export function peekAddonStatus(businessId: string, code: string): AddonStatus | null {
  return cache.get(cacheKey(businessId, code)) ?? null;
}

export function rememberAddonStatus(
  businessId: string,
  code: string,
  status: AddonStatus,
): void {
  cache.set(cacheKey(businessId, code), status);
}
