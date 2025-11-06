"use client";

/* eslint-disable @next/next/no-img-element */

import { useCachedImage } from "@/hooks/useCachedImage";
import clsx from "clsx";
import type { ImgHTMLAttributes } from "react";

type CachedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
};

export default function CachedImage({ src, alt = "", className, ...rest }: CachedImageProps) {
  const resolvedSrc = useCachedImage(src);
  if (!src) return null;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={clsx(className)}
      {...rest}
    />
  );
}

