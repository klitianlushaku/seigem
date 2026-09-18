/**
 * DeepSeek model selection.
 *
 * Requirement:
 *   - Free and Plus users use the normal DeepSeek model.
 *   - Pro users use the stronger, reasoning-capable model "when appropriate".
 *
 * "When appropriate" is deliberately conservative: the reasoning model is
 * slower and more expensive, so it is NOT used for every Pro request. It is
 * reserved for generation types where step-by-step reasoning measurably
 * improves output quality (quiz construction), and skipped for mechanical
 * transforms (flashcards) where it adds cost without improving the result.
 *
 * This module is server-only: it reads DEEPSEEK_* variables to decide which
 * model to call. The browser must never know or choose the model.
 */
import "server-only";

import { getPlan, type PlanId } from "@/config/plans";
import { serverEnv } from "@/lib/env/server";
import type { GenerationKind } from "@/types";

/**
 * Generation kinds that benefit enough from reasoning to justify the Pro model.
 * Quiz generation must pick one defensible correct answer and plausible
 * distractors, which is where reasoning helps most.
 */
const PRO_MODEL_GENERATION_KINDS: readonly GenerationKind[] = ["quiz"];

/**
 * Chooses the DeepSeek model for a request.
 *
 * - Free / Plus  -> standard model (`deepseek-flash` by default), always.
 * - Pro          -> pro model (`deepseek-v4-pro` by default) for
 *                   reasoning-heavy generation kinds, standard model otherwise.
 *
 * Model ids come from configuration, never from constants in this file, so a
 * provider rename is an environment change rather than a code change.
 *
 * @param planId The plan of the authenticated user, resolved server-side.
 * @param kind   What is being generated. Omit to use the strongest model the
 *               plan allows.
 */
export function selectDeepSeekModel(
  planId: PlanId,
  kind?: GenerationKind,
): string {
  const plan = getPlan(planId);

  // Defensive: only a plan explicitly marked as pro-model-capable may use it.
  // This means a misconfigured plan table can never silently grant Pro compute.
  if (!plan.usesProModel) {
    return serverEnv.deepSeekStandardModel;
  }

  if (kind === undefined) {
    return serverEnv.deepSeekProModel;
  }

  return PRO_MODEL_GENERATION_KINDS.includes(kind)
    ? serverEnv.deepSeekProModel
    : serverEnv.deepSeekStandardModel;
}

/**
 * Reports whether a plan is permitted to use the reasoning model at all.
 * Useful for logging and for explaining model choice in debug output.
 */
export function canUseProModel(planId: PlanId): boolean {
  return getPlan(planId).usesProModel;
}
