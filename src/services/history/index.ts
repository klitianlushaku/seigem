"use client";

/**
 * Client wrapper for study-set history and regeneration.
 *
 * The browser reads its own history and requests additional material; all
 * ownership checks happen server-side against the verified token.
 */
import type { Flashcard, GenerationKind, QuizQuestion } from "@/types";

/** A history entry: what was generated, without the full content. */
export interface StudySetSummary {
  id: string;
  title: string;
  hasSummary: boolean;
  hasFlashcards: boolean;
  hasQuiz: boolean;
  flashcardCount: number;
  quizQuestionCount: number;
  /** Source document format ("pdf" | "docx" | "pptx"), for the icon. */
  sourceFormat: string | null;
  /** Page or slide count of the source, for display. */
  sourceUnits: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A full study set, including content. */
export interface StudySetDetail extends StudySetSummary {
  summary: string | null;
  flashcards: Flashcard[];
  quizQuestions: QuizQuestion[];
}

export interface RemainingUsage {
  dayKey: string;
  documents: number;
  flashcards: number;
  quizQuestions: number;
}

/** Discriminated result so callers must handle failure explicitly. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

/** Shared fetch helper that normalizes errors into Albanian messages. */
async function request<T>(
  url: string,
  idToken: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${idToken}`,
        ...init?.headers,
      },
    });
  } catch (error) {
    console.error("[study-sets] network error:", error);
    return {
      ok: false,
      code: "network_error",
      message: "Nuk mund të lidhemi me serverin. Kontrollo internetin.",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      code: "invalid_response",
      message: "Përgjigjja e serverit nuk ishte e vlefshme.",
    };
  }

  if (!response.ok) {
    const parsed = body as { error?: { code?: string; message?: string } };
    return {
      ok: false,
      code: parsed.error?.code ?? "unknown",
      message: parsed.error?.message ?? "Veprimi dështoi. Provo përsëri.",
    };
  }

  return { ok: true, data: body as T };
}

/** Lists the caller's saved study sets. */
export async function fetchHistory(
  idToken: string,
): Promise<ApiResult<{ studySets: StudySetSummary[] }>> {
  return request("/api/study-sets", idToken);
}

/** Reads one study set with its content. */
export async function fetchStudySet(
  idToken: string,
  id: string,
): Promise<ApiResult<{ studySet: StudySetDetail; sourceDocumentAvailable: boolean }>> {
  return request(`/api/study-sets?id=${encodeURIComponent(id)}`, idToken);
}

/** Deletes a study set. */
export async function deleteStudySet(
  idToken: string,
  id: string,
): Promise<ApiResult<{ deleted: boolean }>> {
  return request(`/api/study-sets?id=${encodeURIComponent(id)}`, idToken, {
    method: "DELETE",
  });
}

/**
 * Requests additional material for an existing study set.
 *
 * @param text Re-uploaded document text, when the user supplied it. Omit to
 *   generate from the saved content instead.
 */
export async function regenerateStudySet(
  idToken: string,
  payload: {
    studySetId: string;
    kinds: GenerationKind[];
    text?: string;
    title?: string;
    counts?: { flashcards?: number; quizQuestions?: number };
  },
): Promise<
  ApiResult<{
    studySet: StudySetDetail;
    remaining: RemainingUsage;
    usedUploadedText: boolean;
  }>
> {
  return request("/api/study-sets/regenerate", idToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
