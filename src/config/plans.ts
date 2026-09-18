/**
 * Centralized plan configuration for Seigem.
 *
 * This is the single source of truth for plan pricing and daily usage limits.
 * Plan numbers must never be repeated as magic values elsewhere in the code.
 *
 * IMPORTANT: These values are enforced on the server. The client may import
 * them for display purposes only. Never trust a client-side limit check.
 */

/** The three supported subscription plans. */
export type PlanId = "free" | "plus" | "pro";

/** A daily usage quota set for one plan. */
export interface PlanLimits {
  /** Maximum uploaded documents processed per day. */
  readonly documentsPerDay: number;
  /** Maximum flashcards generated per day. */
  readonly flashcardsPerDay: number;
  /** Maximum quiz questions generated per day. */
  readonly quizQuestionsPerDay: number;
}

/** Full definition of a subscription plan. */
export interface PlanDefinition {
  readonly id: PlanId;
  /** Customer-facing plan name, in Albanian. */
  readonly name: string;
  /** Price in euro cents. 0 for the free plan. Kept as an integer to avoid float rounding. */
  readonly priceCents: number;
  /** Price formatted for display, in Albanian. */
  readonly priceLabel: string;
  /** Billing period label, in Albanian. */
  readonly periodLabel: string;
  readonly limits: PlanLimits;
  /**
   * Whether this plan may use the stronger reasoning-capable DeepSeek model.
   * Only Pro qualifies.
   */
  readonly usesProModel: boolean;
}

/** The plan assigned to every newly created account. */
export const DEFAULT_PLAN_ID: PlanId = "free";

/**
 * Plan definitions keyed by plan id.
 * Order matters for pricing-page rendering: free, plus, pro.
 */
export const PLANS: Readonly<Record<PlanId, PlanDefinition>> = {
  free: {
    id: "free",
    name: "Falas",
    priceCents: 0,
    priceLabel: "0€",
    periodLabel: "përgjithmonë",
    limits: {
      documentsPerDay: 2,
      flashcardsPerDay: 3,
      quizQuestionsPerDay: 3,
    },
    usesProModel: false,
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceCents: 599,
    priceLabel: "5.99€",
    periodLabel: "në muaj",
    limits: {
      documentsPerDay: 50,
      flashcardsPerDay: 50,
      quizQuestionsPerDay: 50,
    },
    usesProModel: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 1299,
    priceLabel: "12.99€",
    periodLabel: "në muaj",
    limits: {
      documentsPerDay: 200,
      flashcardsPerDay: 200,
      quizQuestionsPerDay: 200,
    },
    usesProModel: true,
  },
};

/** Plans in display order. */
export const PLAN_ORDER: readonly PlanId[] = ["free", "plus", "pro"];

/** The paid plans, in display order. */
export const PAID_PLAN_IDS: readonly PlanId[] = ["plus", "pro"];

/** Runtime list of valid plan ids, for validating untrusted input. */
const PLAN_IDS: readonly string[] = PLAN_ORDER;

/**
 * Type guard for untrusted values coming from Firestore, webhooks, or requests.
 * Always use this before trusting a plan value.
 */
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_IDS.includes(value);
}

/**
 * Resolves an untrusted value to a valid plan id.
 * Falls back to the free plan instead of throwing.
 */
export function resolvePlanId(value: unknown): PlanId {
  return isPlanId(value) ? value : DEFAULT_PLAN_ID;
}

/** Returns the full definition for a plan. */
export function getPlan(planId: PlanId): PlanDefinition {
  return PLANS[planId];
}

/** Returns the daily limits for a plan. */
export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId].limits;
}

/** The three metered usage categories tracked per user, per day. */
export type UsageMetric = keyof PlanLimits;

/** All metered metrics, for iteration. */
export const USAGE_METRICS: readonly UsageMetric[] = [
  "documentsPerDay",
  "flashcardsPerDay",
  "quizQuestionsPerDay",
];

/**
 * Albanian singular/plural labels per metric, used in quota messages such as
 * "Të kanë mbetur 2 pyetje kuizi për sot."
 */
export const USAGE_METRIC_LABELS: Readonly<
  Record<UsageMetric, { one: string; many: string }>
> = {
  documentsPerDay: { one: "dokument", many: "dokumente" },
  flashcardsPerDay: { one: "flashcard", many: "flashcards" },
  quizQuestionsPerDay: { one: "pyetje kuizi", many: "pyetje kuizi" },
};

/** Returns the correctly inflected Albanian label for a metric and amount. */
export function usageLabel(metric: UsageMetric, amount: number): string {
  const label = USAGE_METRIC_LABELS[metric];
  return amount === 1 ? label.one : label.many;
}
