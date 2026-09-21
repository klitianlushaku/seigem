/**
 * Study set persistence (server-side).
 *
 * Writes go through the Admin SDK, which bypasses Security Rules. That makes
 * the validation in this module the last line of defence for the privacy
 * contract, so every write is validated here before it reaches Firestore.
 *
 * What is stored:   title, generated summary, flashcards, quiz questions, and
 *                   operational metadata (owner uid, timestamps, model).
 * What is NOT:      uploaded files, extracted text, pages, paragraphs, slide
 *                   XML, or any binary payload.
 */
import "server-only";


import { MAX_TITLE_LENGTH } from "@/config/app";
import { COLLECTIONS, FIELDS } from "@/lib/firebase/collections";
import {
  MAX_FLASHCARDS_PER_SET,
  MAX_QUIZ_QUESTIONS_PER_SET,
  PersistenceViolationError,
  assertNoForbiddenFields,
  validateFlashcard,
  validateQuizQuestion,
  validateTitle,
} from "@/lib/firebase/schema";
import { FieldValue, Timestamp, getAdminDb } from "@/server/firebase/admin";
import { normalizeTitle } from "@/lib/utils/text";
import type { Flashcard, QuizQuestion, StudySet } from "@/types";

/** Content accepted when creating or updating a study set. */
export interface StudySetContent {
  title: string;
  summary?: string | null;
  flashcards?: Flashcard[];
  quizQuestions?: QuizQuestion[];
  model?: string | null;
  /**
   * The format the study set was generated FROM ("pdf" | "docx" | "pptx").
   *
   * This is metadata about the source, not source content: it lets the history
   * list show the right icon. The file itself is never stored.
   */
  sourceFormat?: string | null;
  /** Page/slide count of the source, for display only. */
  sourceUnits?: number | null;
}

/** Source formats a study set may record. */
const VALID_SOURCE_FORMATS: readonly string[] = ["pdf", "docx", "pptx"];

/** Upper bound for a displayed page/slide count. */
const MAX_SOURCE_UNITS = 10_000;

function studySetsCollection() {
  return getAdminDb().collection(COLLECTIONS.studySets);
}

/** Truncates a list to the bound the security rules can validate. */
function capList<T>(items: T[] | undefined, max: number): T[] {
  if (!items) return [];
  return items.slice(0, max);
}

/**
 * Validates content against the privacy contract and schema.
 *
 * @throws {PersistenceViolationError} when content must not be persisted.
 */
export function validateStudySetContent(content: StudySetContent): void {
  const titleError = validateTitle(content.title);
  if (titleError) {
    throw new PersistenceViolationError(`Invalid title: ${titleError}`);
  }

  // Rejects forbidden field names anywhere in the payload (e.g. a model that
  // smuggled an `extractedText` key into a flashcard).
  assertNoForbiddenFields(content);

  for (const card of content.flashcards ?? []) {
    const error = validateFlashcard(card);
    if (error) throw new PersistenceViolationError(`Invalid flashcard: ${error}`);
  }

  for (const question of content.quizQuestions ?? []) {
    const error = validateQuizQuestion(question);
    if (error) {
      throw new PersistenceViolationError(`Invalid quiz question: ${error}`);
    }
  }

  if (
    content.summary !== undefined &&
    content.summary !== null &&
    content.summary.length > 20_000
  ) {
    throw new PersistenceViolationError("Summary exceeds the maximum length.");
  }

  // Source metadata is display-only, but it is still validated so a malformed
  // value cannot reach Firestore and break the rules' allow-list check.
  if (
    content.sourceFormat !== undefined &&
    content.sourceFormat !== null &&
    !VALID_SOURCE_FORMATS.includes(content.sourceFormat)
  ) {
    throw new PersistenceViolationError(
      `Invalid source format: ${content.sourceFormat}`,
    );
  }

  if (
    content.sourceUnits !== undefined &&
    content.sourceUnits !== null &&
    (!Number.isInteger(content.sourceUnits) ||
      content.sourceUnits < 0 ||
      content.sourceUnits > MAX_SOURCE_UNITS)
  ) {
    throw new PersistenceViolationError("Invalid source unit count.");
  }
}

