"use client";

/**
 * Flip card.
 *
 * A real 3D turn rather than a content swap: both faces stay in the DOM and the
 * card rotates around Y, so revealing an answer feels physical.
 *
 * The motion is three coordinated pieces (all defined in `globals.css`):
 *   - the card turns with a slight overshoot, so it settles rather than stops;
 *   - each face fades up as the turn passes the halfway point, so the text is
 *     never shown edge-on;
 *   - a soft shadow separates the card from the deck beneath it.
 *
 * The whole card is a button, so tapping anywhere works on touch and Enter /
 * Space work on the keyboard. All motion is disabled automatically for users
 * who prefer reduced motion.
 *
 * Give the component a `key` tied to the card index: React then remounts it on
 * navigation, which replays the entrance animation.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function FlipCard({
  flipped,
  onToggle,
  front,
  back,
  label,
  className,
}: {
  flipped: boolean;
  onToggle: () => void;
  front: ReactNode;
  back: ReactNode;
  /** Accessible name, e.g. "Karta 3 nga 20". */
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flip-scene card-enter", className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={flipped}
        aria-label={label}
        className="flip-inner block min-h-76 w-full text-left sm:min-h-84"
        data-flipped={flipped ? "true" : "false"}
      >
        <div className="flip-face flip-face-front flashcard-face flex min-h-76 flex-col items-center justify-center rounded-2xl border border-line px-6 py-10 text-center sm:min-h-84 sm:px-12">
          {/* The inner wrapper is what fades; the face itself must stay opaque
              so the reverse side never shows through. */}
          <div className="flip-face-content flex flex-col items-center">
            {front}
          </div>
        </div>

        <div className="flip-face flip-face-back flashcard-face flex min-h-76 flex-col items-center justify-center overflow-y-auto rounded-2xl border border-line px-6 py-10 text-center sm:min-h-84 sm:px-12">
          <div className="flip-face-content flex flex-col items-center">
            {back}
          </div>
        </div>
      </button>
    </div>
  );
}
