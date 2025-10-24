import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-ring",
  {
    variants: {
      variant: {
        primary: "bg-[rgb(var(--primary))] text-white hover:bg-[rgb(var(--primary-strong))] shadow-sm",
        secondary: "bg-[rgb(var(--bg-muted))] text-[rgb(var(--text))] hover:bg-[rgb(var(--border))] border border-[rgb(var(--border))]",
        ghost: "text-[rgb(var(--text-soft))] hover:bg-[rgb(var(--bg-muted))] hover:text-[rgb(var(--text))]",
        danger: "bg-[rgb(var(--danger))] text-white hover:opacity-90 shadow-sm",
        outline: "border-2 border-[rgb(var(--primary))] text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary-soft))]",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2.5 text-base",
        lg: "px-6 py-3 text-lg",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export default Button;
