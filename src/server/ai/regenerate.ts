/**
 * Regeneration orchestration (server-only).
 *
 * Handles "generate more material for an existing study set". Two modes:
 *
 *   1. With re-uploaded text — the user supplied the original document again.
 *      The text is used for this request only and never persisted.
 *   2. From saved context — no document available, so the stored title,
 *      summary, flashcards, and quiz are used instead. If that is not enough,
 *      the user is asked to re-upload rather than being given invented content.
 *
 * Quota: additional content respects the CURRENT plan limits. Regeneration
 * passes `uploads: 0` when no new document was supplied, so the same upload is
 * not charged twice.
 */
import "server-only";

import { getPlan, type PlanId } from "@/config/plans";
import { usageRequestsFor } from "@/lib/plan-limits";
import {
  REGENERATION_NOTICE,
  assessRegenerationContext,
  type RegenerationContext,
} from "@/lib/regeneration";
import { ApiError } from "@/server/http/errors";
import { generateStudyContent } from "@/server/ai/client";
import { parseStudyContent } from "@/server/ai/validation";
import { getStudySet, appendToStudySet } from "@/server/services/study-sets";
import {
  consumeQuota,
  getRemainingUsage,
  refundQuota,
  type RemainingUsage,
  type UsageRequest,
} from "@/server/services/usage";
import type { GenerationKind, StudySet } from "@/types";

/** Request body for regeneration. */
export interface RegenerationRequest {
  studySetId: string;
  kinds: GenerationKind[];
  /** Newly re-uploaded document text, when the user supplied it. */
  text?: string;
  /** Optional revised title. */
  title?: string;
  /** How many new items to add. Clamped by the caller's validation. */
  counts?: { flashcards?: number; quizQuestions?: number };
}

export interface RegenerationOutcome {
  studySet: StudySet;
  remaining: RemainingUsage;
  /** True when generation ran from re-uploaded text rather than saved content. */
  usedUploadedText: boolean;
}

/** Reads the study set and builds the context available for regeneration. */
export async function loadRegenerationContext(
  ownerUid: string,
  studySetId: string,
): Promise<RegenerationContext | null> {
  const studySet = await getStudySet(ownerUid, studySetId);
  if (!studySet) return null;

  return {
    title: studySet.title,
    summary: studySet.summary,
    flashcards: studySet.flashcards,
    quizQuestions: studySet.quizQuestions,
  };
}

/**
 * Runs an additional generation against an existing study set.
 *
 * @throws {ApiError} `not_found` when the set does not exist or is not owned,
 *   `no_readable_text` when saved context is insufficient and no text was
 *   supplied, or `quota_exceeded` when the plan allowance is exhausted.
 */
