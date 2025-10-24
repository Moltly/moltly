import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary-strong))]",
        success: "bg-[rgb(var(--success-soft))] text-[rgb(var(--success))]",
        warning: "bg-[rgb(var(--warning-soft))] text-[rgb(var(--warning))]",
        danger: "bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))]",
        neutral: "bg-[rgb(var(--bg-muted))] text-[rgb(var(--text-soft))]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant, className }))}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

export default Badge;
