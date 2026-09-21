/**
 * Subscription state updates (server-only).
 *
 * Applies a verified billing event to `users/{uid}`. Only this module may
 * change a user's plan, and it is only reachable from the verified webhook
 * handler — never from a frontend redirect.
 *
 * The Admin SDK bypasses Firestore Security Rules, so the writes here are the
 * authoritative ones. Task 5's rules separately prevent a CLIENT from writing
 * `plan`, which is the other half of the guarantee.
 */
import "server-only";


import type { PlanId } from "@/config/plans";
import { COLLECTIONS, FIELDS } from "@/lib/firebase/collections";
import { Timestamp, getAdminDb } from "@/server/firebase/admin";

/** Fields written when a subscription changes. */
export interface SubscriptionUpdate {
  plan: PlanId;
  /** End of the paid period, or null for the free plan. */
  planExpiresAt: Date | null;
  /** Whop subscription id, linking the account to the payment provider. */
  whopSubscriptionId: string | null;
  /** Whether cancellation is scheduled for the end of the paid period. */
  cancelAtPeriodEnd?: boolean;
}

export interface SubscriptionState {
  planExpiresAt: Date | null;
  whopSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
}

function usersCollection() {
  return getAdminDb().collection(COLLECTIONS.users);
}

/**
 * Links a Whop subscription to a Seigem account and applies its plan.
 *
 * @param uid The Firebase uid, resolved from a trusted server-side lookup —
 *   never taken from the webhook body, which an attacker could influence.
 */
export async function applySubscriptionUpdate(
  uid: string,
  update: SubscriptionUpdate,
): Promise<void> {
  const ref = usersCollection().doc(uid);

  await ref.set(
    {
      [FIELDS.plan]: update.plan,
      ...(update.planExpiresAt
        ? { [FIELDS.planExpiresAt]: Timestamp.fromDate(update.planExpiresAt) }
        : update.cancelAtPeriodEnd
          ? {}
          : { [FIELDS.planExpiresAt]: null }),
      [FIELDS.whopSubscriptionId]: update.whopSubscriptionId,
      [FIELDS.cancelAtPeriodEnd]: update.cancelAtPeriodEnd ?? false,
      [FIELDS.updatedAt]: Timestamp.now(),
    },
    { merge: true },
  );

  console.info(
    `[billing] user ${uid} -> plan=${update.plan} expires=${
      update.planExpiresAt?.toISOString() ?? "never"
    }`,
  );
}

/**
 * Downgrades a user to the free plan.
 *
 * Used for expiration and revocation. The Whop subscription id
 * is retained so a later reactivation can be matched to the same account; only
 * the entitlement is removed.
 */
export async function revokeSubscription(uid: string, reason: string): Promise<void> {
  const ref = usersCollection().doc(uid);

  await ref.set(
    {
      [FIELDS.plan]: "free",
      [FIELDS.planExpiresAt]: null,
      [FIELDS.cancelAtPeriodEnd]: false,
      [FIELDS.updatedAt]: Timestamp.now(),
    },
    { merge: true },
  );

  console.info(`[billing] user ${uid} downgraded to free (${reason})`);
}

/** Reads the billing state needed by the settings page and cancellation API. */
export async function getSubscriptionState(
  uid: string,
): Promise<SubscriptionState> {
  const snapshot = await usersCollection().doc(uid).get();
  const data = snapshot.data() ?? {};
  const expires = data[FIELDS.planExpiresAt];

  return {
    planExpiresAt:
      expires instanceof Timestamp
        ? expires.toDate()
        : expires instanceof Date
          ? expires
          : null,
    whopSubscriptionId:
      typeof data[FIELDS.whopSubscriptionId] === "string"
        ? data[FIELDS.whopSubscriptionId]
        : null,
    cancelAtPeriodEnd: data[FIELDS.cancelAtPeriodEnd] === true,
  };
}

