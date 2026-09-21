/**
 * User profile persistence.
 *
 * Creates and reads `users/{uid}` documents. Passwords are never stored —
 * authentication is fully delegated to Firebase Authentication.
 *
 * Field layout is defined in `@/lib/firebase/collections` so it cannot drift
 * from the security rules written in Task 5.
 */
import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";

import { DEFAULT_PLAN_ID, isPlanId, type PlanId } from "@/config/plans";
import { entitledPlan } from "@/lib/entitlement";
import { COLLECTIONS, FIELDS } from "@/lib/firebase/collections";
import { FieldValue, Timestamp, getAdminDb } from "@/server/firebase/admin";
import { serverDayKey } from "@/lib/utils/date";

/** Shape returned to the client. Dates are serialized to ISO strings. */
export interface UserProfilePayload {
  uid: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  plan: PlanId;
  usage: {
    dayKey: string;
    documents: number;
    flashcards: number;
    quizQuestions: number;
  };
}

function usersCollection() {
  return getAdminDb().collection(COLLECTIONS.users);
}

/** Converts a Firestore timestamp-ish value to an ISO string. */
function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(0).toISOString();
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Ensures a `users/{uid}` document exists, creating it on first login.
 *
 * New accounts automatically receive the free plan. If the document already
 * exists, the plan is left untouched — a user's paid plan must never be reset
 * by simply logging in again.
 *
 * @returns The current profile payload.
 */
export async function ensureUserProfile(
  decoded: DecodedIdToken,
): Promise<{ profile: UserProfilePayload; created: boolean }> {
  const uid = decoded.uid;
  const ref = usersCollection().doc(uid);
  const snapshot = await ref.get();

  const now = Timestamp.now();

  if (!snapshot.exists) {
    const dayKey = serverDayKey();

    // Only set fields we actually have values for. Firebase omits `undefined`,
    // which keeps documents clean when displayName/email are unavailable.
    const profile: Record<string, unknown> = {
      [FIELDS.uid]: uid,
      [FIELDS.displayName]: decoded.name ?? null,
      [FIELDS.email]: decoded.email ?? null,
      [FIELDS.createdAt]: now,
      [FIELDS.updatedAt]: now,
      [FIELDS.plan]: DEFAULT_PLAN_ID,
      [FIELDS.planExpiresAt]: null,
      [FIELDS.whopSubscriptionId]: null,
      [FIELDS.usage]: {
        dayKey,
        documents: 0,
        flashcards: 0,
        quizQuestions: 0,
      },
    };

    await ref.set(profile);

    return {
      created: true,
      profile: {
        uid,
        displayName: decoded.name ?? null,
        email: decoded.email ?? null,
        createdAt: now.toDate().toISOString(),
        plan: DEFAULT_PLAN_ID,
        usage: { dayKey, documents: 0, flashcards: 0, quizQuestions: 0 },
      },
    };
  }

  const data = snapshot.data() ?? {};

  // Keep the cached identity fields fresh, but never touch plan or usage here.
  const incomingName = decoded.name ?? null;
  const incomingEmail = decoded.email ?? null;
  const updates: Record<string, unknown> = { [FIELDS.updatedAt]: now };
  if (data[FIELDS.displayName] !== incomingName && incomingName !== null) {
    updates[FIELDS.displayName] = incomingName;
  }
  if (data[FIELDS.email] !== incomingEmail && incomingEmail !== null) {
    updates[FIELDS.email] = incomingEmail;
  }
  await ref.update(updates);

  const rawPlan: unknown = data[FIELDS.plan];
  const usage = (data[FIELDS.usage] ?? {}) as Record<string, unknown>;

  return {
    created: false,
    profile: {
      uid,
      displayName:
        incomingName ?? (typeof data[FIELDS.displayName] === "string"
          ? data[FIELDS.displayName]
          : null),
      email:
        incomingEmail ?? (typeof data[FIELDS.email] === "string"
          ? data[FIELDS.email]
          : null),
      createdAt: toIso(data[FIELDS.createdAt]),
      // Defend against a corrupted or hand-edited plan value.
      plan: isPlanId(rawPlan) ? rawPlan : DEFAULT_PLAN_ID,
      usage: {
        dayKey:
          typeof usage.dayKey === "string" ? usage.dayKey : serverDayKey(),
        documents: asCount(usage.documents),
        flashcards: asCount(usage.flashcards),
        quizQuestions: asCount(usage.quizQuestions),
      },
    },
  };
}

/** Reads a user's plan, defaulting to free when the profile is missing. */
export async function getUserPlan(uid: string): Promise<PlanId> {
  const snapshot = await usersCollection().doc(uid).get();
  if (!snapshot.exists) return DEFAULT_PLAN_ID;

  const data = snapshot.data() ?? {};
  const raw: unknown = data[FIELDS.plan];
  const plan = isPlanId(raw) ? raw : DEFAULT_PLAN_ID;

  // A paid plan is a lease, not a permanent flag. Enforcing the recorded end
  // date HERE means a lapsed subscription stops granting the higher quota even
  // if its cancellation webhook never arrived — entitlement self-heals instead
  // of depending on guaranteed delivery.
  const entitled = entitledPlan(plan, toDateOrNull(data[FIELDS.planExpiresAt]));

  if (entitled !== plan) {
    console.warn(
      `[billing] plan "${plan}" for ${uid} has expired; treating as "${entitled}"`,
    );
  }

  return entitled;
}

/** Converts a stored Firestore timestamp to a Date, or null when absent. */
function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

/**
 * Server timestamp helper for writes elsewhere in the app.
 * Re-exported so services share one clock source.
 */
export const serverTimestamp = FieldValue.serverTimestamp;
