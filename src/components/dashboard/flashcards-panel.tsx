"use client";

/**
 * Flashcards panel.
 *
 * Dashboard section matching the approved design: the deck header carries the
 * progress counter and previous/next controls, the body shows one card at a
 * time, and the footer offers "Përzie kartat" (shuffle) and "Karta tjetër".
 *
 * Motion: the card flips in 3D when tapped, the two cards behind it shift as
 * the deck advances, and shuffling lifts the stack. All of it is defined in
 * `globals.css` and is disabled for users who prefer reduced motion.
 */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  BulbIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayersIcon,
  ShuffleIcon,
} from "@/components/ui/icons";
import { Panel } from "@/components/dashboard/panel";
import { FlipCard } from "@/components/study/flip-card";
import { useDeck } from "@/components/study/use-deck";
import { cn } from "@/lib/utils/cn";
import type { Flashcard } from "@/types";

/** Most dots to render before collapsing into a simpler indicator. */
const MAX_DOTS = 12;

export function FlashcardsPanel({
  cards,
  tag,
  onRequestMore,
}: {
  cards: Flashcard[];
  /** Short label shown on the card, e.g. the material title. */
  tag?: string | null;
  onRequestMore?: () => void;
}) {
  const deck = useDeck(cards);

  /** Drives the one-shot shuffle animation. */
  const [shuffling, setShuffling] = useState(false);

  useEffect(() => {
    if (!shuffling) return;
    const id = window.setTimeout(() => setShuffling(false), 540);
    return () => window.clearTimeout(id);
  }, [shuffling]);

  // Encouragement line under the deck: how many cards are left in this pass.
  const remainingCards = Math.max(0, deck.total - deck.index - 1);
  const tip =
    remainingCards === 0
      ? "E mbyllët setin! Përsërit për ta forcuar."
      : `Po ecën mirë — edhe ${remainingCards} ${
          remainingCards === 1 ? "kartë" : "karta"
        } dhe e mbyll setin.`;

  return (
    <Panel
      id="flashcards"
      icon={LayersIcon}
      tone="green"
      title="Flashcards"
      subtitle="Mëso në mënyrë të shpejtë dhe efektive."
      action={
        // `flex-wrap` so the button and counter can stack on a narrow phone
        // rather than forcing the panel wider than the viewport.
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onRequestMore ? (
            <Button variant="secondary" onClick={onRequestMore}>
              Gjenero më shumë
            </Button>
          ) : null}
          <span className="text-sm tabular-nums text-muted">
            {deck.total === 0 ? "0 / 0" : `${deck.index + 1} / ${deck.total}`}
          </span>
          <button
            type="button"
            onClick={deck.previous}
            disabled={deck.isFirst}
            aria-label="Karta e mëparshme"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-content disabled:opacity-40"
          >
            <ChevronLeftIcon size={16} />
          </button>
          <button
            type="button"
            onClick={deck.next}
            disabled={deck.isLast}
            aria-label="Karta tjetër"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-content disabled:opacity-40"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>
      }
    >
      {deck.total === 0 || !deck.current ? (
        <p className="py-10 text-center text-sm text-muted">
          Ky material nuk përmban flashcards.
        </p>
      ) : (
        <div className="flex h-full flex-col">
          {/* Card stack: two cards peeking out behind the active one. */}
          <div
            className={cn(
              "relative mx-auto mt-1 w-full max-w-xl",
              shuffling && "deck-shuffling",
            )}
          >
            <span
              aria-hidden="true"
              className="deck-layer absolute inset-x-6 -bottom-2.5 h-6 rounded-2xl border border-line bg-surface-2"
            />
            <span
              aria-hidden="true"
              className="deck-layer absolute inset-x-3 -bottom-1.5 h-6 rounded-2xl border border-line bg-surface-2"
            />

            {/* Keyed by index so navigating replays the entrance animation. */}
            <FlipCard
              key={deck.index}
              flipped={deck.revealed}
              onToggle={deck.toggleReveal}
              label={`Karta ${deck.index + 1} nga ${deck.total}`}
              className="relative"
              front={
                <>
                  {tag ? (
                    <span className="mb-4 max-w-full truncate rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-white">
                      {tag}
                    </span>
                  ) : null}
                  <span className="wrap-break-word text-base font-semibold leading-7">
                    {deck.current.question}
                  </span>
                  <span className="mt-5 text-[11px] text-muted">
                    Kliko për të parë përgjigjen
                  </span>
                </>
              }
              back={
                <>
                  <span className="flashcard-face-label text-accent">
                    Përgjigjja
                  </span>
                  <span className="mt-4 wrap-break-word text-lg font-medium leading-8 text-content sm:text-xl">
                    {deck.current.answer}
                  </span>
                </>
              }
            />
          </div>

          <div className="mt-auto pt-5">
            {/* Deck position */}
            <div className="flex items-center justify-center" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                {deck.total <= MAX_DOTS ? (
                  cards.map((card, position) => (
                    <span
                      key={`${card.question}-${position}`}
                      className={cn(
                        "dot-active h-1.5 rounded-full",
                        position === deck.index
                          ? "w-5 bg-accent"
                          : "w-1.5 bg-line-strong",
                      )}
                    />
                  ))
                ) : (
                  <span className="text-[11px] tabular-nums text-muted">
                    {deck.index + 1} / {deck.total}
                  </span>
                )}
              </span>
            </div>

            {/* Tip and the primary action */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[11px] leading-4 text-muted">
                <BulbIcon size={14} className="shrink-0 text-stat-orange" />
                {tip}
              </p>
              <Button onClick={deck.toggleReveal}>
                {deck.revealed ? "Fshih përgjigjjen" : "Shiko përgjigjen →"}
              </Button>
            </div>

            {/* Secondary deck controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShuffling(true);
                  deck.shuffle();
                }}
              >
                <ShuffleIcon size={15} />
                Përzie kartat
              </Button>

              <Button
                variant="secondary"
                onClick={deck.isLast ? deck.shuffle : deck.next}
              >
                {deck.isLast ? "Rifillo" : "Karta tjetër"}
                <ArrowRightIcon size={15} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
