"use client";

/**
 * Client wrapper for the protected generation endpoint.
 *
 * The browser never talks to DeepSeek. It sends extracted text to
 * `/api/generate`, which authenticates the user, re-checks plan limits, and
 * calls the model server-side.
 */
import type { PlanId } from "@/config/plans";
import type { Flashcard, GenerationKind, QuizQuestion } from "@/types";

/** Remaining daily allowance, as reported by the server. */
export interface RemainingUsage {
  dayKey: string;
  documents: number;
  flashcards: number;
  quizQuestions: number;
}

export interface SubscriptionStatus {
  planExpiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
}

/** The saved study set returned after a successful generation. */
export interface GeneratedStudySet {
  id: string;
  title: string;
  summary: string | null;
  flashcards: Flashcard[];
  quizQuestions: QuizQuestion[];
  hasSummary: boolean;
  hasFlashcards: boolean;
  hasQuiz: boolean;
}

export interface GenerationResponse {
  studySet: GeneratedStudySet;
  plan: PlanId;
  remaining: RemainingUsage;
  model: string;
}

/** Result of a generation attempt, discriminated on success. */
export type GenerationOutcome =
  | { ok: true; data: GenerationResponse }
  | { ok: false; message: string; code: string };

/**
 * Calls the generation endpoint.
 *
 * @param idToken Fresh Firebase ID token. Never the raw user object.
 * @param signal  Allows the caller to cancel an in-flight request.
 */
export async function requestGeneration(
  idToken: string,
  payload: {
    title: string;
    text: string;
    kinds: GenerationKind[];
    /** How many flashcards to produce. Consumes this many units. */
    flashcards?: number;
    /** How many quiz questions to produce. Consumes this many units. */
    quizQuestions?: number;
    /** 1 for a new upload, 0 when regenerating from a saved study set. */
    uploads?: number;
    /**
     * Display-only metadata about the source document, so the history list can
     * show the right icon and page count. Never source content.
     */
    sourceFormat?: string | null;
    sourceUnits?: number | null;
  },
  signal?: AbortSignal,
): Promise<GenerationOutcome> {
  let response: Response;

  try {
    response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    // An aborted request is a deliberate user action, not a failure to show.
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, code: "aborted", message: "Gjenerimi u anulua." };
    }
    console.error("[generation] network error:", error);
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
      message:
        parsed.error?.message ?? "Gjenerimi dështoi. Provo përsëri pas pak.",
    };
  }

  return { ok: true, data: body as GenerationResponse };
}

/** Reads the caller's plan and remaining daily allowance. */
export async function fetchRemainingUsage(
  idToken: string,
): Promise<{
  plan: PlanId;
  remaining: RemainingUsage;
  subscription?: SubscriptionStatus;
} | null> {
  try {
    const response = await fetch("/api/generate", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as {
      plan: PlanId;
      remaining: RemainingUsage;
      subscription?: SubscriptionStatus;
    };
  } catch (error) {
    console.error("[generation] failed to read quota:", error);
    return null;
  }
}
