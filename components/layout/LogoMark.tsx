import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoMarkProps {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
}

export default function LogoMark({ size = 32, className, priority = false, alt = "Moltly logo" }: LogoMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-sm",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/moltly-512.png"
        alt={alt}
        fill
        sizes={`${size}px`}
        className="object-contain"
        priority={priority}
      />
    </span>
  );
}
