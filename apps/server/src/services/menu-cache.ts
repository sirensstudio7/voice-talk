/**
 * In-process cache for the kiosk bootstrap payload (`GET /menu`).
 *
 * `/menu` fans out to a handful of services; production logs showed 1.6–2.3 s
 * per fetch, and every kiosk fetches it on load/wake/reload. The payload is
 * keyed by business slug with a short TTL, and callers invalidate it as soon as
 * any kiosk-relevant config changes (locally or through the kiosk bus).
 *
 * This module deliberately has no service imports so fanout code can invalidate
 * without creating an import cycle.
 */

const CACHE_TTL_MS = 45_000;

type Entry = { expiresAt: number; payload: unknown };

const bySlug = new Map<string, Entry>();
const slugByBusinessId = new Map<string, string>();

export function getCachedMenu<T>(slug: string): T | null {
  const entry = bySlug.get(slug);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.payload as T;
}

export function setCachedMenu(slug: string, businessId: string, payload: unknown): void {
  bySlug.set(slug, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  slugByBusinessId.set(businessId, slug);
}

export function invalidateMenuCache(slug: string): void {
  bySlug.delete(slug);
}

export function invalidateMenuCacheForBusiness(businessId: string): void {
  const slug = slugByBusinessId.get(businessId);
  if (slug) bySlug.delete(slug);
}

/** Test/shutdown helper. */
export function clearMenuCache(): void {
  bySlug.clear();
  slugByBusinessId.clear();
}
