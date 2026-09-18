import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[0_8px_18px_rgba(42,124,255,0.38)] hover:bg-accent-soft disabled:hover:bg-accent",
  secondary:
    "dash-tile text-content hover:border-line-strong disabled:hover:border-line",
  ghost: "text-muted hover:text-content",
};

/**
 * Minimal button primitive. No gradients, no animation beyond a colour change.
 * Keeps focus, disabled, and loading states consistent across the app.
 */
export function Button({
  variant = "primary",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
