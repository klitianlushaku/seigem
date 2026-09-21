/**
 * Admin operations (server-only).
 *
 * Everything here bypasses billing: a plan can be granted or removed without a
 * payment, and a subscription can be cancelled on a customer's behalf. That
 * makes these the most powerful functions in the codebase, so they follow three
 * rules:
 *
 *   1. NEVER trust the caller for anything but identity. The admin's uid comes
 *      from their verified token; the target uid and the plan are validated here
 *      before use.
 *   2. VALIDATE every value. A plan id must be one of the three known plans, and
 *      a uid must look like a uid, before either reaches Firestore or Whop.
 *   3. RECORD every change. Each mutation writes to `adminAudit` with who did it,
 *      to whom, and what changed, because "why is this account Pro?" needs an
 *      answer that does not depend on anyone's memory.
 */
import "server-only";

import { Timestamp } from "firebase-admin/firestore";

import { DEFAULT_PLAN_ID, PLAN_ORDER, isPlanId, type PlanId, PLANS } from "@/config/plans";
import { COLLECTIONS, FIELDS } from "@/lib/firebase/collections";
import { getAdminDb } from "@/server/firebase/admin";
import { ApiError } from "@/server/http/errors";

/** Collection holding the admin audit trail. Never written by a client. */
const AUDIT_COLLECTION = "adminAudit";

/** One row of the admin user list. */
export interface AdminUserRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  plan: PlanId;
  /** Recorded plan expiry, ISO, or null when none. */
  planExpiresAt: string | null;
  /** True when the plan has passed and is no longer granting access. */
  planExpired: boolean;
  whopSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string | null;
  /** Today's usage counters. */
  usage: {
    dayKey: string;
    documents: number;
    flashcards: number;
    quizQuestions: number;
  };
}

/** What an admin did, for the audit trail. */
export interface AdminAuditEntry {
  adminUid: string;
  adminEmail: string | null;
  action: "set_plan" | "cancel_subscription";
  targetUid: string;
  /** Plan before the change, when relevant. */
  previousPlan?: PlanId | null;
  /** Plan after the change, when relevant. */
  nextPlan?: PlanId | null;
  /** Free-text detail, e.g. the membership id a cancel targeted. */
  detail?: string | null;
}

const usersCollection = () => getAdminDb().collection(COLLECTIONS.users);

/** Converts a Firestore timestamp-ish value to an ISO string. */
function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

/** Reads a number, defaulting to zero. */
function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Lists every account, newest first.
 *
 * @param limit Maximum rows. Bounded so a large user base cannot make the admin
 *   page load without limit.
 */
export async function listUsers(limit = 200): Promise<AdminUserRow[]> {
  const snapshot = await usersCollection()
    .orderBy(FIELDS.createdAt, "desc")
    .limit(limit)
    .get();

  const now = Date.now();

  return snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};
    const rawPlan: unknown = data[FIELDS.plan];
    const plan: PlanId = isPlanId(rawPlan) ? rawPlan : DEFAULT_PLAN_ID;
    const expiresIso = toIso(data[FIELDS.planExpiresAt]);
    const usage = (data[FIELDS.usage] ?? {}) as Record<string, unknown>;

    return {
      uid: doc.id,
      email: typeof data[FIELDS.email] === "string" ? data[FIELDS.email] : null,
      displayName:
        typeof data[FIELDS.displayName] === "string" ? data[FIELDS.displayName] : null,
      plan,
      planExpiresAt: expiresIso,
      // A paid plan past its date no longer grants access, even though the stored
      // value still says so. Surfaced so the list does not overstate entitlement.
      planExpired:
        plan !== DEFAULT_PLAN_ID &&
        expiresIso !== null &&
        new Date(expiresIso).getTime() <= now,
      whopSubscriptionId:
        typeof data[FIELDS.whopSubscriptionId] === "string"
          ? data[FIELDS.whopSubscriptionId]
          : null,
      cancelAtPeriodEnd: data[FIELDS.cancelAtPeriodEnd] === true,
      createdAt: toIso(data[FIELDS.createdAt]),
      usage: {
        dayKey: typeof usage.dayKey === "string" ? usage.dayKey : "",
        documents: asCount(usage.documents),
        flashcards: asCount(usage.flashcards),
        quizQuestions: asCount(usage.quizQuestions),
      },
    };
  });
}

/** Writes an audit entry. Never throws: a failed log must not undo the change. */
async function recordAudit(entry: AdminAuditEntry): Promise<void> {
  try {
    await getAdminDb()
      .collection(AUDIT_COLLECTION)
      .add({ ...entry, at: Timestamp.now() });
  } catch (error) {
    console.error("[admin] failed to write the audit entry:", error);
  }
}

