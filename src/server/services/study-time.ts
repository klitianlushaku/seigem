/**
 * Active study time tracking (server-only).
 *
 * Records how long a user actually spent in the study experience today, so the
 * dashboard can show "Studimi sot".
 *
 * Design notes:
 *   - The client reports elapsed seconds; the server TOTALS them. A client
 *     cannot set an arbitrary value, only add a bounded increment, so a
 *     manipulated browser cannot inflate the figure without actually waiting.
 *   - Each report is capped, so a single forged request cannot jump the total.
 *   - The day boundary is the server's UTC day, matching quota resets.
 *   - Stored on the user document, which Firestore rules already prevent the
 *     client from writing, so this stays server-owned.
 */
import "server-only";


import { COLLECTIONS, FIELDS } from "@/lib/firebase/collections";
import { serverDayKey } from "@/lib/utils/date";
import { Timestamp, getAdminDb } from "@/server/firebase/admin";

/** Today's accumulated study time. */
export interface StudyTime {
  /** Day the total belongs to, in "YYYY-MM-DD" form. */
  dayKey: string;
  /** Total active seconds today. */
  seconds: number;
}

/**
 * Largest increment accepted in one report (5 minutes).
 *
 * The client flushes every 30 seconds, so anything larger than this is either a
 * very long gap between flushes or a forged request. Capping keeps a single
 * call from being worth much.
 */
export const MAX_REPORT_SECONDS = 300;

function usersCollection() {
  return getAdminDb().collection(COLLECTIONS.users);
}

/** Normalizes a stored value, resetting when the day has rolled over. */
function normalize(raw: unknown, today: string): StudyTime {
  const value = (raw ?? {}) as Record<string, unknown>;

  if (value.dayKey !== today) return { dayKey: today, seconds: 0 };

  const seconds =
    typeof value.seconds === "number" && Number.isFinite(value.seconds)
      ? Math.max(0, Math.floor(value.seconds))
      : 0;

  return { dayKey: today, seconds };
}

/** Reads today's study time without mutating anything. */
export async function getStudyTime(uid: string): Promise<StudyTime> {
  const today = serverDayKey();
  const snapshot = await usersCollection().doc(uid).get();

  if (!snapshot.exists) return { dayKey: today, seconds: 0 };
  return normalize(snapshot.data()?.[FIELDS.studyTime], today);
}

/**
 * Adds an increment of study time, atomically.
 *
 * @param seconds Elapsed seconds reported by the client. Clamped to
 *   [1, MAX_REPORT_SECONDS]; a non-positive or non-finite value is ignored.
 */
export async function addStudyTime(
  uid: string,
  seconds: number,
): Promise<StudyTime> {
  const today = serverDayKey();

  if (!Number.isFinite(seconds) || seconds < 1) {
    return getStudyTime(uid);
  }

  const increment = Math.min(Math.floor(seconds), MAX_REPORT_SECONDS);
  const ref = usersCollection().doc(uid);

  return getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = normalize(snapshot.data()?.[FIELDS.studyTime], today);
    const next: StudyTime = {
      dayKey: today,
      seconds: current.seconds + increment,
    };

    transaction.set(
      ref,
      {
        [FIELDS.studyTime]: { dayKey: next.dayKey, seconds: next.seconds },
        [FIELDS.updatedAt]: Timestamp.now(),
      },
      { merge: true },
    );

    return next;
  });
}

/** Formats a duration as "2h 15m", or "15m" under an hour. */
export function formatStudyDuration(seconds: number): string {
  if (seconds < 60) return "0m";

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
