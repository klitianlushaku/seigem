/**
 * AI provider interface (server-only).
 *
 * Defines the contract between the generation workflow and the DeepSeek
 * implementation, and re-exports the implementation so callers have a single
 * import site. The contract is deliberately small so the surrounding workflow —
 * quota enforcement, response validation, persistence, and refunds — can be
 * reasoned about independently of the provider.
 */
import "server-only";

import type { PlanId } from "@/config/plans";
import type { GenerationKind } from "@/types";

/** Input to a generation call. */
export interface GenerateInput {
  planId: PlanId;
  kinds: GenerationKind[];
  title: string;
  /** Extracted document text. Used for this call only; never persisted. */
  text: string;
  /**
   * How many of each kind this request was charged for.
   *
   * Passed to the prompt so the model produces exactly what the user paid for:
   * generating more would exceed the tier's allowance, and generating fewer
   * would be a silent overcharge.
   */
  counts: { flashcards: number; quizQuestions: number };
  /** Existing questions to exclude when adding material to a saved set. */
  excludeQuestions?: { flashcards?: string[]; quizQuestions?: string[] };
}

/** Raw, unvalidated model output plus the model that produced it. */
export interface GenerateResult {
  /** Expected to match the structured schema; validated by the caller. */
  content: unknown;
  /** The DeepSeek model actually used, recorded for debugging and cost. */
  model: string;
}

/**
 * Generates study content from document text.
 *
 * The implementation lives in `./deepseek-generate`; it is re-exported here so
 * the workflow has one stable import path. It is imported lazily so that the
 * provider module (and its environment access) is only evaluated when a
 * generation actually runs.
 *
 * @throws {ApiError} `ai_failed` when the provider fails, or
 *   `ai_invalid_response` when no parseable JSON could be obtained.
 */
export async function generateStudyContent(
  input: GenerateInput,
): Promise<GenerateResult> {
  const { generateStudyContent: implementation } = await import(
    "./deepseek-generate"
  );
  return implementation(input);
}
