/**
 * Shared domain types for Seigem.
 */

import type { PlanId } from "@/config/plans";

/** A single flashcard: a prompt and its concise answer. */
export interface Flashcard {
  /** Front side: a clear question or prompt. */
  question: string;
  /** Back side: a short, precise answer. */
  answer: string;
}

/** A single multiple-choice quiz question. */
export interface QuizQuestion {
  question: string;
  /** Exactly four options in the normal case. */
  options: string[];
  /** Index into `options` identifying the single correct answer. */
  correctOptionIndex: number;
  /** Optional short explanation shown after the student answers. */
  explanation?: string;
}

/** The AI-generated study content produced from one document. */
export interface StudyContent {
  summary?: string;
  flashcards?: Flashcard[];
  quizQuestions?: QuizQuestion[];
}

/** Which generation types the user asked for. */
export type GenerationKind = "summary" | "flashcards" | "quiz";

/** Account metadata stored at `users/{uid}`. */
export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
  plan: PlanId;
  planExpiresAt: Date | null;
  whopSubscriptionId: string | null;
  usage: DailyUsage;
}

/** Per-user daily counters used to enforce plan limits. */
export interface DailyUsage {
  /** Day key in "YYYY-MM-DD" form, computed server-side. */
  dayKey: string;
  documents: number;
  flashcards: number;
  quizQuestions: number;
}

/** A persisted study set at `studySets/{studySetId}`. */
export interface StudySet {
  id: string;
  ownerUid: string;
  title: string;
  summary: string | null;
  flashcards: Flashcard[];
  quizQuestions: QuizQuestion[];
  hasSummary: boolean;
  hasFlashcards: boolean;
  hasQuiz: boolean;
  model: string | null;
  /** Format of the source document ("pdf" | "docx" | "pptx"), for display. */
  sourceFormat: string | null;
  /** Page or slide count of the source, for display. */
  sourceUnits: number | null;
  createdAt: Date;
  updatedAt: Date;
}
