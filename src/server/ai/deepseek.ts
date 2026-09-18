/**
 * DeepSeek API client (server-only).
 *
 * SECURITY: this module must only ever run on the server. The API key is read
 * from `serverEnv` and is never exposed to the browser. The client calls our
 * own `/api/generate` endpoint, which calls DeepSeek from here.
 *
 * Reference: https://api-docs.deepseek.com
 */
import "server-only";

import { serverEnv } from "@/lib/env/server";
import { ApiError } from "@/server/http/errors";

import { MAX_OUTPUT_TOKENS } from "./prompts";

/** Request timeout. DeepSeek can be slow on long inputs. */
const REQUEST_TIMEOUT_MS = 90_000;

/** How many times to retry a retryable failure (network, 429, 5xx). */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff between retries. */
const RETRY_BASE_DELAY_MS = 800;

/** A single chat message. */
interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** Parameters for a chat completion. */
export interface ChatCompletionParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /**
   * When true, request a JSON object and disable thinking mode.
   *
   * Thinking mode is enabled by default on the current API. Structured JSON
   * output does not benefit from a long chain of thought, and thinking mode
   * also disables `temperature`. Disabling it makes responses faster, cheaper,
   * and more predictable for this use case.
   */
  json: boolean;
}

/** The content returned by the model. */
export interface ChatCompletionResult {
  content: string;
  /** Chain-of-thought, present only when thinking mode is enabled. */
  reasoningContent: string | null;
  /** Token usage, for cost logging. */
  usage: { promptTokens: number; completionTokens: number } | null;
}

/** Shape of the OpenAI-compatible response we rely on. */
interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/** Error codes that are worth retrying, per DeepSeek's documentation. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the request body.
 *
 * Notes from the API documentation:
 *   - JSON mode needs `response_format: { type: "json_object" }` AND the word
 *     "json" in the prompt (the prompts module guarantees this).
 *   - `max_tokens` must be set or the JSON may be truncated mid-string.
 *   - Thinking is toggled via `thinking.type`, passed as `extra_body` in the
 *     OpenAI SDK; over plain HTTP it is just a top-level field.
 */
function buildRequestBody(params: ChatCompletionParams): Record<string, unknown> {
  const messages: ChatMessage[] = [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: params.userPrompt },
  ];

  const body: Record<string, unknown> = {
    model: params.model,
    messages,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
  };

  if (params.json) {
    body.response_format = { type: "json_object" };
    // Disable thinking for structured extraction: faster, cheaper, and it
    // avoids the documented "may occasionally return empty content" issue
    // that JSON mode has when combined with long reasoning.
    body.thinking = { type: "disabled" };
  }

  return body;
}

/**
 * Calls the DeepSeek chat completions endpoint.
 *
 * Retries transient failures (network errors, 429, 5xx) with exponential
 * backoff. Authentication and balance errors are NOT retried: they will not
 * succeed on a second attempt and retrying only wastes time.
 *
 * @throws {ApiError} `ai_failed` when the call ultimately fails.
 */
export async function createChatCompletion(
  params: ChatCompletionParams,
): Promise<ChatCompletionResult> {
  const url = `${serverEnv.deepSeekBaseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = JSON.stringify(buildRequestBody(params));

  let lastError: string = "unknown";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      // Exponential backoff: 800ms, 1600ms.
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serverEnv.deepSeekApiKey}`,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;

        // Never log the response body: it can echo request content, and the
        // Authorization header must never appear in logs.
        if (isRetryableStatus(status) && attempt < MAX_RETRIES) {
          lastError = `HTTP ${status}`;
          continue;
        }

        throw mapStatusToError(status);
      }

      const payload = (await response.json()) as DeepSeekResponse;

      const choice = payload.choices?.[0];
      const content = choice?.message?.content ?? "";

      if (!content.trim()) {
        // Documented JSON-mode behaviour: the API may occasionally return
        // empty content. Retry once, then fail cleanly.
        lastError = "empty content";
        if (attempt < MAX_RETRIES) continue;
        throw new ApiError("ai_failed");
      }

      return {
        content,
        reasoningContent: choice?.message?.reasoning_content ?? null,
        usage: payload.usage
          ? {
              promptTokens: payload.usage.prompt_tokens ?? 0,
              completionTokens: payload.usage.completion_tokens ?? 0,
            }
          : null,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      // An aborted request hit the timeout.
      if (error instanceof DOMException && error.name === "AbortError") {
        lastError = "timeout";
        if (attempt < MAX_RETRIES) continue;
        console.error("[deepseek] request timed out after retries");
        throw new ApiError("ai_failed");
      }

      lastError = error instanceof Error ? error.message : "network error";
      if (attempt < MAX_RETRIES) continue;

      // Log the message only — never the request body or the API key.
      console.error("[deepseek] request failed:", lastError);
      throw new ApiError("ai_failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  console.error("[deepseek] exhausted retries:", lastError);
  throw new ApiError("ai_failed");
}

/**
 * Maps an HTTP status to a user-facing error.
 *
 * Messages are Albanian and never include the response body, so provider
 * details cannot leak to the client.
 */
function mapStatusToError(status: number): ApiError {
  switch (status) {
    case 400:
    case 422:
      // Our request was malformed — a bug, not the user's fault.
      console.error(`[deepseek] request rejected with ${status}`);
      return new ApiError("ai_failed");
    case 401:
      console.error("[deepseek] authentication failed — check DEEPSEEK_API_KEY");
      return new ApiError("ai_failed");
    case 402:
      console.error("[deepseek] insufficient balance");
      return new ApiError(
        "ai_failed",
        "Shërbimi i gjenerimit nuk është i disponueshëm për momentin. Provo përsëri më vonë.",
      );
    case 429:
      return new ApiError("rate_limited");
    default:
      console.error(`[deepseek] unexpected status ${status}`);
      return new ApiError("ai_failed");
  }
}
