"use client";

import { useEffect, useState } from "react";
import { resolveCachedImage, warmCachedImage, toCacheableUrl } from "@/lib/image-cache";

export function useCachedImage(src?: string | null): string | undefined {
  const normalized = src ?? undefined;
  const cacheable = normalized ? toCacheableUrl(normalized) : undefined;
  const [resolved, setResolved] = useState<string | undefined>(cacheable);

  useEffect(() => {
    let cancelled = false;

    if (!normalized) {
      setResolved(undefined);
      return () => {
        cancelled = true;
      };
    }

    // Immediately use a cacheable URL (proxied for cross-origin) for first paint
    setResolved(toCacheableUrl(normalized));

    return () => {
      cancelled = true;
    };
  }, [normalized]);

  if (normalized) {
    // Warm the cache asynchronously; keep src stable to avoid flicker
    warmCachedImage(normalized);
  }

  return normalized ? resolved ?? cacheable : undefined;
}
