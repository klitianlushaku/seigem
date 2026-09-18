/**
 * Generation orchestration (server-only).
 *
 * Coordinates the whole server side of a generation request:
 *   1. validate the request body
 *   2. re-check plan limits on the server (frontend checks are not trusted)
 *   3. consume quota atomically
 *   4. call the AI provider
 *   5. validate the structured response
 *   6. persist only the title and generated content
 *   7. refund quota if generation failed and nothing usable was produced
 *
 * The model call itself lives in `./deepseek` and is implemented in Task 9.
 * This module depends only on that narrow interface, so the workflow can be
 * tested without any API credentials.
 */
import "server-only";

import { getPlan, type PlanId } from "@/config/plans";
import { usageRequestsFor } from "@/lib/plan-limits";
import { ApiError } from "@/server/http/errors";
import { createStudySet } from "@/server/services/study-sets";
import {
  consumeQuota,
  getRemainingUsage,
  refundQuota,
  type RemainingUsage,
  type UsageRequest,
} from "@/server/services/usage";
import type { StudySet } from "@/types";

import { parseGenerationRequest, parseStudyContent } from "./validation";
import { generateStudyContent } from "./client";

/** Outcome of a completed generation. */
export interface GenerationOutcome {
  studySet: StudySet;
  remaining: RemainingUsage;
  model: string;
}

/**
 * Maps a generation request to the quota it consumes.
 *
 * Delegates to `@/lib/plan-limits`, which owns the metering rules (and is
 * unit-tested independently). Kept as a re-export so existing callers do not
 * need to change.
 */
export { usageRequestsFor, meteredKinds } from "@/lib/plan-limits";

/**
 * Runs a full generation request for an authenticated user.
 *
 * @param ownerUid From the verified Firebase token. Never from the body.
 * @param planId   Resolved server-side from the user's profile.
 * @param body     Untrusted request body.
 */
export async function runGeneration(
  ownerUid: string,
  planId: PlanId,
  body: unknown,
): Promise<GenerationOutcome> {
  // 1. Validate the request before touching quota or the model.
  const request = parseGenerationRequest(body);

  // 2. Work out what this request costs against the user's plan:
  //      - one document unit per processed upload
  //      - N flashcard units for N requested flashcards
  //      - N quiz units for N requested questions
  //      - summaries are not separately metered
  const usageRequests = usageRequestsFor(
    request.kinds,
    {
      flashcards: request.flashcards,
      quizQuestions: request.quizQuestions,
    },
    request.uploads,
  );

  // 3. Consume quota atomically. Throws `quota_exceeded` (with an Albanian
  //    message stating the remaining allowance) without charging anything.
  await consumeQuota(ownerUid, planId, usageRequests);

  let rawContent: unknown;
  let model: string;

  try {
    // 3. Call the model. The Pro model is used only for Pro plans and only for
    //    generation kinds where reasoning measurably helps.
    const result = await generateStudyContent({
      planId,
      kinds: request.kinds,
      title: request.title,
      text: request.text,
      counts: {
        flashcards: request.flashcards,
        quizQuestions: request.quizQuestions,
      },
    });
    rawContent = result.content;
    model = result.model;
  } catch (error) {
    // 4. The model failed and produced nothing usable: refund the quota so the
    //    user is not charged for output they never received.
    await refundQuota(ownerUid, usageRequests).catch((refundError) => {
      console.error("[generate] quota refund failed:", refundError);
    });

    if (error instanceof ApiError) throw error;
    console.error("[generate] model call failed:", error);
    throw new ApiError("ai_failed");
  }

  // 5. Validate the structured response. A malformed model reply must never be
  //    persisted, and must not cost the user quota.
  let content;
  try {
    content = parseStudyContent(rawContent);
  } catch (error) {
    await refundQuota(ownerUid, usageRequests).catch((refundError) => {
      console.error("[generate] quota refund failed:", refundError);
    });
    throw error;
  }

  // 6. Charge only for what was actually delivered.
  //
  //    Quota is consumed up front from the REQUESTED counts, but a model can
  //    return fewer items — and for a very short, or poorly extracted, document
  //    it may legitimately produce only a summary. Refunding the shortfall
  //    keeps the counters honest: nobody is charged for flashcards that were
  //    never created. This is also logged, because "the deck came back empty"
  //    is otherwise invisible from the outside.
  const undelivered: UsageRequest[] = [];

  if (request.kinds.includes("flashcards")) {
    const delivered = content.flashcards?.length ?? 0;
    const shortfall = request.flashcards - delivered;
    if (shortfall > 0) {
      undelivered.push({ metric: "flashcardsPerDay", amount: shortfall });
    }
  }

  if (request.kinds.includes("quiz")) {
    const delivered = content.quizQuestions?.length ?? 0;
    const shortfall = request.quizQuestions - delivered;
    if (shortfall > 0) {
      undelivered.push({ metric: "quizQuestionsPerDay", amount: shortfall });
    }
  }

  console.info(
    `[generate] delivered summary=${content.summary ? "yes" : "no"} ` +
      `flashcards=${content.flashcards?.length ?? 0}/${request.flashcards} ` +
      `quiz=${content.quizQuestions?.length ?? 0}/${request.quizQuestions} ` +
      `model=${model}`,
  );

  if (undelivered.length > 0) {
    console.warn(
      "[generate] model returned fewer items than requested; refunding:",
      undelivered,
    );
    await refundQuota(ownerUid, undelivered).catch((refundError) => {
      console.error("[generate] shortfall refund failed:", refundError);
    });
  }

  // 7. Persist ONLY the title and the generated content. The source text is
  //    deliberately not part of this call and is never written anywhere.
  //
  // Note: `exactOptionalPropertyTypes` is on, so optional fields are spread
  // conditionally rather than passed as explicit `undefined`.
  const studySet = await createStudySet(ownerUid, {
    title: request.title,
    summary: content.summary ?? null,
    ...(content.flashcards ? { flashcards: content.flashcards } : {}),
    ...(content.quizQuestions ? { quizQuestions: content.quizQuestions } : {}),
    model,
    // Display-only metadata about the source document. The file itself is
    // never persisted.
    sourceFormat: request.sourceFormat,
    sourceUnits: request.sourceUnits,
  });

  // Recompute remaining so the client can display an accurate figure that
  // reflects the day boundary, not just the arithmetic done above.
  const finalRemaining = await getRemainingUsage(ownerUid, planId);

  return { studySet, remaining: finalRemaining, model };
}

/** Exposes plan display data needed by the client workflow. */
export function planSummary(planId: PlanId) {
  return getPlan(planId);
}
