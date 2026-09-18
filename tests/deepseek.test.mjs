/**
 * DeepSeek HTTP client tests.
 *
 * Run with:  npm run test:deepseek
 *
 * `fetch` is stubbed so the client's request shape, retry policy, and error
 * mapping can be verified without an API key or network access.
 *
 * The client module imports `server-only`, which throws outside a React Server
 * Component, so it is loaded through a shim that neutralises that guard — the
 * same technique a bundler applies via the "react-server" export condition.
 *
 * Plain JavaScript (not .ts) because this file performs a top-level dynamic
 * import before Node's type-stripping would apply.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { loadModule } = await import("./helpers/load-server-module.mjs");
const { createChatCompletion } = await loadModule("src/server/ai/deepseek.ts");

/** Captured fetch calls. */
let calls = [];
/** Queued responses, consumed in order. */
let queue = [];

const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

before(() => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = queue.shift();
    if (!next) throw new Error("no queued response");
    return next();
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  calls = [];
  queue = [];
});

const BASE_PARAMS = {
  model: "deepseek-flash",
  systemPrompt: 'Kthe json. Shembull: {"summary":"..."}',
  userPrompt: "Materiali...",
  json: true,
};

/** A well-formed success response. */
function success(content, usage = { prompt_tokens: 100, completion_tokens: 50 }) {
  return () => jsonResponse({ choices: [{ message: { content } }], usage });
}

describe("request construction", () => {
  it("posts to the chat completions endpoint", async () => {
    queue = [success('{"summary":"ok"}')];
    await createChatCompletion(BASE_PARAMS);

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/chat\/completions$/);
  });

  it("sends the API key as a bearer token", async () => {
    queue = [success('{"summary":"ok"}')];
    await createChatCompletion(BASE_PARAMS);

    const headers = calls[0].init.headers;
    assert.match(headers.Authorization ?? "", /^Bearer \S+/);
  });

  it("sets response_format for JSON mode", async () => {
    queue = [success('{"summary":"ok"}')];
    await createChatCompletion(BASE_PARAMS);

    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body.response_format, { type: "json_object" });
  });

  it("sets max_tokens to avoid truncated JSON", async () => {
    queue = [success('{"summary":"ok"}')];
    await createChatCompletion(BASE_PARAMS);

    const body = JSON.parse(String(calls[0].init.body));
    assert.ok(
      typeof body.max_tokens === "number" && body.max_tokens > 0,
      "max_tokens must be set",
    );
  });

  it("disables thinking mode for structured extraction", async () => {
    queue = [success('{"summary":"ok"}')];
    await createChatCompletion(BASE_PARAMS);

    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body.thinking, { type: "disabled" });
  });

  it("sends system and user messages", async () => {
    queue = [success('{"summary":"ok"}')];
    await createChatCompletion(BASE_PARAMS);

    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[1].role, "user");
  });

  it("never sends an API key in the body", async () => {
    queue = [success('{"summary":"ok"}')];
    await createChatCompletion(BASE_PARAMS);

    assert.doesNotMatch(String(calls[0].init.body), /sk-[A-Za-z0-9]/);
  });
});

describe("response handling", () => {
  it("returns content on success", async () => {
    queue = [success('{"summary":"Përmbledhje."}')];
    const result = await createChatCompletion(BASE_PARAMS);
    assert.equal(result.content, '{"summary":"Përmbledhje."}');
  });

  it("reports token usage", async () => {
    queue = [
      success('{"summary":"ok"}', { prompt_tokens: 120, completion_tokens: 60 }),
    ];
    const result = await createChatCompletion(BASE_PARAMS);
    assert.deepEqual(result.usage, { promptTokens: 120, completionTokens: 60 });
  });

  it("captures reasoning_content when present", async () => {
    queue = [
      () =>
        jsonResponse({
          choices: [
            { message: { content: '{"summary":"ok"}', reasoning_content: "hmm" } },
          ],
        }),
    ];
    const result = await createChatCompletion(BASE_PARAMS);
    assert.equal(result.reasoningContent, "hmm");
  });
});

