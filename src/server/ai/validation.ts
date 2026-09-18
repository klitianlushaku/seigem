/**
 * Validation for AI generation requests and responses.
 *
 * Two separate concerns:
 *   1. `parseGenerationRequest` — validates what the client sent, before any
 *      quota is consumed or any model is called.
 *   2. `parseStudyContent` — validates what the model returned, before anything
 *      is persisted. A malformed model response must never reach Firestore.
 *
 * Both are strict: unknown fields are rejected rather than ignored, so a
 * compromised or buggy client cannot smuggle extra content (such as raw
 * extracted text) into a persisted document.
 */
import { MAX_EXTRACTED_TEXT_CHARS, MAX_TITLE_LENGTH } from "@/config/app";
import { normalizeCounts } from "@/lib/plan-limits";
import {
  MAX_FLASHCARDS_PER_SET,
  MAX_QUIZ_QUESTIONS_PER_SET,
} from "@/lib/firebase/schema";
import { normalizeTitle } from "@/lib/utils/text";
import type { Flashcard, GenerationKind, QuizQuestion } from "@/types";
import { ApiError } from "@/server/http/errors";

/** A validated generation request from the client. */
export interface GenerationRequest {
  title: string;
  /** Extracted document text. Held in memory only; never persisted. */
  text: string;
  /** Which outputs to produce. At least one. */
  kinds: GenerationKind[];
  /** How many flashcards to produce (already clamped to the allowed range). */
  flashcards: number;
  /** How many quiz questions to produce (already clamped). */
  quizQuestions: number;
  /**
   * How many document uploads this request represents.
   *
   * Exactly one when the user processed a newly uploaded document. Zero when
   * the document was already counted, e.g. generating additional material for
   * a saved study set (Task 13), so the user is not charged twice for the same
   * upload.
   */
  uploads: number;
  /** Source format ("pdf" | "docx" | "pptx"), for the history icon. */
  sourceFormat: string | null;
  /** Page or slide count of the source, for display. */
  sourceUnits: number | null;
}

/** The validated content produced by the model. */
export interface GeneratedContent {
  summary?: string;
  flashcards?: Flashcard[];
  quizQuestions?: QuizQuestion[];
}

const VALID_KINDS: readonly GenerationKind[] = ["summary", "flashcards", "quiz"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an untrusted generation request body.
 *
 * @throws {ApiError} `invalid_request` with an Albanian message.
 */
export function parseGenerationRequest(body: unknown): GenerationRequest {
  if (!isRecord(body)) {
    throw new ApiError("invalid_request", "Kërkesa nuk është e vlefshme.");
  }

  // --- title ---------------------------------------------------------
  if (typeof body.title !== "string") {
    throw new ApiError("invalid_request", "Titulli mungon.");
  }
  const title = normalizeTitle(body.title, MAX_TITLE_LENGTH);
  if (!title) {
    throw new ApiError("invalid_request", "Titulli nuk mund të jetë bosh.");
  }

  // --- text ----------------------------------------------------------
  if (typeof body.text !== "string") {
    throw new ApiError("invalid_request", "Teksti i dokumentit mungon.");
  }
  const text = body.text.trim();
  if (!text) {
    throw new ApiError(
      "no_readable_text",
      "Nuk u gjet tekst i lexueshëm në dokument.",
    );
  }
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new ApiError(
      "invalid_request",
      `Teksti tejkalon kufirin prej ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString("sq-AL")} karakteresh.`,
    );
  }

  // --- kinds ---------------------------------------------------------
  if (!Array.isArray(body.kinds) || body.kinds.length === 0) {
    throw new ApiError(
      "invalid_request",
      "Zgjidh të paktën një lloj përmbajtjeje për të gjeneruar.",
    );
  }

  const kinds: GenerationKind[] = [];
  for (const entry of body.kinds) {
    if (typeof entry !== "string" || !VALID_KINDS.includes(entry as GenerationKind)) {
      throw new ApiError("invalid_request", "Lloji i përmbajtjes nuk njihet.");
    }
    const kind = entry as GenerationKind;
    // De-duplicate so the same kind is never generated twice.
    if (!kinds.includes(kind)) kinds.push(kind);
  }

  // --- requested counts ----------------------------------------------
  // Clamped rather than rejected: a missing or malformed count falls back to a
  // sensible default, and an over-large one is capped at what can be stored.
  // This is what makes "N flashcards costs N units" safe against a client
  // asking for a million.
  const counts = normalizeCounts({
    flashcards: body.flashcards,
    quizQuestions: body.quizQuestions,
  });

  // --- upload accounting ---------------------------------------------
  // Defaults to 1: a first-time generation processes a newly uploaded
  // document. A caller regenerating from an existing study set passes 0 so the
  // same upload is not counted twice.
  const uploads =
    typeof body.uploads === "number" && Number.isFinite(body.uploads)
      ? Math.max(0, Math.floor(body.uploads))
      : 1;

  // --- source metadata ------------------------------------------------
  // Display-only: which format the material came from and how many pages or
  // slides it had. Never source content. An invalid value becomes null rather
  // than failing the request, since this only affects the history icon.
  const sourceFormat =
    typeof body.sourceFormat === "string" &&
    VALID_SOURCE_FORMATS.includes(body.sourceFormat)
      ? body.sourceFormat
      : null;

  const sourceUnits =
    typeof body.sourceUnits === "number" &&
    Number.isInteger(body.sourceUnits) &&
    body.sourceUnits >= 0 &&
    body.sourceUnits <= 10_000
      ? body.sourceUnits
      : null;

  return {
    title,
    text,
    kinds,
    flashcards: counts.flashcards,
    quizQuestions: counts.quizQuestions,
    uploads,
    sourceFormat,
    sourceUnits,
  };
}

