"use client";

import { useEffect, useState } from "react";

const CACHE_NAME = "moltly-image-cache-v1";
const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const MAX_MEMORY_ENTRIES = 24;

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

async function resolveImage(url: string): Promise<string> {
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

    const supportsCache = typeof caches !== "undefined";
    let response: Response | undefined;

    try {
      if (supportsCache) {
        const cache = await caches.open(CACHE_NAME);
        response = await cache.match(url);
        if (!response) {
          const fetched = await fetch(url, { cache: "force-cache" });
          if (!fetched.ok) {
            throw new Error(`Failed to fetch image: ${fetched.status}`);
          }
          response = fetched.clone();
          // Store in cache for future sessions
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

export function useCachedImage(src?: string | null): string | undefined {
  const normalized = src ?? undefined;
  const [resolved, setResolved] = useState<string | undefined>(normalized ?? undefined);

  useEffect(() => {
    let cancelled = false;

    if (!normalized) {
      const timeout = setTimeout(() => {
        if (!cancelled) {
          setResolved(undefined);
        }
      }, 0);

      return () => {
        cancelled = true;
        clearTimeout(timeout);
      };
    }

    const resetTimeout = setTimeout(() => {
      if (!cancelled) {
        setResolved(undefined);
      }
    }, 0);

    resolveImage(normalized)
      .then((result) => {
        if (!cancelled) {
          setResolved(result);
        }
      })
      .catch(() => {
        // ignore fetch failures, state already fallback to original url.
      });

    return () => {
      cancelled = true;
      clearTimeout(resetTimeout);
    };
  }, [normalized]);

  return normalized ? resolved ?? normalized : undefined;
}
