/**
 * Albanian date formatting.
 *
 * Kept as plain data rather than `toLocaleDateString` so the output is
 * identical regardless of the runtime's ICU data or the user's locale, and so
 * it can be unit-tested deterministically.
 */

const WEEKDAYS = [
  "E diel",
  "E hënë",
  "E martë",
  "E mërkurë",
  "E enjte",
  "E premte",
  "E shtunë",
] as const;

const MONTHS = [
  "Janar",
  "Shkurt",
  "Mars",
  "Prill",
  "Maj",
  "Qershor",
  "Korrik",
  "Gusht",
  "Shtator",
  "Tetor",
  "Nëntor",
  "Dhjetor",
] as const;

/** Returns the Albanian weekday name, e.g. "E hënë". */
export function albanianWeekday(date: Date): string {
  return WEEKDAYS[date.getDay()] ?? "";
}

/** Returns the Albanian month name, e.g. "Mars". */
export function albanianMonth(date: Date): string {
  return MONTHS[date.getMonth()] ?? "";
}

/** Formats a date as "10 Mars 2025". */
export function albanianDate(date: Date): string {
  return `${date.getDate()} ${albanianMonth(date)} ${date.getFullYear()}`;
}

/** Formats a date as "E hënë" and "10 Mars 2025". */
export function formatAlbanianDate(date: Date): {
  weekday: string;
  full: string;
} {
  return { weekday: albanianWeekday(date), full: albanianDate(date) };
}

/** Parses an ISO string from the API, falling back to the current date. */
export function parseIsoDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Formats a past moment the way the sidebar's recent list reads:
 * "Tani", "12 minuta më parë", "2 orë më parë", "Dje", "3 ditë më parë".
 *
 * `now` is injectable so the output is deterministic under test. A future
 * timestamp (a clock skew between client and server) is reported as "Tani"
 * rather than a negative duration.
 */
export function relativeAlbanianDate(
  value: string | Date,
  now: Date = new Date(),
): string {
  const date = typeof value === "string" ? parseIsoDate(value) : value;
  const diffMs = now.getTime() - date.getTime();

  if (diffMs <= 0) return "Tani";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Tani";
  if (minutes < 60) {
    return minutes === 1 ? "1 minutë më parë" : `${minutes} minuta më parë`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 orë më parë" : `${hours} orë më parë`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return "Dje";
  if (days < 7) return `${days} ditë më parë`;

  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 javë më parë";
  if (weeks < 5) return `${weeks} javë më parë`;

  // Older than a month: an absolute date is more useful than "5 javë më parë".
  return albanianDate(date);
}
