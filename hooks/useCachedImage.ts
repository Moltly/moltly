"use client";

import { useEffect, useMemo } from "react";
import { warmCachedImage, toCacheableUrl } from "@/lib/image-cache";

export function useCachedImage(src?: string | null): string | undefined {
  const normalized = src ?? undefined;
  const cacheable = useMemo(() => (normalized ? toCacheableUrl(normalized) : undefined), [normalized]);

  useEffect(() => {
    if (normalized) {
      // Warm the cache asynchronously; keep src stable to avoid flicker
      warmCachedImage(normalized);
    }
  }, [normalized]);

  return cacheable;
}
