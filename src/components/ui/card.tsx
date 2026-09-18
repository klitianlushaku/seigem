import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Standard card: navy surface, faint border, generous radius.
 *
 * Matches the panel shell used across the dashboard so mixed content lines up.
 * No gradients, no glassmorphism, no hover elevation.
 */
export function Card({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Anchor target, so the shell can scroll to this card. */
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "dash-panel rounded-[22px] p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Inline message used for errors and notices. */
export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        tone === "error"
          ? "border-danger/30 bg-danger/5 text-danger"
          : "border-line bg-surface-2 text-muted",
      )}
    >
      {children}
    </p>
  );
}
