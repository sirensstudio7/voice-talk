const MEMORY = new Map<string, Uint8Array>();
const CACHE_NAME = "voicetalk-pptx-v1";

/**
 * Load PPTX bytes with memory + Cache API reuse so Preview → In focus
 * (new tab) can skip a second network download.
 */
export async function loadPptxBytes(
  url: string,
  authToken?: string | null,
): Promise<Uint8Array> {
  const cached = MEMORY.get(url);
  if (cached) return cached;

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) {
        const buf = new Uint8Array(await hit.arrayBuffer());
        MEMORY.set(url, buf);
        return buf;
      }
    } catch {
      // Cache API unavailable / private mode
    }
  }

  const res = await fetch(url, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
  if (!res.ok) throw new Error(`Failed to load PPTX (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  MEMORY.set(url, buf);

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        url,
        new Response(buf, {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "Cache-Control": "private, max-age=86400",
          },
        }),
      );
    } catch {
      // Quota or unsupported — memory cache still helps same-tab reuse
    }
  }

  return buf;
}

export function prefetchPptxBytes(url: string, authToken?: string | null) {
  void loadPptxBytes(url, authToken).catch(() => {
    // Warm cache best-effort
  });
}