/** Records a successful period-end cancellation without removing access. */
export async function markCancellationAtPeriodEnd(
  uid: string,
  planExpiresAt: Date | null,
): Promise<void> {
  await usersCollection().doc(uid).set(
    {
      [FIELDS.cancelAtPeriodEnd]: true,
      ...(planExpiresAt
        ? { [FIELDS.planExpiresAt]: Timestamp.fromDate(planExpiresAt) }
        : {}),
      [FIELDS.updatedAt]: Timestamp.now(),
    },
    { merge: true },
  );
}

/**
 * Clears a stored Whop subscription link that Whop does not recognise.
 *
 * Used when Whop answers 404 for the membership id on the account, which means
 * the link is stale — created outside the normal flow, or recorded incorrectly.
 * Leaving it in place means the account is offered a cancel button that is
 * guaranteed to fail on every attempt, with no way for the customer to fix it.
 *
 * The PLAN IS DELIBERATELY NOT CHANGED. Dropping a link removes a claim about
 * how the subscription is managed; it must never remove access the customer may
 * have paid for. Only a verified webhook revokes entitlement.
 */
export async function clearSubscriptionLink(uid: string): Promise<void> {
  await usersCollection().doc(uid).set(
    {
      [FIELDS.whopSubscriptionId]: null,
      [FIELDS.cancelAtPeriodEnd]: false,
      [FIELDS.updatedAt]: Timestamp.now(),
    },
    { merge: true },
  );

  console.warn(
    `[billing] cleared the stale subscription link for ${uid}; ` +
      "the plan was left unchanged",
  );
}

/** Finds the Seigem uid linked to a Whop subscription id. */
export async function findUidBySubscriptionId(
  subscriptionId: string,
): Promise<string | null> {
  const snapshot = await usersCollection()
    .where(FIELDS.whopSubscriptionId, "==", subscriptionId)
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  return doc ? doc.id : null;
}

/**
 * Resolves the Seigem uid for a webhook.
 *
 * The uid in the checkout metadata is PREFERRED, and trusted.
 *
 * That metadata is written by our own checkout endpoint, from the uid of the
 * caller's verified Firebase token — a client cannot choose it. The webhook
 * carrying it back is signature-verified. So the account id is authoritative
 * twice over, and cannot be forged or aimed at somebody else's account.
 *
 * The stored subscription id is a FALLBACK, for events that arrive without
 * metadata.
 *
 * HISTORY — this cost real customers their plans. The original logic refused the
 * metadata whenever the account already had a DIFFERENT subscription id stored,
 * then fell back to looking the account up by the new subscription id, which by
 * definition matches nothing yet. So a customer who had ever subscribed before —
 * including a cancelled, expired or failed attempt — could never be upgraded
 * again: the metadata was discarded, the fallback found no account, and the paid
 * event was dropped with "PAID EVENT NOT APPLIED". The customer paid and
 * received nothing, repeatedly.
 *
 * @returns The uid, or null when the account genuinely cannot be identified.
 */
export async function resolveWebhookUid(
  subscriptionId: string | null,
  metadataUid: string | null,
): Promise<string | null> {
  if (metadataUid) {
    const snapshot = await usersCollection().doc(metadataUid).get();

    if (snapshot.exists) {
      const stored = snapshot.data()?.[FIELDS.whopSubscriptionId];

      // A disagreement is worth recording — it usually means a previous
      // subscription was replaced — but it is NOT a reason to drop a paid event.
      if (stored && subscriptionId && stored !== subscriptionId) {
        console.warn(
          `[billing] replacing subscription ${stored} with ${subscriptionId} ` +
            `for ${metadataUid}`,
        );
      }

      return metadataUid;
    }

    /*
     * The metadata names an account that has no user document. That is the one
     * case where a legitimate payment cannot be applied, and it is logged at
     * error level because money has moved.
     */
    console.error(
      `[billing] checkout metadata names uid ${metadataUid}, which has no user ` +
        "document; falling back to the stored subscription link",
    );
  }

  if (subscriptionId) {
    return findUidBySubscriptionId(subscriptionId);
  }

  return null;
}
