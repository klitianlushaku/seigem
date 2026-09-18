"use client";

/**
 * Interactive flashcard deck.
 *
 * Shows ONE card at a time. Tapping the card (or pressing Enter/Space) flips it
 * in 3D to reveal the answer. Previous/Next controls move through the deck,
 * arrow keys navigate, and progress is shown as "4 / 20".
 *
 * State lives in `useDeck`, shared with the dashboard panel, so the reveal and
 * navigation rules exist in exactly one place. The flip resets when the card
 * changes, so an answer never leaks onto the next card.
 */
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ShuffleIcon } from "@/components/ui/icons";
import { FlipCard } from "@/components/study/flip-card";
import { useDeck } from "@/components/study/use-deck";
import type { Flashcard } from "@/types";

export function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const deck = useDeck(cards);

  /**
   * Keyboard shortcuts. Enter/Space flip via the card button itself; arrows
   * navigate.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Ignore when the user is typing somewhere.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        deck.next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        deck.previous();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deck]);

  if (deck.total === 0) {
    return (
      <p className="text-sm text-muted">
        Ky material nuk përmban flashcards.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress: "4 / 20" as required. */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted" aria-live="polite">
          {deck.index + 1} / {deck.total}
        </p>
        <p className="text-xs text-muted">
          {deck.revealed
            ? "Përgjigjja u shfaq"
            : "Trokit për të shfaqur përgjigjjen"}
        </p>
      </div>

      {/* Simple proportional progress bar. */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${((deck.index + 1) / deck.total) * 100}%` }}
        />
      </div>

      <FlipCard
        key={deck.index}
        flipped={deck.revealed}
        onToggle={deck.toggleReveal}
        label={`Karta ${deck.index + 1} nga ${deck.total}`}
        front={
          <>
            <span className="text-xs uppercase tracking-wide text-muted">
              Pyetja
            </span>
            <span className="mt-2 break-words text-base leading-7">
              {deck.current?.question}
            </span>
            <span className="mt-5 text-sm text-muted">
              E fshehur — trokit për ta shfaqur
            </span>
          </>
        }
        back={
          <>
            <span className="text-xs uppercase tracking-wide text-muted">
              Përgjigjja
            </span>
            <span className="mt-2 break-words text-base leading-7">
              {deck.current?.answer}
            </span>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={deck.previous}
          disabled={deck.isFirst}
        >
          ← Prapa
        </Button>
        <Button variant="secondary" onClick={deck.next} disabled={deck.isLast}>
          Përpara →
        </Button>
        <Button variant="secondary" onClick={deck.shuffle}>
          <ShuffleIcon size={16} />
          Përzie kartat
        </Button>
        <Button variant="ghost" onClick={deck.toggleReveal}>
          {deck.revealed ? "Fshih përgjigjjen" : "Shfaq përgjigjjen"}
        </Button>
      </div>

      <p className="text-xs text-muted">
        Përdor shigjetat ← → për të lëvizur midis kartave.
      </p>
    </div>
  );
}