describe("retry policy", () => {
  it("retries after an empty response, then succeeds", async () => {
    // Documented DeepSeek JSON-mode behaviour: content is occasionally empty.
    queue = [
      () => jsonResponse({ choices: [{ message: { content: "" } }] }),
      success('{"summary":"recovered"}'),
    ];

    const result = await createChatCompletion(BASE_PARAMS);
    assert.equal(calls.length, 2, "should have retried");
    assert.match(result.content, /recovered/);
  });

  it("retries on HTTP 429 (rate limit)", async () => {
    queue = [
      () => jsonResponse({ error: "rate limited" }, 429),
      success('{"summary":"ok"}'),
    ];

    const result = await createChatCompletion(BASE_PARAMS);
    assert.equal(calls.length, 2);
    assert.ok(result.content);
  });

  it("retries on HTTP 503 (overloaded)", async () => {
    queue = [
      () => jsonResponse({ error: "overloaded" }, 503),
      success('{"summary":"ok"}'),
    ];
    await createChatCompletion(BASE_PARAMS);
    assert.equal(calls.length, 2);
  });

  it("retries on a network error", async () => {
    queue = [
      () => {
        throw new Error("ECONNRESET");
      },
      success('{"summary":"ok"}'),
    ];
    await createChatCompletion(BASE_PARAMS);
    assert.equal(calls.length, 2);
  });

  it("does NOT retry a 401 (bad API key)", async () => {
    queue = [() => jsonResponse({ error: "unauthorized" }, 401)];
    await assert.rejects(() => createChatCompletion(BASE_PARAMS));
    assert.equal(calls.length, 1, "authentication errors must not be retried");
  });

  it("does NOT retry a 402 (insufficient balance)", async () => {
    queue = [() => jsonResponse({ error: "no balance" }, 402)];
    await assert.rejects(() => createChatCompletion(BASE_PARAMS));
    assert.equal(calls.length, 1, "balance errors must not be retried");
  });

  it("gives up after exhausting retries on persistent 429", async () => {
    queue = [
      () => jsonResponse({}, 429),
      () => jsonResponse({}, 429),
      () => jsonResponse({}, 429),
    ];

    await assert.rejects(() => createChatCompletion(BASE_PARAMS));
    assert.equal(calls.length, 3, "initial attempt plus two retries");
  });
});

describe("error safety", () => {
  it("throws an ApiError, never a raw provider error", async () => {
    queue = [() => jsonResponse({ error: { message: "internal detail" } }, 500)];

    await assert.rejects(
      () => createChatCompletion(BASE_PARAMS),
      (error) => {
        assert.equal(error.name, "ApiError");
        return true;
      },
    );
  });

  it("does not leak provider error text into the thrown message", async () => {
    queue = [
      () =>
        jsonResponse(
          { error: { message: "sk-secret-key-invalid org_12345" } },
          400,
        ),
    ];

    try {
      await createChatCompletion(BASE_PARAMS);
      assert.fail("should have thrown");
    } catch (error) {
      assert.doesNotMatch(error.message, /sk-secret/, "must not echo provider text");
      assert.doesNotMatch(error.message, /org_12345/);
    }
  });

  it("never includes the API key in a thrown message", async () => {
    queue = [() => jsonResponse({}, 500)];
    try {
      await createChatCompletion(BASE_PARAMS);
      assert.fail("should have thrown");
    } catch (error) {
      assert.doesNotMatch(error.message, /sk-/);
    }
  });
});

describe("server-only guarantee", () => {
  it("the DeepSeek client imports server-only", () => {
    const source = readFileSync("src/server/ai/deepseek.ts", "utf8");
    assert.match(source, /import "server-only"/);
  });

  it("reads the API key from serverEnv, not process.env directly", () => {
    const source = readFileSync("src/server/ai/deepseek.ts", "utf8");
    assert.match(source, /serverEnv\.deepSeekApiKey/);
    assert.doesNotMatch(source, /process\.env\.DEEPSEEK_API_KEY/);
  });

  it("is never imported by a client-side module", () => {
    for (const file of [
      "src/services/generation/index.ts",
      "src/components/documents/study-workflow.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /server\/ai\/deepseek|deepseek-generate/, file);
    }
  });
});
