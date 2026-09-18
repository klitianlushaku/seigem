/**
 * Daily usage quota enforcement (server-only).
 *
 * This module is the AUTHORITY on plan limits. Frontend checks are advisory
 * only; every generation request re-checks here, inside a Firestore
 * transaction, so a manipulated client cannot exceed its allowance.
 *
 * Atomicity: read-check-increment happens in one transaction, so two
 * concurrent requests cannot both consume the last remaining unit.
 *
 * Day boundary: counters reset on the server's UTC day (`serverDayKey`), never
 * on the browser clock.
 *
 * The arithmetic lives in `@/lib/quota` (pure, unit-tested); this module owns
 * only the Firestore transaction.
 */
import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import type { PlanId, UsageMetric } from "@/config/plans";
import { COLLECTIONS, FIELDS } from "@/lib/firebase/collections";
import {
  applyUsage,
  buildQuotaMessage,
  computeRemaining,
  findQuotaViolation,
  normalizeUsage,
  reverseUsage,
  type CurrentUsage,
  type RemainingUsage,
} from "@/lib/quota";
import { serverDayKey } from "@/lib/utils/date";
import { getAdminDb } from "@/server/firebase/admin";
import { ApiError } from "@/server/http/errors";

export type { CurrentUsage, RemainingUsage };

/** A single metric the caller wants to consume. */
export interface UsageRequest {
  metric: UsageMetric;
  amount: number;
}

function usersCollection() {
  return getAdminDb().collection(COLLECTIONS.users);
}

/** Serializes counters into the shape stored at `users/{uid}.usage`. */
function toUsageMap(usage: CurrentUsage) {
  return {
    dayKey: usage.dayKey,
    documents: usage.documents,
    flashcards: usage.flashcards,
    quizQuestions: usage.quizQuestions,
  };
}

/**
 * Reads a user's current daily usage without mutating anything.
 * Safe to call for display purposes.
 */
export async function getUsage(uid: string): Promise<CurrentUsage> {
  const today = serverDayKey();
  const snapshot = await usersCollection().doc(uid).get();

  if (!snapshot.exists) {
    return { dayKey: today, documents: 0, flashcards: 0, quizQuestions: 0 };
  }

  return normalizeUsage(snapshot.data()?.[FIELDS.usage], today);
}

/** Reads a user's remaining allowance, for display in the dashboard. */
export async function getRemainingUsage(
  uid: string,
  plan: PlanId,
): Promise<RemainingUsage> {
  return computeRemaining(plan, await getUsage(uid));
}

/**
 * Checks and consumes quota atomically.
 *
 * @throws {ApiError} `quota_exceeded` when the request would exceed the plan,
 *   with an Albanian message stating exactly how many units remain.
 *
 * Nothing is consumed when the check fails, so a rejected request never
 * partially charges the user.
 */
export async function consumeQuota(
  uid: string,
  plan: PlanId,
  requests: UsageRequest[],
): Promise<{ remaining: RemainingUsage; consumed: CurrentUsage }> {
  const today = serverDayKey();
  const ref = usersCollection().doc(uid);

  return getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const usage = normalizeUsage(snapshot.data()?.[FIELDS.usage], today);

    // Validate EVERY metric before consuming any.
    const violation = findQuotaViolation(plan, usage, requests);
    if (violation) {
      throw new ApiError(
        "quota_exceeded",
        buildQuotaMessage(violation.metric, violation.remaining),
      );
    }

    const next = applyUsage(usage, requests);

    transaction.set(
      ref,
      {
        [FIELDS.usage]: toUsageMap(next),
        [FIELDS.updatedAt]: Timestamp.now(),
      },
      { merge: true },
    );

    return { consumed: next, remaining: computeRemaining(plan, next) };
  });
}

/**
 * Refunds quota for a request that failed after consumption.
 *
 * Used when the model fails and no usable result was produced, so the user is
 * not charged for output they never received.
 */
export async function refundQuota(
  uid: string,
  requests: UsageRequest[],
): Promise<void> {
  const today = serverDayKey();
  const ref = usersCollection().doc(uid);

  await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;

    const usage = normalizeUsage(snapshot.data()?.[FIELDS.usage], today);
    const next = reverseUsage(usage, requests);

    transaction.set(
      ref,
      {
        [FIELDS.usage]: toUsageMap(next),
        [FIELDS.updatedAt]: Timestamp.now(),
      },
      { merge: true },
    );
  });
}
