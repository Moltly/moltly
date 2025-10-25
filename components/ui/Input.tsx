import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "w-full max-w-full min-w-0 rounded-[var(--radius)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2.5 text-[rgb(var(--text))] placeholder:text-[rgb(var(--text-subtle))] focus:border-[rgb(var(--primary))] focus:ring-2 focus:ring-[rgb(var(--primary-soft))] focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export default Input;
