"use client";

import { useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Download, Star, StarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Capacitor } from "@capacitor/core";
import CachedImage from "@/components/ui/CachedImage";

export type GalleryImage = {
  id: string;
  url: string;
  name?: string;
};

interface ImageGalleryProps {
  open: boolean;
  images: GalleryImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onSetCover?: (img: GalleryImage) => void;
  currentCoverUrl?: string;
  onUnsetCover?: () => void;
}

export default function ImageGallery({ open, images, index, onClose, onIndexChange, onSetCover, currentCoverUrl, onUnsetCover }: ImageGalleryProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndexChange(Math.max(0, index - 1));
      if (e.key === "ArrowRight") onIndexChange(Math.min(images.length - 1, index + 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onClose, onIndexChange]);

  if (!open || images.length === 0) return null;

  const current = images[index] ?? images[0];
  const canPrev = index > 0;
  const canNext = index < images.length - 1;

  async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function filenameFromUrl(url: string): string | undefined {
    try {
      // Use a fixed dummy origin solely for parsing; host is irrelevant.
      const u = new URL(url, "https://example.com");
      const last = u.pathname.split("/").filter(Boolean).pop();
      return last || undefined;
    } catch {
      const parts = url.split("/");
      return parts.pop() || undefined;
    }
  }

  function ensureExt(name: string, ext: string) {
    return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
  }

  function buildSafeFsFilename(ext: string): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const base = `moltly-image-${datePart}-${timePart}`;
    const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "bin";
    return ensureExt(base, safeExt);
  }

  function getSafeDownloadHref(rawUrl: string): string | null {
    try {
      if (rawUrl.startsWith("data:")) {
        const mime = rawUrl.slice(5).split(";")[0];
        if (mime.startsWith("image/")) return rawUrl;
        return null;
      }
      // Absolute URLs: require a supported protocol
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawUrl)) {
        const u = new URL(rawUrl);
        if (["http:", "https:", "blob:"].includes(u.protocol)) return u.toString();
        return null;
      }
      // Root‑relative paths: resolve against current origin in the browser
      if (rawUrl.startsWith("/")) {
        if (typeof window === "undefined") return null;
        const u = new URL(rawUrl, window.location.origin);
        if (["http:", "https:"].includes(u.protocol)) return u.toString();
        return null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function handleDownload() {
    const baseName = current.name || filenameFromUrl(current.url) || "image";
    let ext = "jpg";
    if (current.url.startsWith("data:")) {
      const m = current.url.slice(5).split(";")[0];
      if (m.startsWith("image/")) {
        const maybe = m.split("/")[1];
        if (maybe) ext = maybe.toLowerCase();
      }
    } else {
      const fromUrl = filenameFromUrl(current.url);
      const p = fromUrl?.split(".").pop()?.toLowerCase();
      if (p && p.length <= 5) ext = p;
    }
    const downloadFilename = ensureExt(baseName, ext);
    const fsFilename = buildSafeFsFilename(ext);

    if (Capacitor.getPlatform() !== "web") {
      try {
        const modFS = await import("@capacitor/filesystem");
        const modShare = await import("@capacitor/share");
        const { Filesystem, Directory, Encoding } = modFS;
        const { Share } = modShare;

        let base64: string | undefined;
        if (current.url.startsWith("data:")) {
          base64 = current.url.split(",")[1];
        } else {
          const res = await fetch(current.url);
          if (!res.ok) throw new Error("Failed to fetch image");
          const blob = await res.blob();
          const dataUrl = await blobToBase64(blob);
          base64 = dataUrl.split(",")[1];
        }
        if (!base64) throw new Error("Unable to read image");

        await Filesystem.writeFile({
          path: fsFilename,
          data: base64,
          directory: Directory.Cache,
        });
        const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: fsFilename });
        await Share.share({ title: downloadFilename, url: uri, dialogTitle: "Share image" });
        return;
      } catch (e) {
        // Fallback to web download below
      }
    }

    // Web fallback (or native fallback if plugins unavailable)
    const href = getSafeDownloadHref(current.url);
    if (!href) throw new Error("Invalid download URL");

    const a = document.createElement("a");
    a.href = href;
    a.download = downloadFilename;
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    a.click();
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90">
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 text-white">
        <div className="text-sm truncate max-w-[50%]">{current.name || current.url}</div>
        <div className="flex items-center gap-2">
          {onSetCover && currentCoverUrl !== current.url && (
            <button
              type="button"
              onClick={() => onSetCover(current)}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1"
              title="Set as cover"
              aria-label="Set as cover"
            >
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">Set as cover</span>
            </button>
          )}
          {onUnsetCover && currentCoverUrl === current.url && (
            <button
              type="button"
              onClick={() => onUnsetCover()}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-sm flex items-center gap-1"
              title="Unset cover"
              aria-label="Unset cover"
            >
              <StarOff className="w-4 h-4" />
              <span className="hidden sm:inline">Unset cover</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="p-2 rounded bg-white/10 hover:bg-white/20"
            title="Download"
            aria-label="Download image"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded bg-white/10 hover:bg-white/20"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {canPrev && (
          <button
            type="button"
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded bg-white/10 hover:bg-white/20 text-white"
            onClick={() => onIndexChange(index - 1)}
            aria-label="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <CachedImage
          key={current.id}
          src={current.url}
          alt={current.name || "Attachment"}
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
        {canNext && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded bg-white/10 hover:bg-white/20 text-white"
            onClick={() => onIndexChange(index + 1)}
            aria-label="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="p-2 overflow-x-auto bg-black/60">
          <div className="flex items-center gap-2">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onIndexChange(i)}
                className={cn(
                  "shrink-0 w-16 h-16 rounded border",
                  i === index ? "border-white" : "border-white/30 hover:border-white/60"
                )}
                aria-label={`View image ${i + 1}`}
              >
                <CachedImage
                  src={img.url}
                  alt={img.name || `Attachment ${i + 1}`}
                  className="w-full h-full object-cover rounded"
                  draggable={false}
                />
             </button>
           ))}
         </div>
        </div>
      )}
    </div>
  );
}
