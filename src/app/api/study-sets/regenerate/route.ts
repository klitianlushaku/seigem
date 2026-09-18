/**
 * POST /api/study-sets/regenerate
 *
 * Adds more material to an existing study set.
 *
 * Two modes, decided by whether the client supplied document text:
 *   - With text: the user re-uploaded the original document. The text is used
 *     for this request only and is never persisted.
 *   - Without text: generation uses the saved title, summary, flashcards, and
 *     quiz. If that is insufficient, the user is told to re-upload.
 *
 * Quota is charged against the user's CURRENT plan, and no document unit is
 * consumed when no new document was supplied.
 */
import { NextResponse, type NextRequest } from "next/server";

import { MAX_EXTRACTED_TEXT_CHARS, MAX_TITLE_LENGTH } from "@/config/app";
import { normalizeTitle } from "@/lib/utils/text";
import { requireUser } from "@/server/http/auth-guard";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";
import { errorResponse } from "@/server/http/respond";
import { ApiError } from "@/server/http/errors";
import { runRegeneration } from "@/server/ai/regenerate";
import { getUserPlan } from "@/server/services/users";
import type { GenerationKind } from "@/types";

const VALID_KINDS: readonly GenerationKind[] = ["summary", "flashcards", "quiz"];

/** Parses the request body into a validated regeneration request. */
function parseBody(body: unknown) {
  if (typeof body !== "object" || body === null) {
    throw new ApiError("invalid_request", "Kërkesa nuk është e vlefshme.");
  }

  const record = body as Record<string, unknown>;

  // --- study set id ----------------------------------------------------
  const studySetId =
    typeof record.studySetId === "string" ? record.studySetId.trim() : "";
  if (!studySetId) {
    throw new ApiError("invalid_request", "Mungon identifikuesi i materialit.");
  }

  // --- kinds -----------------------------------------------------------
  if (!Array.isArray(record.kinds) || record.kinds.length === 0) {
    throw new ApiError(
      "invalid_request",
      "Zgjidh të paktën një lloj përmbajtjeje për të gjeneruar.",
    );
  }

  const kinds: GenerationKind[] = [];
  for (const entry of record.kinds) {
    if (typeof entry !== "string" || !VALID_KINDS.includes(entry as GenerationKind)) {
      throw new ApiError("invalid_request", "Lloji i përmbajtjes nuk njihet.");
    }
    const kind = entry as GenerationKind;
    if (!kinds.includes(kind)) kinds.push(kind);
  }

  // --- optional re-uploaded text ---------------------------------------
  // Absent or empty means "generate from saved content".
  let text: string | undefined;
  if (typeof record.text === "string" && record.text.trim()) {
    if (record.text.length > MAX_EXTRACTED_TEXT_CHARS) {
      throw new ApiError(
        "invalid_request",
        `Teksti tejkalon kufirin prej ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString("sq-AL")} karakteresh.`,
      );
    }
    text = record.text;
  }

  // --- optional title ---------------------------------------------------
  const title =
    typeof record.title === "string" && record.title.trim()
      ? normalizeTitle(record.title, MAX_TITLE_LENGTH)
      : undefined;

  // --- optional counts --------------------------------------------------
  const rawCounts =
    typeof record.counts === "object" && record.counts !== null
      ? (record.counts as Record<string, unknown>)
      : {};

  // `exactOptionalPropertyTypes` is on, so optional fields are spread
  // conditionally rather than passed as explicit `undefined`. That applies to
  // nested optional fields too.
  const flashcards = normalizeCount(rawCounts.flashcards);
  const quizQuestions = normalizeCount(rawCounts.quizQuestions);
  const counts: { flashcards?: number; quizQuestions?: number } = {
    ...(flashcards !== undefined ? { flashcards } : {}),
    ...(quizQuestions !== undefined ? { quizQuestions } : {}),
  };

  return {
    studySetId,
    kinds,
    counts,
    ...(text !== undefined ? { text } : {}),
    ...(title !== undefined ? { title } : {}),
  };
}

/**
 * Largest batch a single regeneration may request.
 *
 * The "+3" action sends `BATCH_SIZE`, but the endpoint also accepts explicit
 * counts (used when regenerating from a re-uploaded document), so the ceiling
 * matches the per-set limit the security rules validate.
 */
const MAX_ITEMS_PER_BATCH = 8;

/** Clamps an optional count into [1, 8], returning undefined when absent. */
function normalizeCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const floored = Math.floor(value);
  if (floored < 1) return undefined;
  return Math.min(floored, MAX_ITEMS_PER_BATCH);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);

    // Rate limit before any expensive work, keyed on the verified uid.
    enforceRateLimit(
      "regenerate",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.regenerate,
    );

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("invalid_request", "Kërkesa nuk është e vlefshme.");
    }

    const parsed = parseBody(body);

    // The plan is resolved server-side; the client cannot claim Pro.
    const planId = await getUserPlan(decoded.uid);

    const outcome = await runRegeneration(decoded.uid, planId, parsed);

    return NextResponse.json({
      studySet: {
        id: outcome.studySet.id,
        title: outcome.studySet.title,
        summary: outcome.studySet.summary,
        flashcards: outcome.studySet.flashcards,
        quizQuestions: outcome.studySet.quizQuestions,
        sourceFormat: outcome.studySet.sourceFormat,
        sourceUnits: outcome.studySet.sourceUnits,
        hasSummary: outcome.studySet.hasSummary,
        hasFlashcards: outcome.studySet.hasFlashcards,
        hasQuiz: outcome.studySet.hasQuiz,
      },
      remaining: outcome.remaining,
      plan: planId,
      /** Whether re-uploaded text was used, for the UI message. */
      usedUploadedText: outcome.usedUploadedText,
    });
  } catch (error) {
    return errorResponse(error, "study-sets/regenerate");
  }
}
