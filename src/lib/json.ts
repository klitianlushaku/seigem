/**
 * JSON recovery for model responses.
 *
 * Deliberately free of `server-only` and of any environment access so the
 * parsing rules can be unit-tested directly. `@/server/ai/deepseek-generate`
 * imports this and owns the network call.
 *
 * Why recovery at all: DeepSeek's JSON mode should return bare JSON, but models
 * occasionally wrap output in a markdown fence or add a sentence. Salvaging
 * those cases is cheaper and faster than a retry, which costs the user time and
 * consumes their quota.
 */

/**
 * Extracts a JSON value from a model reply.
 *
 * Tries, in order:
 *   1. the raw string as-is
 *   2. the contents of a markdown code fence
 *   3. the outermost `{...}` span (handles leading/trailing prose)
 *
 * @returns The parsed value, or null when no JSON could be recovered.
 */
export function extractJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Direct parse (the expected case).
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  // 2. Strip a markdown code fence: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    const fenced = tryParse(fenceMatch[1].trim());
    if (fenced !== undefined) return fenced;
  }

  // 3. Fall back to the outermost {...} span. A truncated response has no
  //    closing brace, so this intentionally fails and the caller retries.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const sliced = tryParse(trimmed.slice(start, end + 1));
    if (sliced !== undefined) return sliced;
  }

  return null;
}

/** Parses JSON, returning undefined on failure so `null` stays meaningful. */
function tryParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