/** Returns the stored email for a uid, for the audit trail. */
async function emailFor(uid: string): Promise<string | null> {
  const snapshot = await usersCollection().doc(uid).get();
  const email = snapshot.data()?.[FIELDS.email];
  return typeof email === "string" ? email : null;
}

/** Rejects anything that is not a plausible Firestore uid. */
function assertUid(value: string): void {
  // Firebase uids are alphanumeric, 1-128 characters. Anchored, so a crafted
  // value cannot smuggle a path into the document reference.
  if (!/^[A-Za-z0-9]{1,128}$/.test(value)) {
    throw new ApiError("invalid_request", "Identifikuesi i llogarisë nuk është i vlefshëm.");
  }
}

/**
 * Sets an account's plan directly, bypassing billing.
 *
 * @param admin The acting admin, from their verified token.
 * @param targetUid The account to change.
 * @param plan One of the three known plans.
 * @param days Number of days the grant lasts, or null for no expiry.
 *   A paid plan with no expiry NEVER lapses, so an explicit choice is required
 *   rather than defaulting to permanent.
 */
export async function setUserPlan(
  admin: { uid: string; email?: string | null },
  targetUid: string,
  plan: PlanId,
  days: number | null,
): Promise<void> {
  assertUid(targetUid);

  if (!isPlanId(plan) || !PLAN_ORDER.includes(plan)) {
    throw new ApiError("invalid_request", "Plani i zgjedhur nuk është i vlefshëm.");
  }

  if (days !== null && (!Number.isInteger(days) || days <= 0 || days > 3650)) {
    throw new ApiError("invalid_request", "Kohëzgjatja duhet të jetë midis 1 dhe 3650 ditësh.");
  }

  const ref = usersCollection().doc(targetUid);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new ApiError("not_found", "Llogaria nuk u gjet.");
  }

  const previousRaw: unknown = snapshot.data()?.[FIELDS.plan];
  const previousPlan: PlanId = isPlanId(previousRaw) ? previousRaw : DEFAULT_PLAN_ID;

  const expiresAt =
    plan === DEFAULT_PLAN_ID || days === null
      ? null
      : new Date(Date.now() + days * 86_400_000);

  await ref.set(
    {
      [FIELDS.plan]: plan,
      [FIELDS.planExpiresAt]: expiresAt ? Timestamp.fromDate(expiresAt) : null,
      // A manual grant is not a subscription, so the cancellation flag is cleared
      // rather than left describing a state that no longer applies.
      [FIELDS.cancelAtPeriodEnd]: false,
      [FIELDS.updatedAt]: Timestamp.now(),
    },
    { merge: true },
  );

  await recordAudit({
    adminUid: admin.uid,
    adminEmail: admin.email ?? null,
    action: "set_plan",
    targetUid,
    previousPlan,
    nextPlan: plan,
    detail:
      expiresAt === null
        ? "pa afat"
        : `deri më ${expiresAt.toISOString().slice(0, 10)}`,
  });

  console.info(
    `[admin] ${admin.email ?? admin.uid} set plan for ${targetUid}: ` +
      `${previousPlan} -> ${plan} (${expiresAt ? expiresAt.toISOString() : "no expiry"})`,
  );
}

/**
 * Removes an account's stored subscription link and drops it to free.
 *
 * Used when an admin needs to clear a plan that was granted by mistake, or to
 * detach a subscription without touching Whop. The subscription id is cleared so
 * the account is not left pointing at a membership it no longer has.
 */
export async function clearUserPlan(
  admin: { uid: string; email?: string | null },
  targetUid: string,
): Promise<void> {
  await setUserPlan(admin, targetUid, DEFAULT_PLAN_ID, null);
}

/** Reads the subscription link for a target account. */
export async function subscriptionIdFor(targetUid: string): Promise<string | null> {
  assertUid(targetUid);
  const snapshot = await usersCollection().doc(targetUid).get();
  const value = snapshot.data()?.[FIELDS.whopSubscriptionId];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Records a cancellation an admin performed through Whop. */
export async function recordAdminCancellation(
  admin: { uid: string; email?: string | null },
  targetUid: string,
  subscriptionId: string,
  expiresAt: Date | null,
): Promise<void> {
  await recordAudit({
    adminUid: admin.uid,
    adminEmail: admin.email ?? null,
    action: "cancel_subscription",
    targetUid,
    detail:
      `${subscriptionId}` +
      (expiresAt ? ` — aktiv deri më ${expiresAt.toISOString().slice(0, 10)}` : ""),
  });
}

/** The plan names, for display in the admin UI. */
export const PLAN_LABELS: Readonly<Record<PlanId, string>> = {
  free: PLANS.free.name,
  plus: PLANS.plus.name,
  pro: PLANS.pro.name,
};

export { emailFor };
