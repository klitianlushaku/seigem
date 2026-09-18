/**
 * Coverage of a model response against what was requested.
 *
 * A response can be valid JSON and still not contain everything the user asked
 * for — for example a summary with an empty `flashcards` array. That is the
 * difference between "the document produced no cards" and "the request
 * silently delivered less than was charged for", and the two need different
 * handling: the first should be retried and then reported, the second is simply
 * not allowed to reach the user unnoticed.
 *
 * Pure and dependency-free so the rule can be unit-tested directly.
 */
import type { GenerationKind } from "@/types";

/** True when a value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a response actually carries usable content for one kind.
 *
 * "Usable" means non-empty: a `flashcards` key holding `[]` is treated as
 * absent, because that is what the user experiences.
 */
export function producesKind(value: unknown, kind: GenerationKind): boolean {
  if (!isRecord(value)) return false;

  if (kind === "summary") {
    return typeof value.summary === "string" && value.summary.trim().length > 0;
  }

  if (kind === "flashcards") {
    return Array.isArray(value.flashcards) && value.flashcards.length > 0;
  }

  return Array.isArray(value.quizQuestions) && value.quizQuestions.length > 0;
}

/**
 * Which of the requested kinds the response did NOT deliver.
 *
 * Order follows `kinds`, so messages and logs read in the order the user asked.
 */
export function missingRequestedKinds(
  value: unknown,
  kinds: readonly GenerationKind[],
): GenerationKind[] {
  return kinds.filter((kind) => !producesKind(value, kind));
}

/** Albanian label for a kind, used when telling the user what is missing. */
const KIND_NAMES: Readonly<Record<GenerationKind, string>> = {
  summary: "përmbledhja",
  flashcards: "flashcards",
  quiz: "pyetjet e kuizit",
};

/**
 * Builds the Albanian sentence naming what a document could not produce.
 *
 * Returns null when nothing is missing, so the caller can distinguish "fine"
 * from "nothing to say".
 */
export function missingKindsMessage(
  missing: readonly GenerationKind[],
): string | null {
  if (missing.length === 0) return null;

  const names = missing.map((kind) => KIND_NAMES[kind]);
  const list =
    names.length === 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} dhe ${names[names.length - 1] ?? ""}`;

  return `Nga ky dokument nuk u krijuan ${list}. Provo një dokument më të plotë ose më të detajuar.`;
}
