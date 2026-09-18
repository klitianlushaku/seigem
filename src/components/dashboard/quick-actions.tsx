"use client";

/**
 * "Veprime të shpejta" — the quick-actions row.
 *
 * Shortcuts to the handful of things a user does most often, so none of them
 * needs a detour through the sidebar. Every action is a real link or a real
 * in-page action; none is a decorative tile.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import {
  BoltIcon,
  LayersIcon,
  CrownIcon,
  PlusIcon,
  QuizIcon,
} from "@/components/ui/icons";
import { emitAppEvent, NEW_MATERIAL } from "@/lib/app-events";
import { cn } from "@/lib/utils/cn";

/** One shortcut. `href` is omitted for in-page actions. */
interface QuickAction {
  label: string;
  description: string;
  icon: (props: { size?: number }) => ReactNode;
  tone: "blue" | "green" | "orange" | "purple";
  href?: string;
  /** In-page behaviour, used instead of navigation. */
  action?: "new-material";
}

const ACTIONS: readonly QuickAction[] = [
  {
    label: "Material i ri",
    description: "Ngarko një dokument dhe gjenero materiale.",
    icon: PlusIcon,
    tone: "blue",
    action: "new-material",
  },
  {
    label: "Materialet e mia",
    description: "Shiko dhe hap materialet e ruajtura.",
    icon: LayersIcon,
    tone: "green",
    href: "/materialet",
  },
  {
    label: "Provo kuizin",
    description: "Testo njohuritë me pyetjet e ruajtura.",
    icon: QuizIcon,
    tone: "orange",
    href: "/dashboard#kuiz",
  },
  {
    label: "Plani im",
    description: "Shiko kufijtë dhe përmirëso planin.",
    icon: CrownIcon,
    tone: "purple",
    href: "/cmimet",
  },
];

export function QuickActions() {
  /** Clears the uploader and brings it into view. */
  function startNewMaterial() {
    emitAppEvent(NEW_MATERIAL);
    document
      .getElementById("ngarko")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section aria-labelledby="veprime-heading">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stat-blue/12 text-stat-blue">
          <BoltIcon size={16} />
        </span>
        <div className="min-w-0">
          <h2 id="veprime-heading" className="text-[15px] font-semibold">
            Veprime të shpejta
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Kursen kohën, mëso më shpejt.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const className = cn(
            "dash-panel flex items-center gap-3 rounded-2xl p-3.5 text-left transition-colors hover:border-line-strong",
          );

          const inner = (
            <>
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  TONE_CLASSES[action.tone],
                )}
              >
                <Icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">
                  {action.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted">
                  {action.description}
                </span>
              </span>
            </>
          );

          // An in-page action renders a button; a destination renders a link.
          if (action.href) {
            return (
              <Link key={action.label} href={action.href} className={className}>
                {inner}
              </Link>
            );
          }

          return (
            <button
              key={action.label}
              type="button"
              onClick={startNewMaterial}
              className={className}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const TONE_CLASSES = {
  blue: "bg-stat-blue/12 text-stat-blue",
  green: "bg-stat-green/12 text-stat-green",
  orange: "bg-stat-orange/12 text-stat-orange",
  purple: "bg-stat-purple/12 text-stat-purple",
} as const;
