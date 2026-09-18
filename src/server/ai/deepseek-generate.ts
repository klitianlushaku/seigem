/**
 * DeepSeek generation implementation.
 *
 * Responsibilities:
 *   1. build Albanian prompts for the requested kinds
 *   2. call DeepSeek with JSON mode
 *   3. extract the JSON object from the model's reply
 *   4. if the reply is unparseable, retry ONCE with a corrective message
 *   5. if the reply is parseable but INCOMPLETE — a requested kind came back
 *      empty — retry once naming exactly what is missing
 *   6. return the raw parsed value for schema validation by the caller
 *
 * Step 5 exists because a summary with no flashcards is otherwise indistinguish-
 * able from a document that genuinely cannot support them. Retrying costs one
 * extra call only in the rare incomplete case, and it is far better than
 * silently handing the user a set that is missing what they asked for.
 *
 * Note on layering: this module returns the *parsed but unvalidated* value.
 * Schema validation and persistence stay in `generate.ts`, so there is exactly
 * one place that decides what may be stored.
 */
import "server-only";

import { missingRequestedKinds } from "@/lib/generation-coverage";
import { extractJson } from "@/lib/json";
import { selectDeepSeekModel } from "@/server/ai/models";
import { ApiError } from "@/server/http/errors";
import type { GenerationKind } from "@/types";

import { createChatCompletion } from "./deepseek";
import type { GenerateInput, GenerateResult } from "./client";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildExclusionPrompt,
  expectedKeys,
  kindLabel,
} from "./prompts";

/** Albanian corrective instruction appended when the reply is unparseable. */
const RETRY_INSTRUCTION = `
Përgjigjja e mëparshme nuk ishte JSON i vlefshëm.
Kthe VETËM një objekt JSON të vlefshëm, pa tekst shtesë, pa bllok kod dhe pa komente.
I gjithë përmbajtja duhet të jetë në shqip.
`.trim();

/**
 * Albanian corrective instruction for a reply that is valid but incomplete.
 *
 * Names the exact keys and states that empty lists do not count, so the model
 * cannot satisfy it with `"flashcards": []`.
 */
function buildMissingInstruction(missing: GenerationKind[]): string {
  return `
Përgjigjja e mëparshme ishte JSON i vlefshëm, por NUK përmbante: ${missing
    .map(kindLabel)
    .join(", ")}.
Kthe të njëjtin objekt JSON dhe shto çelësat që mungojnë: ${expectedKeys(missing).join(", ")}.
Çdo çelës duhet të ketë përmbajtje reale. Listat bosh nuk pranohen.
`.trim();
}

/**
 * Generates study content from document text.
 *
 * @throws {ApiError} `ai_failed` when the provider fails, or
 *   `ai_invalid_response` when no parseable JSON could be obtained even after
 *   a corrective retry.
 */
export async function generateStudyContent(
  input: GenerateInput,
): Promise<GenerateResult> {
  const { kinds, title, text, planId } = input;

  // The Pro model is used only for Pro plans and only for kinds where
  // step-by-step reasoning measurably improves the result.
  const model = selectDeepSeekModel(planId, kinds.includes("quiz") ? "quiz" : kinds[0]);

  const basePrompt = buildSystemPrompt(kinds, input.counts);
  const exclusionPrompt = input.excludeQuestions
    ? buildExclusionPrompt(input.excludeQuestions)
    : "";
  const userPrompt = [
    buildUserPrompt(title, text),
    exclusionPrompt,
  ].filter(Boolean).join("\n\n");

  // --- First attempt ---------------------------------------------------
  const first = await createChatCompletion({
    model,
    systemPrompt: basePrompt,
    userPrompt,
    json: true,
  });

  const parsed = extractJson(first.content);

  if (parsed !== null) {
    const missing = missingRequestedKinds(parsed, kinds);

    if (missing.length === 0) {
      logUsage(model, kinds, first.usage, 1);
      return { content: parsed, model };
    }

    // Valid JSON, but it did not deliver everything that was asked for.
    console.warn(
      `[deepseek] reply is missing requested kinds: ${missing.join(", ")}; retrying once`,
    );

    const corrective = await createChatCompletion({
      model,
      systemPrompt: `${basePrompt}\n\n${buildMissingInstruction(missing)}`,
      userPrompt,
      json: true,
    });

    const correctiveParsed = extractJson(corrective.content);
    logUsage(model, kinds, corrective.usage, 2);

    if (correctiveParsed !== null) {
      const stillMissing = missingRequestedKinds(correctiveParsed, kinds);

      // Only accept the retry when it actually covers more than the first
      // reply, so a corrective call can never make the result worse.
      if (stillMissing.length < missing.length) {
        return { content: correctiveParsed, model };
      }
    }

    // The retry did not help. Return the first reply and let the caller report
    // the shortfall and refund the undelivered units, rather than failing the
    // whole request and discarding the content that WAS produced.
    console.warn(
      "[deepseek] corrective retry did not add the missing kinds; returning the partial reply",
    );
    return { content: parsed, model };
  }

  // --- Unparseable: corrective retry -----------------------------------
  // The reply was not parseable. Retry once with the bad output omitted and an
  // explicit instruction, which is cheaper and more reliable than re-sending
  // the whole document plus a complaint.
  console.warn(
    "[deepseek] unparseable response; retrying once. Length:",
    first.content.length,
  );

  const retry = await createChatCompletion({
    model,
    systemPrompt: `${basePrompt}\n\n${RETRY_INSTRUCTION}`,
    userPrompt,
    json: true,
  });

  const retryParsed = extractJson(retry.content);
  if (retryParsed === null) {
    // Two failures: give up rather than loop. The caller refunds the quota and
    // nothing is persisted.
    console.error("[deepseek] retry also returned unparseable content");
    throw new ApiError("ai_invalid_response");
  }

  logUsage(model, kinds, retry.usage, 2);
  return { content: retryParsed, model };
}

/** Logs token usage for cost visibility, without logging any content. */
function logUsage(
  model: string,
  kinds: GenerationKind[],
  usage: { promptTokens: number; completionTokens: number } | null,
  attempts: number,
): void {
  if (!usage) return;

  console.info(
    `[deepseek] model=${model} kinds=${kinds.map(kindLabel).join("+")} ` +
      `prompt=${usage.promptTokens} completion=${usage.completionTokens} attempts=${attempts}`,
  );
}
