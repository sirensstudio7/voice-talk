import { inc } from "../http/metrics.js";
import { downloadFromStorage, PHOTO_BRANDING_BUCKET } from "../storage/index.js";

/**
 * Bounded in-process cache for photo branding assets (TKT-009).
 *
 * Every capture used to download the frame and logo from object storage before
 * compositing, which adds two round-trips to the countdown → capture → success
 * flow. Assets are immutable per `updatedAt` version, so the key includes the
 * settings version: changing the frame/logo makes new keys and the old entries
 * age out. Bounded by entry count and asset size; TTL is a backstop.
 */
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 100;
const MAX_ASSET_BYTES = 4 * 1024 * 1024;

type Entry = { expiresAt: number; buffer: Buffer };
const cache = new Map<string, Entry>();

function read(key: string): Buffer | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresh insertion order so the Map eviction keeps the hottest assets.
  cache.delete(key);
  cache.set(key, entry);
  return entry.buffer;
}

function write(key: string, buffer: Buffer): void {
  if (buffer.byteLength > MAX_ASSET_BYTES) return;
  cache.set(key, { expiresAt: Date.now() + TTL_MS, buffer });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export type BrandingAssetLoader = (pathOrUrl: string) => Promise<Buffer | null>;

const defaultLoader: BrandingAssetLoader = (pathOrUrl) =>
  downloadFromStorage(PHOTO_BRANDING_BUCKET, pathOrUrl);

export async function getBrandingAsset(
  pathOrUrl: string,
  version: number,
  load: BrandingAssetLoader = defaultLoader,
): Promise<Buffer | null> {
  const key = `${pathOrUrl}#${version}`;
  const cached = read(key);
  if (cached) {
    inc("photo.branding_cache_hits_total");
    return cached;
  }

  inc("photo.branding_cache_misses_total");
  const buffer = await load(pathOrUrl);
  if (buffer) write(key, buffer);
  return buffer;
}

/** Test/shutdown helper. */
export function clearBrandingAssetCache(): void {
  cache.clear();
}
