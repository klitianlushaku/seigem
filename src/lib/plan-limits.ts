/**
 * Plan-limit metering rules.
 *
 * Single source of truth for "what does this request cost against a plan".
 * The plan NUMBERS live in `@/config/plans`; this module owns the mapping from
 * a generation request to the units it consumes.
 *
 * Requirements this implements:
 *   - A request for N flashcards consumes N flashcard units.
 *   - A request for N quiz questions consumes N quiz-question units.
 *   - A processed upload consumes one document unit. A summary generated from
 *     that upload has NO separate counter.
 *   - Nothing may exceed the plan's remaining allowance.
 *
 * Everything here is pure so it can be unit-tested without Firebase. The
 * server-only module `@/server/services/usage` performs the transaction that
 * actually enforces it.
 */
import {
  getPlan,
  type PlanId,
  type UsageMetric,
} from "@/config/plans";
import {
  MAX_FLASHCARDS_PER_SET,
  MAX_QUIZ_QUESTIONS_PER_SET,
} from "@/lib/firebase/schema";
import type { GenerationKind } from "@/types";

/** A single metric the caller wants to consume. */
export interface UsageRequest {
  metric: UsageMetric;
  amount: number;
}

/**
 * How many flashcards/questions a single generation may produce.
 *
 * Bounded by the Firestore rules' validated list length. Requesting more would
 * charge the user for content that cannot be stored.
 */
export const MAX_FLASHCARDS_PER_REQUEST = MAX_FLASHCARDS_PER_SET;
export const MAX_QUIZ_QUESTIONS_PER_REQUEST = MAX_QUIZ_QUESTIONS_PER_SET;

/**
 * Default counts when the client does not specify.
 *
 * Three of each: enough to be useful on the free plan (which allows three per
 * day) while keeping the first generation quick. The user asks for more with
 * the "Gjenero më shumë" action afterwards.
 */
export const DEFAULT_FLASHCARDS = 3;
export const DEFAULT_QUIZ_QUESTIONS = 3;

/** The quantities a client may request. */
export interface RequestedCounts {
  flashcards: number;
  quizQuestions: number;
}

/**
 * Clamps a requested count into the allowed range.
 *
 * Non-numeric or missing values fall back to the default, so a malformed
 * client cannot request a negative amount (which would credit quota) or an
 * unbounded one.
 */
export function normalizeCount(
  value: unknown,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  if (floored < 1) return fallback;
  return Math.min(floored, max);
}

/** Normalizes the counts a request asks for. */
export function normalizeCounts(input: {
  flashcards?: unknown;
  quizQuestions?: unknown;
}): RequestedCounts {
  return {
    flashcards: normalizeCount(
      input.flashcards,
      MAX_FLASHCARDS_PER_REQUEST,
      DEFAULT_FLASHCARDS,
    ),
    quizQuestions: normalizeCount(
      input.quizQuestions,
      MAX_QUIZ_QUESTIONS_PER_REQUEST,
      DEFAULT_QUIZ_QUESTIONS,
    ),
  };
}

/**
 * Maps a generation request to the quota it consumes.
 *
 * - `summary` consumes NOTHING on its own: requirements state that a summary
 *   produced from an already-counted upload needs no separate counter.
 * - `flashcards` consumes exactly the number of cards requested.
 * - `quiz` consumes exactly the number of questions requested.
 *
 * @param kinds    Which outputs were requested.
 * @param counts   How many of each. Ignored for kinds not requested.
 * @param uploads  How many document uploads this request represents. Normally 1
 *                 when processing a newly uploaded document. Pass 0 when the
 *                 document was already counted, e.g. regenerating extra
 *                 material for an existing study set (Task 13).
 */
export function usageRequestsFor(
  kinds: GenerationKind[],
  counts: RequestedCounts,
  uploads: number,
): UsageRequest[] {
  const requests: UsageRequest[] = [];

  // A summary alone is free once the upload has been counted.
  if (uploads > 0) {
    requests.push({ metric: "documentsPerDay", amount: uploads });
  }

  if (kinds.includes("flashcards")) {
    requests.push({
      metric: "flashcardsPerDay",
      amount: counts.flashcards,
    });
  }

  if (kinds.includes("quiz")) {
    requests.push({
      metric: "quizQuestionsPerDay",
      amount: counts.quizQuestions,
    });
  }

  return requests;
}

/** Metrics that would actually be consumed, for messaging and logging. */
export function meteredKinds(requests: UsageRequest[]): UsageMetric[] {
  return requests.map((request) => request.metric);
}

/**
 * Reports whether a plan is allowed to use the stronger DeepSeek model.
 *
 * Delegates to the plan configuration so the answer can never drift from the
 * table that grants it. Only Pro is marked `usesProModel`.
 */
export function planMayUseProModel(planId: PlanId): boolean {
  return getPlan(planId).usesProModel;
}
