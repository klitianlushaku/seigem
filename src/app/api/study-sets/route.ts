/**
 * GET /api/study-sets
 *
 * Lists the authenticated user's saved study sets, newest first.
 *
 * Also supports reading a single set via `?id=` and deleting via DELETE.
 *
 * Security: the owner uid always comes from the verified Firebase token, never
 * from a query parameter. The service additionally filters by ownerUid, so a
 * guessed document id cannot expose another user's content.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/server/http/auth-guard";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";
import { errorResponse } from "@/server/http/respond";
import { ApiError } from "@/server/http/errors";
import {
  deleteStudySet,
  getStudySet,
  listStudySets,
} from "@/server/services/study-sets";

/** Serializes a study set for the client. */
function toPayload(studySet: {
  id: string;
  title: string;
  summary: string | null;
  flashcards: unknown[];
  quizQuestions: unknown[];
  hasSummary: boolean;
  hasFlashcards: boolean;
  hasQuiz: boolean;
  sourceFormat: string | null;
  sourceUnits: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: studySet.id,
    title: studySet.title,
    // Resource flags are what the history list needs to show what exists.
    hasSummary: studySet.hasSummary,
    hasFlashcards: studySet.hasFlashcards,
    hasQuiz: studySet.hasQuiz,
    flashcardCount: studySet.flashcards.length,
    quizQuestionCount: studySet.quizQuestions.length,
    // Display-only source metadata, so the list can show the right icon.
    sourceFormat: studySet.sourceFormat,
    sourceUnits: studySet.sourceUnits,
    createdAt: studySet.createdAt.toISOString(),
    updatedAt: studySet.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);

    enforceRateLimit(
      "history",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.history,
    );

    const id = request.nextUrl.searchParams.get("id");

    // --- Single study set -------------------------------------------------
    if (id) {
      const studySet = await getStudySet(decoded.uid, id);
      if (!studySet) {
        // Same response whether it does not exist or belongs to someone else,
        // so the endpoint cannot be used to probe for valid ids.
        throw new ApiError("not_found", "Materiali nuk u gjet.");
      }

      return NextResponse.json({
        studySet: {
          ...toPayload(studySet),
          summary: studySet.summary,
          flashcards: studySet.flashcards,
          quizQuestions: studySet.quizQuestions,
        },
        /**
         * Reminder for the UI: the original document was never stored, so it
         * cannot be displayed or re-fetched.
         */
        sourceDocumentAvailable: false,
      });
    }

    // --- History list -----------------------------------------------------
    const studySets = await listStudySets(decoded.uid);
    return NextResponse.json({ studySets: studySets.map(toPayload) });
  } catch (error) {
    return errorResponse(error, "study-sets/list");
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);

    enforceRateLimit(
      "history",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.history,
    );

    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      throw new ApiError("invalid_request", "Mungon identifikuesi.");
    }

    const deleted = await deleteStudySet(decoded.uid, id);
    if (!deleted) {
      throw new ApiError("not_found", "Materiali nuk u gjet.");
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error, "study-sets/delete");
  }
}
