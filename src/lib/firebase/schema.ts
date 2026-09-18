/**
 * Firestore schema definition and privacy contract.
 *
 * This module is the single source of truth for what may be persisted.
 * `firestore.rules` mirrors these rules declaratively; the TypeScript guards
 * below reject forbidden content before any write reaches Firestore.
 *
 * ---------------------------------------------------------------------------
 * PRIVACY CONTRACT
 * ---------------------------------------------------------------------------
 * NEVER persisted, in any collection or field:
 *   - uploaded PDF / Word / PowerPoint file bytes
 *   - the complete extracted document text
 *   - document pages, paragraphs, or slide XML
 *   - any binary/base64 payload of a source document
 *
 * ALLOWED on a study set:
 *   - the document title
 *   - the generated summary, flashcards, and quiz questions/answers
 *   - operational metadata: owner uid, timestamps, model name, presence flags
 *
 * Account metadata (`users/{uid}`) separately holds the subscription plan and
 * daily usage counters. Those are operational fields, not document content.
 * ---------------------------------------------------------------------------
 */

import { MAX_TITLE_LENGTH } from "@/config/app";
import type { Flashcard, QuizQuestion } from "@/types";

/**
 * Maximum flashcards stored on a single study set.
 *
 * Must match the bound validated in `firestore.rules`. The rules engine cannot
 * iterate a list of maps (`.all()` is unsupported), so it validates each index
 * explicitly. Measured against the emulator, a chain deeper than ~10 aborts
 * with "maximum of 1000 expressions to evaluate has been reached", so the cap
 * is deliberately small.
 *
 * The server truncates generated content to this size before writing, so a
 * document can never legitimately carry more.
 */
export const MAX_FLASHCARDS_PER_SET = 8;

/**
 * Maximum quiz questions stored on a single study set.
 * Same bound and same reasoning as {@link MAX_FLASHCARDS_PER_SET}.
 */
export const MAX_QUIZ_QUESTIONS_PER_SET = 8;

/** Maximum summary length, in characters. */
export const MAX_SUMMARY_CHARS = 20_000;

/** Minimum / maximum quiz options per question. */
export const MIN_QUIZ_OPTIONS = 2;
export const MAX_QUIZ_OPTIONS = 6;

/**
 * Field names that must never appear on a persisted document.
 *
 * Checked case-insensitively as substrings against field paths, so
 * `slideXml`, `rawText`, `extractedText`, `fileData`, etc. are all caught.
 */
export const FORBIDDEN_FIELD_PATTERNS: readonly string[] = [
  "rawtext",
  "extractedtext",
  "fulltext",
  "sourcetext",
  "documenttext",
  "pagetext",
  "paragraphs",
  "slidexml",
  "slidetext",
  "filedata",
  "filebytes",
  "binary",
  "base64",
  "blob",
  "buffer",
  "ocrtext",
];

/**
 * Field names that look like a stored file and must be rejected outright.
 * `fileUrl` is included: Seigem never uploads files anywhere, so a download
 * link would contradict the privacy promise.
 */
export const FORBIDDEN_FILE_FIELDS: readonly string[] = [
  "file",
  "fileurl",
  "downloadurl",
  "storagepath",
  "storageurl",
  "gsurl",
];

/** Error thrown when content violates the privacy contract. */
export class PersistenceViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceViolationError";
  }
}

/**
 * Recursively asserts that an object graph contains no forbidden field name
 * and no oversized binary-looking string.
 *
 * @throws {PersistenceViolationError}
 */
export function assertNoForbiddenFields(
  value: unknown,
  path = "",
): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoForbiddenFields(entry, `${path}[${index}]`),
    );
    return;
  }

  if (typeof value !== "object") return;

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    const fieldPath = path ? `${path}.${key}` : key;

    if (FORBIDDEN_FILE_FIELDS.includes(normalized)) {
      throw new PersistenceViolationError(
        `Field "${fieldPath}" looks like a stored file. Seigem never persists uploaded documents.`,
      );
    }

    // Skip the exact field we allow to be large (the summary) — everything
    // else is short by design.
    const isSummaryField = normalized === "summary";

    for (const pattern of FORBIDDEN_FIELD_PATTERNS) {
      if (normalized.includes(pattern)) {
        throw new PersistenceViolationError(
          `Field "${fieldPath}" matches the forbidden pattern "${pattern}". Extracted document text must never be persisted.`,
        );
      }
    }

    // A long base64/hex-looking string is document content in disguise.
    if (!isSummaryField && typeof entry === "string") {
      if (looksLikeEncodedBinary(entry)) {
        throw new PersistenceViolationError(
          `Field "${fieldPath}" contains encoded binary data, which must never be persisted.`,
        );
      }
    }

    assertNoForbiddenFields(entry, fieldPath);
  }
}

/**
 * Heuristic: a long, unbroken run of base64/hex characters with no spaces is
 * almost certainly encoded file content rather than generated study material.
 */
function looksLikeEncodedBinary(value: string): boolean {
  if (value.length < 512) return false;
  // Generated text contains spaces and punctuation; encoded binary does not.
  const hasWhitespace = /\s/.test(value);
  if (hasWhitespace) return false;
  return /^[A-Za-z0-9+/=_-]+$/.test(value);
}

/** Validates a flashcard. Returns an error message, or null when valid. */
export function validateFlashcard(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "flashcard must be an object";
  const card = value as Partial<Flashcard>;

  if (typeof card.question !== "string" || card.question.trim().length === 0) {
    return "flashcard.question must be a non-empty string";
  }
  if (typeof card.answer !== "string" || card.answer.trim().length === 0) {
    return "flashcard.answer must be a non-empty string";
  }
  return null;
}

/** Validates a quiz question. Returns an error message, or null when valid. */
export function validateQuizQuestion(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "quiz question must be an object";
  const question = value as Partial<QuizQuestion>;

  if (typeof question.question !== "string" || question.question.trim().length === 0) {
    return "quizQuestion.question must be a non-empty string";
  }
  if (!Array.isArray(question.options)) {
    return "quizQuestion.options must be an array";
  }
  if (
    question.options.length < MIN_QUIZ_OPTIONS ||
    question.options.length > MAX_QUIZ_OPTIONS
  ) {
    return `quizQuestion.options must contain between ${MIN_QUIZ_OPTIONS} and ${MAX_QUIZ_OPTIONS} entries`;
  }
  if (!question.options.every((option) => typeof option === "string" && option.trim())) {
    return "quizQuestion.options must all be non-empty strings";
  }
  const index = question.correctOptionIndex;
  if (
    typeof index !== "number" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= question.options.length
  ) {
    return "quizQuestion.correctOptionIndex must point at one of the options";
  }
  if (
    question.explanation !== undefined &&
    typeof question.explanation !== "string"
  ) {
    return "quizQuestion.explanation must be a string when present";
  }
  return null;
}

/** Validates a study-set title. Returns an error message, or null when valid. */
export function validateTitle(value: unknown): string | null {
  if (typeof value !== "string") return "title must be a string";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "title must not be empty";
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return `title must be at most ${MAX_TITLE_LENGTH} characters`;
  }
  return null;
}
