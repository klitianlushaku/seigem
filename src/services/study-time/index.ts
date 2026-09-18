"use client";

/**
 * Client wrapper for study-time tracking.
 *
 * The browser reports ELAPSED SECONDS only; the server clamps and totals them,
 * so a manipulated client cannot invent study time.
 */

/** Today's accumulated study time. */
export interface StudyTime {
  dayKey: string;
  seconds: number;
}

/** Reads today's total. Returns null when the call fails. */
export async function fetchStudyTime(
  idToken: string,
): Promise<StudyTime | null> {
  try {
    const response = await fetch("/api/study-time", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { studyTime?: StudyTime };
    return body.studyTime ?? null;
  } catch (error) {
    console.error("[study-time] read failed:", error);
    return null;
  }
}

/** Reports an elapsed-time increment. Returns the new total, or null. */
export async function reportStudyTime(
  idToken: string,
  seconds: number,
): Promise<StudyTime | null> {
  try {
    const response = await fetch("/api/study-time", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ seconds }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { studyTime?: StudyTime };
    return body.studyTime ?? null;
  } catch (error) {
    // Tracking is best-effort: a failure must never interrupt studying.
    console.error("[study-time] report failed:", error);
    return null;
  }
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
