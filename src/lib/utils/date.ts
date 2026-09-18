/**
 * Server-side date helpers.
 *
 * Daily usage quotas must reset on a consistent server-side day boundary.
 * The browser clock is never trusted, and a user's local timezone is never
 * used to decide when their allowance resets.
 */

/**
 * The timezone used to compute day boundaries.
 *
 * Fixed to UTC so every user's quota resets at the same instant and the
 * behaviour cannot be manipulated by changing the device clock or timezone.
 */
export const SERVER_TIMEZONE = "UTC";

/** Returns the server day key for a given instant, in "YYYY-MM-DD" form. */
export function serverDayKey(at: Date = new Date()): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns true when a stored day key is no longer the current server day. */
export function isStaleDayKey(dayKey: string, at: Date = new Date()): boolean {
  return dayKey !== serverDayKey(at);
}

/**
 * Milliseconds until the next server-day boundary.
 * Used to advertise when a quota will reset.
 */
export function msUntilNextServerDay(at: Date = new Date()): number {
  const next = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return next - at.getTime();
}
