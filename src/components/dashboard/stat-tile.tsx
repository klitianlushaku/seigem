"use client";

/**
 * Dashboard statistic tiles.
 *
 * Each tile shows one headline figure with a tinted icon, a clarifying
 * sub-label, and optionally a progress bar or a row of goal dots — matching the
 * approved design, where the top row reads as four live meters rather than four
 * static numbers.
 *
 * The whole tile is a link when `href` is given, so the chevron in the corner
 * is a real affordance rather than decoration.
 */
import type { ReactNode } from "react";
import Link from "next/link";

import { ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { formatAlbanianDate } from "@/lib/utils/albanian-date";

/** A "6 of 8" style meter shown along the bottom of a tile. */
export interface TileProgress {
  value: number;
  max: number;
}

export function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  sublabel,
  sublabelTone = "muted",
  progress,
  dots,
  dotsFilled = 0,
  href,
  title,
  loading = false,
}: {
  icon: (props: { size?: number }) => ReactNode;
  tone: "purple" | "green" | "orange" | "blue";
  label: string;
  /** The headline figure, already formatted for display. */
  value: string;
  sublabel: string;
  /** Tints the sub-label, e.g. an encouraging "Po ecën mirë!". */
  sublabelTone?: "muted" | "green" | "orange" | "purple";
  /** Optional meter, rendered with its "value/max" figure. */
  progress?: TileProgress;
  /** Optional row of goal dots, e.g. a 10-minute study target. */
  dots?: number;
  /** How many of `dots` are filled. */
  dotsFilled?: number;
  /** When set, the tile links here and shows a chevron. */
  href?: string;
  /** Tooltip explaining exactly what the number counts. */
  title?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              TONE_CLASSES[tone],
            )}
          >
            <Icon size={16} />
          </span>
          <span className="truncate text-[12px] font-semibold tracking-tight">
            {label}
          </span>
        </div>

        {href ? (
          <ChevronRightIcon
            size={16}
            className="shrink-0 text-muted"
          />
        ) : null}
      </div>

      <p className="mt-2 text-2xl font-semibold leading-none tracking-tight">
        {loading ? "…" : value}
      </p>

      <p
        className={cn(
          "mt-1.5 text-[10px] leading-4",
          SUBLABEL_TONES[sublabelTone],
        )}
      >
        {sublabel}
      </p>

      {progress ? (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <span
              className={cn("block h-full rounded-full", BAR_TONES[tone])}
              style={{ width: `${percentOf(progress)}%` }}
            />
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted">
            {progress.value}/{progress.max}
          </span>
        </div>
      ) : null}

      {dots ? (
        <div className="mt-2.5 flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: dots }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                index < dotsFilled ? TONE_DOTS[tone] : "bg-line-strong",
              )}
            />
          ))}
        </div>
      ) : null}
    </>
  );

  const shell = cn(
    "dash-tile block rounded-xl p-3",
    href && "transition-colors hover:border-line-strong",
  );

  if (href) {
    return (
      <Link href={href} className={shell} title={title}>
        {body}
      </Link>
    );
  }

  return (
    <div className={shell} title={title}>
      {body}
    </div>
  );
}

/** Clamps a progress pair into a whole-number percentage. */
function percentOf({ value, max }: TileProgress): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

/** Flat low-opacity accent fills; the palette stays gradient-free. */
const TONE_CLASSES = {
  purple: "bg-stat-purple/12 text-stat-purple",
  green: "bg-stat-green/12 text-stat-green",
  orange: "bg-stat-orange/12 text-stat-orange",
  blue: "bg-stat-blue/12 text-stat-blue",
} as const;

/** Solid fills for the meter inside a tile. */
const BAR_TONES = {
  purple: "bg-stat-purple",
  green: "bg-stat-green",
  orange: "bg-stat-orange",
  blue: "bg-stat-blue",
} as const;

const TONE_DOTS = {
  purple: "bg-stat-purple",
  green: "bg-stat-green",
  orange: "bg-stat-orange",
  blue: "bg-stat-blue",
} as const;

const SUBLABEL_TONES = {
  muted: "text-muted",
  green: "text-stat-green",
  orange: "text-stat-orange",
  purple: "text-stat-purple",
} as const;

/**
 * The date tile that sits beside the statistics.
 *
 * Kept even though the dashboard's top row no longer renders it: it is a
 * self-contained presentational block used where an explicit calendar anchor
 * reads better than a counter.
 */
export function DateTile({ date = new Date() }: { date?: Date }) {
  const { weekday, full } = formatAlbanianDate(date);

  return (
    <div className="dash-tile rounded-xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
        {weekday}
      </p>
      <p className="mt-2 text-base font-semibold tracking-tight">{full}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted">
        Vazhdo këtu!
        <br />
        Çdo ditë ka rëndësi!
      </p>
    </div>
  );
}
