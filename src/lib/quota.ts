/**
 * Pure quota calculations.
 *
 * Deliberately free of `server-only` and of any Firebase import so the
 * arithmetic and message formatting can be unit-tested directly. The
 * server-only module `@/server/services/usage` owns the transaction that
 * actually consumes quota and imports these helpers.
 *
 * Keeping the maths here also means there is exactly one implementation of
 * "how many units remain", used by both the enforcement path and the UI.
 */
import {
  getPlanLimits,
  usageLabel,
  type PlanId,
  type UsageMetric,
} from "@/config/plans";

/** Current counters for each metered metric. */
export interface CurrentUsage {
  /** Day key in "YYYY-MM-DD" form, computed server-side. */
  dayKey: string;
  documents: number;
  flashcards: number;
  quizQuestions: number;
}

/** Remaining allowance for each metered metric. */
export interface RemainingUsage {
  dayKey: string;
  documents: number;
  flashcards: number;
  quizQuestions: number;
}

/** The numeric counter fields of {@link CurrentUsage}. */
export type UsageCounterField = "documents" | "flashcards" | "quizQuestions";

/** Maps a metric to its numeric counter field inside the `usage` map. */
export const USAGE_FIELD: Readonly<Record<UsageMetric, UsageCounterField>> = {
  documentsPerDay: "documents",
  flashcardsPerDay: "flashcards",
  quizQuestionsPerDay: "quizQuestions",
};

/** Reads a non-negative integer from an unknown Firestore value. */
export function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/**
 * Normalizes a raw `usage` map.
 *
 * A stale day key means the allowance has reset, so all counters return to
 * zero. This is what enforces the daily reset without a scheduled job.
 */
export function normalizeUsage(raw: unknown, today: string): CurrentUsage {
  const usage = (raw ?? {}) as Record<string, unknown>;

  if (usage.dayKey !== today) {
    return { dayKey: today, documents: 0, flashcards: 0, quizQuestions: 0 };
  }

  return {
    dayKey: today,
    documents: asCount(usage.documents),
    flashcards: asCount(usage.flashcards),
    quizQuestions: asCount(usage.quizQuestions),
  };
}

/** Computes the remaining allowance for a plan given current counters. */
export function computeRemaining(
  plan: PlanId,
  usage: CurrentUsage,
): RemainingUsage {
  const limits = getPlanLimits(plan);

  return {
    dayKey: usage.dayKey,
    documents: Math.max(0, limits.documentsPerDay - usage.documents),
    flashcards: Math.max(0, limits.flashcardsPerDay - usage.flashcards),
    quizQuestions: Math.max(
      0,
      limits.quizQuestionsPerDay - usage.quizQuestions,
    ),
  };
}

/**
 * Checks whether a set of usage requests fits within the remaining allowance.
 *
 * Every request is validated before any is applied, so a batch that is partly
 * over quota is rejected as a whole rather than partially charged.
 *
 * @returns The offending metric and its remaining amount, or null when the
 *   whole batch fits.
 */
export function findQuotaViolation(
  plan: PlanId,
  usage: CurrentUsage,
  requests: Array<{ metric: UsageMetric; amount: number }>,
): { metric: UsageMetric; remaining: number } | null {
  const limits = getPlanLimits(plan);

  for (const request of requests) {
    if (request.amount <= 0) continue;

    const field = USAGE_FIELD[request.metric];
    const limit = limits[request.metric];
    const remaining = Math.max(0, limit - usage[field]);

    if (request.amount > remaining) {
      return { metric: request.metric, remaining };
    }
  }

  return null;
}

/** Applies usage requests to a counter set, returning a new object. */
export function applyUsage(
  usage: CurrentUsage,
  requests: Array<{ metric: UsageMetric; amount: number }>,
): CurrentUsage {
  const next: CurrentUsage = { ...usage };

  for (const request of requests) {
    if (request.amount <= 0) continue;
    const field = USAGE_FIELD[request.metric];
    next[field] = next[field] + request.amount;
  }

  return next;
}

/** Reverses usage requests on a counter set, never going below zero. */
export function reverseUsage(
  usage: CurrentUsage,
  requests: Array<{ metric: UsageMetric; amount: number }>,
): CurrentUsage {
  const next: CurrentUsage = { ...usage };

  for (const request of requests) {
    if (request.amount <= 0) continue;
    const field = USAGE_FIELD[request.metric];
    next[field] = Math.max(0, next[field] - request.amount);
  }

  return next;
}

/**
 * Builds the Albanian quota message, matching the required shape:
 *   "Të kanë mbetur 2 pyetje kuizi për sot."
 */
export function buildQuotaMessage(
  metric: UsageMetric,
  remaining: number,
): string {
  if (remaining <= 0) {
    return `Ke shfrytëzuar të gjitha ${usageLabel(metric, 2)} për sot. Provoni përsëri nesër.`;
  }

  return `Të kanë mbetur ${remaining} ${usageLabel(metric, remaining)} për sot.`;
}
