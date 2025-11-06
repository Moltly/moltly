import { APP_VERSION } from "./app-version";

const CACHE_PREFIX = "moltly-image-cache";
const CURRENT_CACHE_NAME = `${CACHE_PREFIX}-${APP_VERSION}`;
const MAX_MEMORY_ENTRIES = 64;

const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function sameOrigin(u: URL): boolean {
  try {
    return typeof window !== "undefined" && u.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function toCacheableUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol === "http:" || u.protocol === "https:") {
      if (!sameOrigin(u)) {
        // Route external images through our proxy for consistent caching and CORS
        return `/api/image?url=${encodeURIComponent(u.toString())}`;
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

function pruneMemoryCache() {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;
  const firstKey = memoryCache.keys().next().value as string | undefined;
  if (!firstKey) return;
  const url = memoryCache.get(firstKey);
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
  memoryCache.delete(firstKey);
}

function isCacheSupported() {
  return typeof window !== "undefined" && typeof caches !== "undefined";
}

async function ensureVersionedCache(): Promise<Cache | null> {
  if (!isCacheSupported()) return null;
  try {
    const cacheNames = await caches.keys();
    // purge caches from older versions
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CURRENT_CACHE_NAME)
        .map((name) => caches.delete(name))
    );
    return caches.open(CURRENT_CACHE_NAME);
  } catch (error) {
    console.warn("[image-cache] unable to open cache", error);
    return null;
  }
}

export async function resolveCachedImage(url: string): Promise<string> {
  const key = toCacheableUrl(url);
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  if (inflight.has(key)) {
    return inflight.get(key)!;
  }

  const promise = (async () => {
    if (typeof window === "undefined") {
      return key;
    }

    let response: Response | undefined;

    try {
      const cache = await ensureVersionedCache();
      if (cache) {
        response = await cache.match(key);
        if (!response) {
          const fetched = await fetch(key, { cache: "force-cache" });
          if (!fetched.ok) {
            throw new Error(`Failed to fetch image: ${fetched.status}`);
          }
          response = fetched.clone();
          await cache.put(key, fetched);
        }
      } else {
        const fetched = await fetch(key);
        if (!fetched.ok) {
          throw new Error(`Failed to fetch image: ${fetched.status}`);
        }
        response = fetched;
      }

      if (!response) {
        return key;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      memoryCache.set(key, objectUrl);
      pruneMemoryCache();
      return objectUrl;
    } catch (error) {
      console.warn("[image-cache] using original url due to error:", error);
      return key;
    }
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export function warmCachedImage(url: string | null | undefined): void {
  if (!url) return;
  if (typeof window === "undefined") return;
  const key = toCacheableUrl(url);
  window.setTimeout(() => {
    void resolveCachedImage(key);
  }, 0);
}
