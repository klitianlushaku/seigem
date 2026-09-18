/**
 * Plan display helpers.
 *
 * Pure functions for rendering plan information, kept free of JSX and of any
 * server import so they can be unit-tested directly. The plan NUMBERS live in
 * `@/config/plans`; nothing here redefines them.
 */
import { PLANS, getPlan, type PlanId } from "@/config/plans";

export { PLANS, getPlan };
export type { PlanId };

/** Remaining daily allowance, as reported by the server. */
export interface RemainingUsageLike {
  documents: number;
  flashcards: number;
  quizQuestions: number;
}

/** One rendered row of the limits table. */
export interface PlanLimitRow {
  /** Albanian label for the metric. */
  label: string;
  /** The plan's daily allowance. */
  limit: number;
  /** How many units are left today (equals `limit` when unknown). */
  remaining: number;
  /** Percentage of the allowance still available, 0-100. */
  percentRemaining: number;
  /** The `usage` field this row reflects. */
  key: keyof RemainingUsageLike;
}

/** Metric definitions in display order, with Albanian labels. */
const ROWS: ReadonlyArray<{ key: keyof RemainingUsageLike; label: string }> = [
  { key: "documents", label: "Dokumente" },
  { key: "flashcards", label: "Flashcards" },
  { key: "quizQuestions", label: "Pyetje kuizi" },
];

/**
 * Computes the limits table rows for a plan.
 *
 * When `remaining` is null (not yet loaded), the full allowance is shown so
 * the UI never displays a misleading zero.
 */
export function usePlanLimitRows(
  planId: PlanId,
  remaining: RemainingUsageLike | null,
): PlanLimitRow[] {
  const limits = getPlan(planId).limits;

  const limitFor: Record<keyof RemainingUsageLike, number> = {
    documents: limits.documentsPerDay,
    flashcards: limits.flashcardsPerDay,
    quizQuestions: limits.quizQuestionsPerDay,
  };

  return ROWS.map(({ key, label }) => {
    const limit = limitFor[key];
    // Clamp into [0, limit]. A negative value would be nonsense, and a value
    // above the limit can occur if a plan was downgraded while counters were
    // already above the new allowance — it must not produce a >100% bar.
    const left = remaining
      ? Math.min(Math.max(0, remaining[key]), limit)
      : limit;

    return {
      key,
      label,
      limit,
      remaining: left,
      percentRemaining: limit > 0 ? Math.round((left / limit) * 100) : 0,
    };
  });
}

/**
 * Formats a remaining-allowance sentence in Albanian.
 * Example: "Të kanë mbetur 2 dokumente për sot."
 */
export function remainingSentence(
  label: string,
  remaining: number,
): string {
  return `Të kanë mbetur ${remaining} ${label.toLowerCase()} për sot.`;
}
