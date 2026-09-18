/**
 * Merge helpers for study-set content.
 *
 * De-duplication is pure logic with no Firebase or `server-only` dependency, so
 * it lives here and can be unit-tested directly. `@/server/services/study-sets`
 * imports these when appending to a saved set.
 *
 * Why de-duplicate: regeneration adds new material to an existing set. Without
 * this, generating twice would accumulate near-identical cards, making the set
 * tedious to study and eventually crowding out the per-set limit.
 */
import type { Flashcard, QuizQuestion } from "@/types";

/**
 * Normalizes text for comparison: lowercase, collapse whitespace, trim.
 *
 * Applied to the QUESTION only. Two cards that ask the same thing but give
 * different answers are treated as duplicates: showing a student two
 * conflicting answers to one question is worse than omitting the second. The
 * first occurrence — typically the one already saved — wins.
 */
function comparisonKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Removes obvious duplicate flashcards, preserving first-occurrence order. */
export function dedupeFlashcards(cards: Flashcard[]): Flashcard[] {
  const seen = new Set<string>();
  const result: Flashcard[] = [];

  for (const card of cards) {
    const key = comparisonKey(card.question);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }

  return result;
}

/** Removes obvious duplicate quiz questions, preserving first-occurrence order. */
export function dedupeQuizQuestions(questions: QuizQuestion[]): QuizQuestion[] {
  const seen = new Set<string>();
  const result: QuizQuestion[] = [];

  for (const question of questions) {
    const key = comparisonKey(question.question);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(question);
  }

  return result;
}

/**
 * Merges new flashcards into an existing set.
 *
 * Saved cards come first so the user's existing material keeps its position;
 * newly generated cards are appended after any duplicates are dropped.
 */
export function mergeFlashcards(
  existing: Flashcard[],
  incoming: Flashcard[],
  max: number,
): Flashcard[] {
  return dedupeFlashcards([...existing, ...incoming]).slice(0, max);
}

/** Merges new quiz questions into an existing set. */
export function mergeQuizQuestions(
  existing: QuizQuestion[],
  incoming: QuizQuestion[],
  max: number,
): QuizQuestion[] {
  return dedupeQuizQuestions([...existing, ...incoming]).slice(0, max);
}
