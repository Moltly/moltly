import { APP_VERSION } from "./app-version";

const CACHE_PREFIX = "moltly-image-cache";
const CURRENT_CACHE_NAME = `${CACHE_PREFIX}-${APP_VERSION}`;
const MAX_MEMORY_ENTRIES = 24;

const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

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
  if (memoryCache.has(url)) {
    return memoryCache.get(url)!;
  }

  if (inflight.has(url)) {
    return inflight.get(url)!;
  }

  const promise = (async () => {
    if (typeof window === "undefined") {
      return url;
    }

    let response: Response | undefined;

    try {
      const cache = await ensureVersionedCache();
      if (cache) {
        response = await cache.match(url);
        if (!response) {
          const fetched = await fetch(url, { cache: "force-cache" });
          if (!fetched.ok) {
            throw new Error(`Failed to fetch image: ${fetched.status}`);
          }
          response = fetched.clone();
          await cache.put(url, fetched);
        }
      } else {
        const fetched = await fetch(url);
        if (!fetched.ok) {
          throw new Error(`Failed to fetch image: ${fetched.status}`);
        }
        response = fetched;
      }

      if (!response) {
        return url;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      memoryCache.set(url, objectUrl);
      pruneMemoryCache();
      return objectUrl;
    } catch (error) {
      console.warn("[image-cache] using original url due to error:", error);
      return url;
    }
  })().finally(() => {
    inflight.delete(url);
  });

  inflight.set(url, promise);
  return promise;
}

export function warmCachedImage(url: string | null | undefined): void {
  if (!url) return;
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    void resolveCachedImage(url);
  }, 0);
}
