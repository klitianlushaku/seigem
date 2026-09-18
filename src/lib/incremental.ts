/**
 * Incremental generation planning.
 *
 * After the first pass a study set holds a small batch of flashcards and quiz
 * questions. This module decides whether the user may ask for another "+3" and
 * exactly how many units that request would cost.
 *
 * The user may keep requesting more, in steps, **until the daily plan limit is
 * reached**. Two ceilings apply, and the effective one is the lower:
 *   - the daily quota still remaining on the plan, and
 *   - the space left in the study set itself, which the Firestore rules can
 *     validate (8 items per list).
 *
 * Pure and dependency-free so it can be unit-tested directly.
 */

/** How many items one "+3" request adds. */
export const BATCH_SIZE = 3;

/** What the user can still add, and why. */
export interface IncrementPlan {
  /** Flashcards that can be added right now. Zero when blocked. */
  flashcards: number;
  /** Quiz questions that can be added right now. Zero when blocked. */
  quizQuestions: number;
  /** True when at least one of the two can be added. */
  canAdd: boolean;
  /**
   * Why nothing can be added, in Albanian. Null when `canAdd` is true.
   * Distinguishes the two ceilings, because the remedy differs: one resets
   * tomorrow, the other never frees up for this material.
   */
  reason: string | null;
  /** True when the daily plan limit is what is blocking. */
  blockedByPlan: boolean;
  /** True when the study set is full. */
  blockedBySetSize: boolean;
}

/** Inputs needed to plan the next increment. */
export interface IncrementInputs {
  /** Daily flashcard units still available on the plan. */
  flashcardsRemaining: number;
  /** Daily quiz units still available on the plan. */
  quizQuestionsRemaining: number;
  /** Flashcards already stored on this study set. */
  flashcardsInSet: number;
  /** Quiz questions already stored on this study set. */
  quizQuestionsInSet: number;
  /** Maximum items a study set may hold (validated by the security rules). */
  maxPerSet: number;
}

/** How many units remain for one metric, after both ceilings. */
function headroom(
  planRemaining: number,
  inSet: number,
  maxPerSet: number,
  wants: boolean,
): number {
  if (!wants) return 0;

  const setSpace = Math.max(0, maxPerSet - inSet);
  const planSpace = Math.max(0, planRemaining);
  const available = Math.min(setSpace, planSpace, BATCH_SIZE);

  return available;
}

/**
 * Plans the next increment.
 *
 * @param wants Which kinds the user is asking for.
 */
export function planIncrement(
  inputs: IncrementInputs,
  wants: { flashcards: boolean; quizQuestions: boolean },
): IncrementPlan {
  const flashcards = headroom(
    inputs.flashcardsRemaining,
    inputs.flashcardsInSet,
    inputs.maxPerSet,
    wants.flashcards,
  );
  const quizQuestions = headroom(
    inputs.quizQuestionsRemaining,
    inputs.quizQuestionsInSet,
    inputs.maxPerSet,
    wants.quizQuestions,
  );

  const canAdd = flashcards > 0 || quizQuestions > 0;
  if (canAdd) {
    return {
      flashcards,
      quizQuestions,
      canAdd: true,
      reason: null,
      blockedByPlan: false,
      blockedBySetSize: false,
    };
  }

  const setFull =
    (wants.flashcards && inputs.flashcardsInSet >= inputs.maxPerSet) ||
    (wants.quizQuestions && inputs.quizQuestionsInSet >= inputs.maxPerSet);

  const planEmpty =
    (wants.flashcards && inputs.flashcardsRemaining <= 0) ||
    (wants.quizQuestions && inputs.quizQuestionsRemaining <= 0);

  // The set ceiling is reported first: it does not reset tomorrow, so telling
  // the user to wait would be misleading.
  if (setFull) {
    return {
      flashcards: 0,
      quizQuestions: 0,
      canAdd: false,
      reason: `Ky material ka arritur kufirin prej ${inputs.maxPerSet} kartash ose pyetjesh. Krijo një material të ri për të shtuar më shumë.`,
      blockedByPlan: false,
      blockedBySetSize: true,
    };
  }

  if (planEmpty) {
    return {
      flashcards: 0,
      quizQuestions: 0,
      canAdd: false,
      reason:
        "Ke shfrytëzuar kufirin ditor të planit tënd. Rifreskohet nesër, ose përmirëso planin.",
      blockedByPlan: true,
      blockedBySetSize: false,
    };
  }

  return {
    flashcards: 0,
    quizQuestions: 0,
    canAdd: false,
    reason: "Nuk ka më kuotë të mbetur për këtë veprim.",
    blockedByPlan: false,
    blockedBySetSize: false,
  };
}