/**
 * Creates a study set owned by `ownerUid`.
 *
 * The owner is always passed explicitly from the verified auth token — never
 * read from the request body.
 */
export async function createStudySet(
  ownerUid: string,
  content: StudySetContent,
): Promise<StudySet> {
  validateStudySetContent(content);

  const title = normalizeTitle(content.title, MAX_TITLE_LENGTH);
  const summary = content.summary?.trim() ? content.summary : null;
  const flashcards = capList(content.flashcards, MAX_FLASHCARDS_PER_SET);
  const quizQuestions = capList(
    content.quizQuestions,
    MAX_QUIZ_QUESTIONS_PER_SET,
  );

  const now = Timestamp.now();
  const document = {
    [FIELDS.ownerUid]: ownerUid,
    [FIELDS.title]: title,
    [FIELDS.summary]: summary,
    [FIELDS.flashcards]: flashcards.length > 0 ? flashcards : null,
    [FIELDS.quizQuestions]: quizQuestions.length > 0 ? quizQuestions : null,
    // Presence flags must agree with content — the security rules enforce this.
    [FIELDS.hasSummary]: summary !== null,
    [FIELDS.hasFlashcards]: flashcards.length > 0,
    [FIELDS.hasQuiz]: quizQuestions.length > 0,
    [FIELDS.model]: content.model ?? null,
    // Display-only source metadata; never the source content itself.
    [FIELDS.sourceFormat]: content.sourceFormat ?? null,
    [FIELDS.sourceUnits]: content.sourceUnits ?? null,
    [FIELDS.createdAt]: now,
    [FIELDS.updatedAt]: now,
  };

  const ref = await studySetsCollection().add(document);

  return {
    id: ref.id,
    ownerUid,
    title,
    summary,
    flashcards,
    quizQuestions,
    hasSummary: summary !== null,
    hasFlashcards: flashcards.length > 0,
    hasQuiz: quizQuestions.length > 0,
    model: content.model ?? null,
    sourceFormat: content.sourceFormat ?? null,
    sourceUnits: content.sourceUnits ?? null,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
  };
}

/**
 * Lists a user's study sets, newest first.
 * Always filtered by ownerUid — the query is scoped to the caller.
 */
export async function listStudySets(
  ownerUid: string,
  max = 50,
): Promise<StudySet[]> {
  const snapshot = await studySetsCollection()
    .where(FIELDS.ownerUid, "==", ownerUid)
    .orderBy(FIELDS.createdAt, "desc")
    .limit(Math.min(max, 100))
    .get();

  return snapshot.docs.map((doc) => toStudySet(doc.id, doc.data()));
}

/** Reads one study set, returning null when it does not exist or is not owned. */
export async function getStudySet(
  ownerUid: string,
  studySetId: string,
): Promise<StudySet | null> {
  const snapshot = await studySetsCollection().doc(studySetId).get();
  if (!snapshot.exists) return null;

  const data = snapshot.data() ?? {};
  // Defence in depth: the Admin SDK bypasses rules, so ownership is re-checked
  // here rather than relying on the query alone.
  if (data[FIELDS.ownerUid] !== ownerUid) return null;

  return toStudySet(snapshot.id, data);
}

