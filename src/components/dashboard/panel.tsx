"use client";

/**
 * Dashboard panel.
 *
 * The shared card shell used by every section of the dashboard: a tinted icon
 * tile, a title with a one-line subtitle, an optional header action, and the
 * body. Keeping one shell means every panel lines up and the layout reads as a
 * single grid rather than a pile of unrelated cards.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function Panel({
  id,
  icon: Icon,
  tone = "blue",
  title,
  subtitle,
  action,
  children,
  className,
}: {
  /** Anchor target, so the sidebar can link to a section. */
  id?: string;
  icon: (props: { size?: number }) => ReactNode;
  tone?: "blue" | "purple" | "green" | "orange";
  title: string;
  subtitle: string;
  /** Optional header-right control, e.g. a "see all" link. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      // Scroll margin keeps the sticky-free header from covering the title when
      // arriving via a #section link.
      className={cn(
        "dash-panel flex scroll-mt-6 flex-col rounded-2xl p-4 sm:p-5",
        className,
      )}
    >
      {/*
        `flex-wrap` matters: the flashcards and quiz panels put a "Gjenero më
        shumë" button, a counter and two nav buttons in `action`. Together they
        are ~266px wide and cannot shrink, so on a 320px phone the header used to
        push the whole panel to 511px and the page scrolled sideways. Wrapping
        lets the action drop onto its own line instead.
      */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              TONE_CLASSES[tone],
            )}
          >
            <Icon size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{title}</h2>
            <p className="truncate text-xs text-muted">{subtitle}</p>
          </div>
        </div>
        {action ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {action}
          </div>
        ) : null}
      </header>

      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

/**
 * Tinted tile backgrounds.
 *
 * A flat low-opacity fill of the accent hue. The reference art uses a soft
 * radial sheen here; a solid tint is used instead so the palette stays
 * gradient-free while reading the same at a glance.
 */
const TONE_CLASSES = {
  blue: "bg-stat-blue/12 text-stat-blue",
  purple: "bg-stat-purple/12 text-stat-purple",
  green: "bg-stat-green/12 text-stat-green",
  orange: "bg-stat-orange/12 text-stat-orange",
} as const;
