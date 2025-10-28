"use client";

import { useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export default function ImageGallery({ open, images, index, onClose, onIndexChange }: ImageGalleryProps) {
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

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90">
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 text-white">
        <div className="text-sm truncate max-w-[60%]">{current.name || current.url}</div>
        <div className="flex items-center gap-2">
          <a
            href={current.url}
            download
            className="p-2 rounded bg-white/10 hover:bg-white/20"
            title="Download"
            aria-label="Download image"
          >
            <Download className="w-5 h-5" />
          </a>
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
        <img
          key={current.id}
          src={current.url}
          alt={current.name || "Attachment"}
          className="max-w-full max-h-full object-contain"
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
                <img src={img.url} alt={img.name || `Attachment ${i + 1}`} className="w-full h-full object-cover rounded" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