/** Deletes a study set the caller owns. Returns false when not found/owned. */
export async function deleteStudySet(
  ownerUid: string,
  studySetId: string,
): Promise<boolean> {
  const ref = studySetsCollection().doc(studySetId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return false;
  if (snapshot.data()?.[FIELDS.ownerUid] !== ownerUid) return false;

  await ref.delete();
  return true;
}

/**
 * Merges additional flashcards/questions into an existing set, de-duplicated.
 */
export async function appendToStudySet(
  ownerUid: string,
  studySetId: string,
  addition: {
    summary?: string | null;
    flashcards?: Flashcard[];
    quizQuestions?: QuizQuestion[];
    model?: string | null;
  },
): Promise<StudySet | null> {
  const existing = await getStudySet(ownerUid, studySetId);
  if (!existing) return null;

  const flashcards = dedupeFlashcards([
    ...existing.flashcards,
    ...capList(addition.flashcards, MAX_FLASHCARDS_PER_SET),
  ]).slice(0, MAX_FLASHCARDS_PER_SET);

  const quizQuestions = dedupeQuizQuestions([
    ...existing.quizQuestions,
    ...capList(addition.quizQuestions, MAX_QUIZ_QUESTIONS_PER_SET),
  ]).slice(0, MAX_QUIZ_QUESTIONS_PER_SET);

  // Keep the existing summary unless a new one is explicitly supplied.
  const summary = addition.summary?.trim()
    ? addition.summary
    : existing.summary;

  const content: StudySetContent = {
    title: existing.title,
    summary,
    flashcards,
    quizQuestions,
    model: addition.model ?? existing.model,
  };

  validateStudySetContent(content);

  await studySetsCollection().doc(studySetId).set(
    {
      [FIELDS.summary]: content.summary ?? null,
      [FIELDS.flashcards]: flashcards.length > 0 ? flashcards : null,
      [FIELDS.quizQuestions]: quizQuestions.length > 0 ? quizQuestions : null,
      [FIELDS.hasSummary]: Boolean(content.summary),
      [FIELDS.hasFlashcards]: flashcards.length > 0,
      [FIELDS.hasQuiz]: quizQuestions.length > 0,
      [FIELDS.model]: content.model ?? null,
      [FIELDS.updatedAt]: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return getStudySet(ownerUid, studySetId);
}

// De-duplication lives in `@/lib/merge` so it is unit-testable without
// Firebase. Imported for local use and re-exported for existing call sites.
import { dedupeFlashcards, dedupeQuizQuestions } from "@/lib/merge";

export { dedupeFlashcards, dedupeQuizQuestions };

/** Converts a raw Firestore document into a StudySet. */
function toStudySet(id: string, data: Record<string, unknown>): StudySet {
  const rawFlashcards = data[FIELDS.flashcards];
  const rawQuiz = data[FIELDS.quizQuestions];
  const rawSummary = data[FIELDS.summary];
  const rawModel = data[FIELDS.model];

  const flashcards: Flashcard[] = Array.isArray(rawFlashcards)
    ? (rawFlashcards as Flashcard[])
    : [];
  const quizQuestions: QuizQuestion[] = Array.isArray(rawQuiz)
    ? (rawQuiz as QuizQuestion[])
    : [];
  const summary: string | null =
    typeof rawSummary === "string" ? rawSummary : null;
  const model: string | null = typeof rawModel === "string" ? rawModel : null;

  const rawFormat = data[FIELDS.sourceFormat];
  const rawUnits = data[FIELDS.sourceUnits];
  const sourceFormat: string | null =
    typeof rawFormat === "string" && VALID_SOURCE_FORMATS.includes(rawFormat)
      ? rawFormat
      : null;
  const sourceUnits: number | null =
    typeof rawUnits === "number" && Number.isInteger(rawUnits) && rawUnits >= 0
      ? rawUnits
      : null;

  return {
    id,
    ownerUid: String(data[FIELDS.ownerUid] ?? ""),
    title: String(data[FIELDS.title] ?? ""),
    summary,
    flashcards,
    quizQuestions,
    hasSummary: summary !== null,
    hasFlashcards: flashcards.length > 0,
    hasQuiz: quizQuestions.length > 0,
    model,
    sourceFormat,
    sourceUnits,
    createdAt: toDate(data[FIELDS.createdAt]),
    updatedAt: toDate(data[FIELDS.updatedAt]),
  };
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}
