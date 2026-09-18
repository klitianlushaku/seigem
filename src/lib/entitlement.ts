/**
 * Plan entitlement.
 *
 * Decides which plan a user is entitled to RIGHT NOW, which is not always the
 * plan recorded on their profile: a paid plan is a lease that ends when its
 * billing period does.
 *
 * Why this exists separately from the stored value:
 *   - Whop is the source of truth for WHEN a subscription ends, but delivery of
 *     its webhooks is not guaranteed. A dropped `membership.expired` /
 *     `canceled` / failed retry would otherwise leave a lapsed customer with
 *     Plus or Pro indefinitely — they keep the higher quota and pay nothing.
 *   - Checking the expiry on every read makes entitlement self-healing: the
 *     moment the period ends, the paid plan stops applying, whether or not the
 *     downgrade webhook ever arrived.
 *
 * Pure and dependency-free so the boundary can be unit-tested exactly.
 */
import { DEFAULT_PLAN_ID, type PlanId } from "@/config/plans";

/**
 * Resolves the plan a user is entitled to.
 *
 * @param plan      The plan recorded on the profile.
 * @param expiresAt End of the paid period, or null when none is recorded.
 * @param now       Injectable clock, so the boundary is deterministic in tests.
 */
export function entitledPlan(
  plan: PlanId,
  expiresAt: Date | null,
  now: Date = new Date(),
): PlanId {
  // The free plan has nothing to expire.
  if (plan === DEFAULT_PLAN_ID) return plan;

  // A paid plan with no recorded end date is treated as active. That covers
  // lifetime grants and plans applied manually; only a KNOWN expiry can revoke.
  if (!expiresAt) return plan;

  // Expiry is inclusive: the moment the period ends, the entitlement is gone.
  return expiresAt.getTime() <= now.getTime() ? DEFAULT_PLAN_ID : plan;
}

/** True when a paid plan's period has ended. */
export function isPlanExpired(
  expiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}
