"use client";

/**
 * Flashcard deck state.
 *
 * Shared by the dashboard panel and the full study screen so the reveal and
 * navigation rules exist in exactly one place.
 *
 * Two behaviours matter for studying:
 *   - revealing is reset whenever the card changes, so an answer never leaks
 *     onto the next card;
 *   - shuffling restarts from the beginning rather than keeping a stale
 *     position into the new order.
 */
import { useCallback, useMemo, useState } from "react";

import { clampIndex } from "@/lib/quiz";
import type { Flashcard } from "@/types";

export interface Deck {
  /** Position within the current order. */
  index: number;
  total: number;
  /** The card at the current position, or null when the deck is empty. */
  current: Flashcard | null;
  /** True once the answer has been revealed. */
  revealed: boolean;
  isFirst: boolean;
  isLast: boolean;
  goTo: (next: number) => void;
  next: () => void;
  previous: () => void;
  toggleReveal: () => void;
  /** Shuffles the remaining order and returns to the first card. */
  shuffle: () => void;
}

export function useDeck(cards: Flashcard[]): Deck {
  // The deck can be reordered without mutating the source list.
  const [order, setOrder] = useState<number[]>(() =>
    cards.map((_, index) => index),
  );
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // NOTE: there is deliberately no effect that resets when `cards` changes.
  // Callers pass a list that is often a fresh array on every render (e.g.
  // `latest?.flashcards ?? []`), so depending on its identity would reset state
  // in a loop. Instead, give the consuming component a React `key` tied to the
  // study set id, which remounts the deck with clean state.

  const total = cards.length;
  // Regeneration appends cards without remounting the panel. Derive any new
  // positions here so the current deck can reach them immediately.
  const activeOrder = useMemo(() => {
    const nextOrder = [...order];
    const known = new Set(nextOrder);
    for (let position = 0; position < total; position += 1) {
      if (!known.has(position)) nextOrder.push(position);
    }
    return nextOrder;
  }, [order, total]);
  const activeIndex = Math.min(index, Math.max(total - 1, 0));
  const current = cards[activeOrder[activeIndex] ?? 0] ?? null;

  const goTo = useCallback(
    (nextPosition: number) => {
      setIndex(clampIndex(nextPosition, total));
      setRevealed(false);
    },
    [total],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const previous = useCallback(() => goTo(index - 1), [goTo, index]);
  const toggleReveal = useCallback(() => setRevealed((value) => !value), []);

  const shuffle = useCallback(() => {
    setOrder(() => {
      const copy = [...activeOrder];
      // Fisher-Yates, guarded for `noUncheckedIndexedAccess`.
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const a = copy[i];
        const b = copy[j];
        if (a === undefined || b === undefined) continue;
        copy[i] = b;
        copy[j] = a;
      }
      return copy;
    });
    setIndex(0);
    setRevealed(false);
  }, [activeOrder]);

  return {
    index: activeIndex,
    total,
    current,
    revealed,
    isFirst: index === 0,
    isLast: index >= total - 1,
    goTo,
    next,
    previous,
    toggleReveal,
    shuffle,
  };
}
