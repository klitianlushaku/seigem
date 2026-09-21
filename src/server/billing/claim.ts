/**
 * Claims a freshly purchased subscription without waiting for the webhook.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Whop sends the buyer straight back to us after payment, but grants the plan
 * through a WEBHOOK that arrives separately. So the customer lands on the
 * dashboard having paid, and sees their old plan until that webhook lands — the
 * app could only poll and hope. Activation therefore took as long as Whop's
 * delivery took, which is exactly the "why does it take so long" complaint.
 *
 * Instead of waiting, this asks Whop directly: which memberships does this
 * account own, and are any of them entitled? A single API call, so the plan is
 * active by the time the buyer's dashboard paints.
 *
 * WHY THIS IS SAFE
 * ----------------
 *   - It is authoritative: the answer comes from Whop, with our API key, not
 *     from anything the client sent.
 *   - It only ever GRANTS, and only from a membership whose metadata names THIS
 *     uid. A caller cannot nominate someone else's subscription, so the worst a
 *     forged request achieves is claiming the plan they already paid for.
 *   - It reuses the same `resolveEntitlement` rules as the webhook, so a
 *     cancelled-but-paid subscription keeps access and a lapsed one does not.
 *
 * The webhook remains the source of truth for everything afterwards — this only
 * closes the gap between paying and the webhook arriving.
 */
import "server-only";

import { PLAN_ORDER, type PlanId } from "@/config/plans";
import { readSubscription, resolveEntitlement } from "@/lib/billing";
import { planForWhopProduct, serverEnv } from "@/lib/env/server";
import { applySubscriptionUpdate } from "@/server/billing/subscriptions";

const REQUEST_TIMEOUT_MS = 10_000;

/** What a claim attempt found. */
export interface ClaimResult {
  /** True when a paid entitlement was found and applied. */
  activated: boolean;
  /** The plan now in force for the account. */
  plan: PlanId | null;
  /** The membership that was claimed, for logging. */
  membershipId: string | null;
}

/** Ranks plans so the best entitlement can be chosen. */
function rank(plan: PlanId): number {
  return PLAN_ORDER.indexOf(plan);
}

/** Fetches memberships, optionally narrowed by Whop's own `query` filter. */
async function fetchMemberships(query: string): Promise<unknown[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${serverEnv.whopBaseUrl.replace(/\/+$/, "")}/memberships?first=50${query}`,
      {
        headers: { Authorization: `Bearer ${serverEnv.whopApiKey}` },
        signal: controller.signal,
      },
    );

    if (!response.ok) return [];

    const body = (await response.json()) as { data?: unknown[] };
    return Array.isArray(body.data) ? body.data : [];
  } catch (error) {
    console.warn("[billing] could not list memberships for a claim:", error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Finds and applies this account's best paid entitlement.
 *
 * @param uid The caller's uid, from their verified token.
 * @param email Their email, used only to NARROW the Whop query. A membership is
 *   never claimed on the strength of an email match alone — the uid in its
 *   metadata is what authorises the grant.
 */
export async function claimSubscription(
  uid: string,
  email: string | null,
): Promise<ClaimResult> {
  /*
   * Try the buyer's email first, which is usually the narrowest query, then fall
   * back to recent memberships. Both are filtered by metadata below, so the
   * email is a performance hint and nothing more.
   */
  const seen = new Set<string>();
  const candidates: unknown[] = [];

  for (const query of [
    email ? `&query=${encodeURIComponent(email)}` : null,
    "",
  ]) {
    if (query === null) continue;

    for (const membership of await fetchMemberships(query)) {
      const id =
        typeof membership === "object" && membership !== null
          ? (membership as Record<string, unknown>).id
          : null;

      if (typeof id === "string" && !seen.has(id)) {
        seen.add(id);
        candidates.push(membership);
      }
    }
  }

  /** The best entitlement found that genuinely belongs to this uid. */
  let best: { plan: PlanId; snapshot: ReturnType<typeof readSubscription> } | null = null;

  for (const membership of candidates) {
    const record = membership as Record<string, unknown>;
    const metadata = record.metadata;

    /*
     * AUTHORISATION. Only a membership whose metadata names THIS uid may be
     * claimed. Without this check, a caller could be granted a plan from any
     * subscription the account has ever issued.
     */
    const namesThisAccount =
      typeof metadata === "object" &&
      metadata !== null &&
      (metadata as Record<string, unknown>).seigem_uid === uid;

    if (!namesThisAccount) continue;

    const snapshot = readSubscription(membership);
    const entitlement = resolveEntitlement(snapshot, planForWhopProduct);

    if (entitlement.type !== "grant") continue;

    if (!best || rank(entitlement.plan) > rank(best.plan)) {
      best = { plan: entitlement.plan, snapshot };
    }
  }

  if (!best) {
    return { activated: false, plan: null, membershipId: null };
  }

  /*
   * Applied through the same path the webhook uses, so all its guards still
   * apply — notably that a delayed event from a superseded subscription cannot
   * downgrade an active plan.
   */
  await applySubscriptionUpdate(uid, {
    plan: best.plan,
    planExpiresAt: best.snapshot.expiresAt,
    whopSubscriptionId: best.snapshot.subscriptionId,
    cancelAtPeriodEnd: best.snapshot.cancelAtPeriodEnd,
  });

  console.info(
    `[billing] claimed ${best.snapshot.subscriptionId} for ${uid} -> ${best.plan} ` +
      "(activated without waiting for the webhook)",
  );

  return {
    activated: true,
    plan: best.plan,
    membershipId: best.snapshot.subscriptionId,
  };
}
