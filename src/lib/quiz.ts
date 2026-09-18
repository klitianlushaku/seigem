/**
 * Quiz session logic.
 *
 * Pure functions so scoring can be unit-tested without React. The score lives
 * in temporary session state only — the master prompt says it does not need to
 * be permanently saved.
 */
import type { QuizQuestion } from "@/types";

/** One answered question within a session. */
export interface QuizAnswer {
  /** Index of the question in the quiz. */
  questionIndex: number;
  /** The option the student selected. */
  selectedIndex: number;
  /** Whether that selection was correct. */
  correct: boolean;
}

/** The running state of a quiz attempt. */
export interface QuizSession {
  /** Answers recorded so far, in the order they were submitted. */
  answers: QuizAnswer[];
  /** Index of the question currently displayed. */
  currentIndex: number;
}

/** A fresh session starting at the first question. */
export function createQuizSession(): QuizSession {
  return { answers: [], currentIndex: 0 };
}

/**
 * Records an answer for the current question.
 *
 * Re-answering the same question REPLACES the previous answer rather than
 * appending, so going back and changing a selection does not inflate or distort
 * the score.
 */
export function recordAnswer(
  session: QuizSession,
  questionIndex: number,
  selectedIndex: number,
  questions: QuizQuestion[],
): QuizSession {
  const question = questions[questionIndex];
  if (!question) return session;

  const correct = selectedIndex === question.correctOptionIndex;

  const existing = session.answers.findIndex(
    (answer) => answer.questionIndex === questionIndex,
  );

  const answers = [...session.answers];
  const entry: QuizAnswer = { questionIndex, selectedIndex, correct };

  if (existing >= 0) {
    answers[existing] = entry;
  } else {
    answers.push(entry);
  }

  return { ...session, answers };
}

/** Returns the recorded answer for a question, if any. */
export function answerFor(
  session: QuizSession,
  questionIndex: number,
): QuizAnswer | null {
  return (
    session.answers.find((answer) => answer.questionIndex === questionIndex) ??
    null
  );
}

/** Number of questions answered correctly. */
export function scoreOf(session: QuizSession): number {
  return session.answers.reduce(
    (total, answer) => (answer.correct ? total + 1 : total),
    0,
  );
}

/** Final result once every question has been answered. */
export interface QuizResult {
  correct: number;
  total: number;
  /** Percentage 0-100, rounded. */
  percentage: number;
  /** Albanian message describing the outcome. */
  message: string;
}

/** True when every question has an answer. */
export function isComplete(
  session: QuizSession,
  questions: QuizQuestion[],
): boolean {
  return (
    questions.length > 0 &&
    questions.every((_, index) => answerFor(session, index) !== null)
  );
}

/** Builds the final result for a completed quiz. */
export function buildResult(
  session: QuizSession,
  questions: QuizQuestion[],
): QuizResult {
  const total = questions.length;
  const correct = scoreOf(session);
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  return { correct, total, percentage, message: resultMessage(percentage) };
}

/** Albanian feedback for a score. */
export function resultMessage(percentage: number): string {
  if (percentage === 100) return "Përsosur! I ke të gjitha saktë.";
  if (percentage >= 80) return "Shumë mirë! Vazhdo kështu.";
  if (percentage >= 60) return "Mirë, por ka vend për përmirësim.";
  if (percentage >= 40) return "Duhet të përsëritësh materialin.";
  return "Rishiko materialin dhe provo përsëri.";
}

/** Clamps an index into the valid range for a list of the given length. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}