/** Source formats a study set may record. */
const VALID_SOURCE_FORMATS: readonly string[] = ["pdf", "docx", "pptx"];

/** Validates the summary portion of a model response. */
function parseSummary(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ApiError("ai_invalid_response", "Përmbledhja e kthyer nuk është tekst.");
  }
  const summary = value.trim();
  if (!summary) return undefined;
  if (summary.length > 20_000) {
    throw new ApiError("ai_invalid_response", "Përmbledhja është shumë e gjatë.");
  }
  return summary;
}

/** Validates the flashcard portion of a model response. */
function parseFlashcards(value: unknown): Flashcard[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new ApiError("ai_invalid_response", "Flashcards nuk janë në formatin e saktë.");
  }

  const cards: Flashcard[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const question = typeof entry.question === "string" ? entry.question.trim() : "";
    const answer = typeof entry.answer === "string" ? entry.answer.trim() : "";
    if (!question || !answer) continue;
    // Truncate rather than reject, so one overlong card does not discard the set.
    cards.push({
      question: question.slice(0, 2000),
      answer: answer.slice(0, 2000),
    });
    if (cards.length >= MAX_FLASHCARDS_PER_SET) break;
  }

  return cards.length > 0 ? cards : undefined;
}

/** Validates the quiz portion of a model response. */
function parseQuizQuestions(value: unknown): QuizQuestion[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new ApiError("ai_invalid_response", "Kuizi nuk është në formatin e saktë.");
  }

  const questions: QuizQuestion[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;

    const question = typeof entry.question === "string" ? entry.question.trim() : "";
    if (!question) continue;

    if (!Array.isArray(entry.options)) continue;
    const options = entry.options
      .filter((option): option is string => typeof option === "string")
      .map((option) => option.trim().slice(0, 500))
      .filter(Boolean);
    if (options.length < 2) continue;

    const index = entry.correctOptionIndex;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= options.length
    ) {
      // A question without a valid correct answer is unusable for study.
      continue;
    }

    const explanation =
      typeof entry.explanation === "string" && entry.explanation.trim()
        ? entry.explanation.trim().slice(0, 2000)
        : undefined;

    questions.push(
      explanation !== undefined
        ? { question: question.slice(0, 2000), options, correctOptionIndex: index, explanation }
        : { question: question.slice(0, 2000), options, correctOptionIndex: index },
    );

    if (questions.length >= MAX_QUIZ_QUESTIONS_PER_SET) break;
  }

  return questions.length > 0 ? questions : undefined;
}

/**
 * Validates the model's structured output.
 *
 * @throws {ApiError} `ai_invalid_response` when the shape is unusable. The
 *   caller must NOT persist anything in that case.
 */
export function parseStudyContent(value: unknown): GeneratedContent {
  if (!isRecord(value)) {
    throw new ApiError(
      "ai_invalid_response",
      "Përgjigjja e modelit nuk ishte në formatin e pritur.",
    );
  }

  const content: GeneratedContent = {};

  const summary = parseSummary(value.summary);
  if (summary !== undefined) content.summary = summary;

  const flashcards = parseFlashcards(value.flashcards);
  if (flashcards !== undefined) content.flashcards = flashcards;

  const quizQuestions = parseQuizQuestions(value.quizQuestions);
  if (quizQuestions !== undefined) content.quizQuestions = quizQuestions;

  if (
    content.summary === undefined &&
    content.flashcards === undefined &&
    content.quizQuestions === undefined
  ) {
    throw new ApiError(
      "ai_invalid_response",
      "Modeli nuk ktheu përmbajtje të përdorshme. Nuk u konsumua kuota.",
    );
  }

  return content;
}