export async function runRegeneration(
  ownerUid: string,
  planId: PlanId,
  request: RegenerationRequest,
): Promise<RegenerationOutcome> {
  // 1. Load the existing set. Ownership is enforced by the service.
  const context = await loadRegenerationContext(ownerUid, request.studySetId);
  if (!context) {
    throw new ApiError("not_found", "Materiali nuk u gjet.");
  }

  const uploadedText = request.text?.trim() ?? "";
  let generationText: string;
  let usedUploadedText = false;

  if (uploadedText) {
    // Mode 1: the user re-uploaded the document. Its text is used for this
    // request only and is never written to Firestore.
    generationText = uploadedText;
    usedUploadedText = true;
  } else {
    // Mode 2: generate from what was saved. Refuse rather than invent when the
    // saved content cannot support accurate output.
    const assessment = assessRegenerationContext(context);
    if (!assessment.sufficient) {
      throw new ApiError("no_readable_text", assessment.message);
    }
    generationText = `${assessment.contextText}\n\n${REGENERATION_NOTICE}`;
  }

  const title = (request.title ?? context.title).trim() || context.title;

  // 2. Charge the current plan's quota. Passing uploads: 0 when no new document
  //    was supplied avoids charging twice for the same upload.
  const counts = {
    flashcards: getRegenerationCount(request, "flashcards"),
    quizQuestions: getRegenerationCount(request, "quiz"),
  };

  const usageRequests = usageRequestsFor(
    request.kinds,
    counts,
    usedUploadedText ? 1 : 0,
  );

  await consumeQuota(ownerUid, planId, usageRequests);

  // 3. Generate.
  let rawContent: unknown;
  let model: string;

  try {
    const result = await generateStudyContent({
      planId,
      kinds: request.kinds,
      title,
      text: generationText,
      counts,
      excludeQuestions: {
        flashcards: context.flashcards.map((card) => card.question),
        quizQuestions: context.quizQuestions.map((question) => question.question),
      },
    });
    rawContent = result.content;
    model = result.model;
  } catch (error) {
    // Nothing usable was produced, so refund the quota.
    await refundQuota(ownerUid, usageRequests).catch((refundError) => {
      console.error("[regenerate] quota refund failed:", refundError);
    });
    if (error instanceof ApiError) throw error;
    console.error("[regenerate] model call failed:", error);
    throw new ApiError("ai_failed");
  }

  // 4. Validate before merging. A malformed response is never persisted.
  let content;
  try {
    content = parseStudyContent(rawContent);
  } catch (error) {
    await refundQuota(ownerUid, usageRequests).catch((refundError) => {
      console.error("[regenerate] quota refund failed:", refundError);
    });
    throw error;
  }

  // 5. Charge only for what was actually delivered. The quota was consumed from
  //    the REQUESTED counts, so any shortfall is refunded rather than silently
  //    kept — a model can legitimately return fewer items than asked for.
  const undelivered: UsageRequest[] = [];

  if (request.kinds.includes("flashcards")) {
    const delivered = content.flashcards?.length ?? 0;
    const shortfall = counts.flashcards - delivered;
    if (shortfall > 0) {
      undelivered.push({ metric: "flashcardsPerDay", amount: shortfall });
    }
  }

  if (request.kinds.includes("quiz")) {
    const delivered = content.quizQuestions?.length ?? 0;
    const shortfall = counts.quizQuestions - delivered;
    if (shortfall > 0) {
      undelivered.push({ metric: "quizQuestionsPerDay", amount: shortfall });
    }
  }

  console.info(
    `[regenerate] delivered summary=${content.summary ? "yes" : "no"} ` +
      `flashcards=${content.flashcards?.length ?? 0}/${counts.flashcards} ` +
      `quiz=${content.quizQuestions?.length ?? 0}/${counts.quizQuestions}`,
  );

  if (undelivered.length > 0) {
    console.warn(
      "[regenerate] model returned fewer items than requested; refunding:",
      undelivered,
    );
    await refundQuota(ownerUid, undelivered).catch((refundError) => {
      console.error("[regenerate] shortfall refund failed:", refundError);
    });
  }

  // 6. Merge into the existing set. The service de-duplicates, so repeating a
  //    regeneration does not accumulate copies.
  //
  //    `exactOptionalPropertyTypes` is on, so optional fields are spread
  //    conditionally rather than passed as explicit `undefined`.
  const merged = await appendToStudySet(ownerUid, request.studySetId, {
    // Keep the existing summary unless the user asked for a new one.
    summary: request.kinds.includes("summary") ? content.summary ?? null : null,
    ...(content.flashcards ? { flashcards: content.flashcards } : {}),
    ...(content.quizQuestions ? { quizQuestions: content.quizQuestions } : {}),
    model,
  });

  if (!merged) {
    throw new ApiError("not_found", "Materiali nuk u gjet.");
  }

  const remaining = await getRemainingUsage(ownerUid, planId);
  return { studySet: merged, remaining, usedUploadedText };
}

/** How many units a regeneration of this kind should charge. */
function getRegenerationCount(
  request: RegenerationRequest,
  kind: "flashcards" | "quiz",
): number {
  // Regeneration tops up an existing set, so it adds a small batch rather than
  // the full per-set maximum. Clamped so a client cannot request an arbitrary
  // amount, and defaulted when unspecified.
  const requested =
    kind === "flashcards"
      ? request.counts?.flashcards
      : request.counts?.quizQuestions;

  return clamp(requested ?? 3);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(Math.max(Math.floor(value), 1), 8);
}

/** Plan display data for the client. */
export function regenerationPlanSummary(planId: PlanId) {
  return getPlan(planId);
}
