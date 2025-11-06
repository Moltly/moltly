"use client";

import { useEffect, useState } from "react";
import { resolveCachedImage, warmCachedImage } from "@/lib/image-cache";

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

    resolveCachedImage(normalized)
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

  if (normalized) {
    warmCachedImage(normalized);
  }

  return normalized ? resolved ?? normalized : undefined;
}
