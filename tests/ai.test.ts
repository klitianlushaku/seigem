/**
 * DeepSeek prompt and JSON-extraction tests.
 *
 * Run with:  npm run test:ai
 *
 * These cover the parts of the AI integration that can be verified without an
 * API key: the prompts (which must be Albanian and must satisfy JSON mode's
 * requirements) and the JSON recovery logic (which decides whether a malformed
 * model response is salvageable or must be retried).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildSystemPrompt,
  buildUserPrompt,
  expectedKeys,
  MAX_OUTPUT_TOKENS,
} from "../src/server/ai/prompts.ts";
import { extractJson } from "../src/lib/json.ts";
import {
  missingKindsMessage,
  missingRequestedKinds,
  producesKind,
} from "../src/lib/generation-coverage.ts";
import { parseStudyContent } from "../src/server/ai/validation.ts";

// ===========================================================================
// Prompts — language and JSON-mode requirements
// ===========================================================================

describe("Albanian prompts", () => {
  const allKinds = ["summary", "flashcards", "quiz"] as const;

  it("writes the system prompt in Albanian", () => {
    const prompt = buildSystemPrompt([...allKinds]);
    // Albanian function words and diacritics must be present.
    assert.match(prompt, /Përgjigju|Kërkesa|Detyra/);
    assert.match(prompt, /[ëç]/);
    // It must not be an English prompt that happens to mention Albanian.
    assert.doesNotMatch(prompt, /\bPlease respond\b|\bYou are a helpful assistant\b/);
  });

  it("contains the word 'json' — required by DeepSeek JSON mode", () => {
    // https://api-docs.deepseek.com/guides/json_mode requires this explicitly.
    for (const kind of allKinds) {
      const prompt = buildSystemPrompt([kind]);
      assert.match(prompt.toLowerCase(), /json/, `${kind} prompt must mention json`);
    }
  });

  it("provides a JSON format example — also required by JSON mode", () => {
    for (const kind of allKinds) {
      const prompt = buildSystemPrompt([kind]);
      assert.match(prompt, /\{[\s\S]*\}/, `${kind} prompt must show an example`);
    }
  });

  it("names every requested output key", () => {
    const prompt = buildSystemPrompt(["summary", "flashcards", "quiz"]);
    assert.match(prompt, /summary/);
    assert.match(prompt, /flashcards/);
    assert.match(prompt, /quizQuestions/);
  });

  it("omits keys that were not requested", () => {
    const prompt = buildSystemPrompt(["summary"]);
    assert.match(prompt, /summary/);
    assert.doesNotMatch(prompt, /quizQuestions/);
    assert.doesNotMatch(prompt, /correctOptionIndex/);
  });

  it("instructs the model to answer only in Albanian", () => {
    const prompt = buildSystemPrompt(["summary"]);
    assert.match(prompt, /në shqip/);
  });

  it("requires preserving technical terminology", () => {
    const prompt = buildSystemPrompt(["summary"]);
    assert.match(prompt, /terminologjinë teknike/i);
  });

  it("asks for concise summaries focused on important concepts", () => {
    const prompt = buildSystemPrompt(["summary"]);
    assert.match(prompt, /MË TË RËNDËSISHME/);
    assert.match(prompt, /Mos e zgjat pa nevojë/);
  });

  it("requires flashcards to have a question and a concise answer", () => {
    const prompt = buildSystemPrompt(["flashcards"]);
    assert.match(prompt, /pyetje të qartë/);
    assert.match(prompt, /përgjigje të shkurtër/);
  });

  it("requires exactly one correct quiz answer and prefers four options", () => {
    const prompt = buildSystemPrompt(["quiz"]);
    assert.match(prompt, /SAKTËSISHT NJË përgjigje të saktë/);
    assert.match(prompt, /KATËR alternativa/);
  });

  it("asks for quiz questions that are useful rather than trivial", () => {
    const prompt = buildSystemPrompt(["quiz"]);
    assert.match(prompt, /jo e parëndësishme/);
  });

  it("bounds output at the per-set list limits when no count is given", () => {
    // The Firestore rules can only validate 8 list entries, so an unspecified
    // request falls back to that maximum.
    assert.match(buildSystemPrompt(["flashcards"]), /SAKTËSISHT 8 karta/);
    assert.match(buildSystemPrompt(["quiz"]), /SAKTËSISHT 8 pyetje/);
  });

  it("asks for EXACTLY the number of items that were charged for", () => {
    // The quota is charged per requested item, so the model must not produce
    // more (which would over-deliver past the tier) or fewer (a silent
    // overcharge) than the user paid for.
    const prompt = buildSystemPrompt(["flashcards", "quiz"], {
      flashcards: 3,
      quizQuestions: 3,
    });

    assert.match(prompt, /SAKTËSISHT 3 karta/);
    assert.match(prompt, /SAKTËSISHT 3 pyetje/);
    assert.doesNotMatch(
      prompt,
      /SAKTËSISHT 8/,
      "the requested count must override the per-set maximum",
    );
  });

  it("states one count per requested kind, not a shared number", () => {
    const prompt = buildSystemPrompt(["flashcards", "quiz"], {
      flashcards: 5,
      quizQuestions: 2,
    });
    assert.match(prompt, /SAKTËSISHT 5 karta/);
    assert.match(prompt, /SAKTËSISHT 2 pyetje/);
  });

  it("shows ONE combined JSON example, not one per kind", () => {
    // Regression guard: three separate example objects invited the model to
    // return only the first one, which is how a request asking for a summary,
    // flashcards and a quiz came back with a summary alone.
    const prompt = buildSystemPrompt(["summary", "flashcards", "quiz"]);

    assert.match(prompt, /NJË objekt të vetëm JSON/);
    assert.match(prompt, /objektit të vetëm json/);

    // Every requested key appears inside a single example object.
    const example = prompt.slice(prompt.indexOf("objektit të vetëm json"));
    assert.match(example, /"summary":/);
    assert.match(example, /"flashcards":/);
    assert.match(example, /"quizQuestions":/);

    // And exactly one opening example brace for the whole object.
    assert.equal(
      (example.match(/"summary":/g) ?? []).length,
      1,
      "the summary must be exemplified once",
    );
  });

  it("uses a token budget large enough for the requested JSON", () => {
    assert.ok(MAX_OUTPUT_TOKENS >= 2048, "too low; JSON may be truncated");
  });

  it("builds a user prompt containing the title and text", () => {
    const prompt = buildUserPrompt("Biologji", "Qeliza është njësia e jetës.");
    assert.match(prompt, /Biologji/);
    assert.match(prompt, /Qeliza është njësia e jetës\./);
  });

  it("returns the expected response keys per kind", () => {
    assert.deepEqual(expectedKeys(["summary"]), ["summary"]);
    assert.deepEqual(expectedKeys(["summary", "quiz"]), ["summary", "quizQuestions"]);
    assert.deepEqual(expectedKeys(["summary", "flashcards", "quiz"]), [
      "summary",
      "flashcards",
      "quizQuestions",
    ]);
  });
});

// ===========================================================================
// JSON extraction — handling malformed model output
// ===========================================================================

describe("JSON extraction", () => {
  it("parses bare JSON", () => {
    assert.deepEqual(extractJson('{"summary":"Tekst"}'), { summary: "Tekst" });
  });

  it("parses JSON inside a markdown fence", () => {
    const raw = '```json\n{"summary":"Tekst"}\n```';
    assert.deepEqual(extractJson(raw), { summary: "Tekst" });
  });

  it("parses JSON in an unlabelled fence", () => {
    const raw = '```\n{"summary":"Tekst"}\n```';
    assert.deepEqual(extractJson(raw), { summary: "Tekst" });
  });

  it("recovers JSON surrounded by prose", () => {
    const raw = 'Sigurisht! Këtu është JSON-i:\n{"summary":"Tekst"}\nShpresoj të ndihmojë.';
    assert.deepEqual(extractJson(raw), { summary: "Tekst" });
  });

  it("handles nested objects and arrays", () => {
    const raw = JSON.stringify({
      quizQuestions: [
        { question: "P?", options: ["a", "b", "c", "d"], correctOptionIndex: 1 },
      ],
    });
    const parsed = extractJson(raw) as { quizQuestions: unknown[] };
    assert.equal(parsed.quizQuestions.length, 1);
  });

  it("preserves Albanian diacritics through parsing", () => {
    const parsed = extractJson('{"summary":"Qeliza është njësia bazë."}') as {
      summary: string;
    };
    assert.equal(parsed.summary, "Qeliza është njësia bazë.");
  });

  it("returns null for an empty response", () => {
    // Documented DeepSeek JSON-mode behaviour: content is occasionally empty.
    assert.equal(extractJson(""), null);
    assert.equal(extractJson("   \n  "), null);
  });

  it("returns null for plain prose with no JSON", () => {
    assert.equal(extractJson("Nuk mund ta bëj këtë."), null);
  });

  it("returns null for malformed JSON", () => {
    assert.equal(extractJson('{"summary": "e papërfunduar'), null);
    assert.equal(extractJson("{summary: no quotes}"), null);
  });

  it("returns null for a truncated response", () => {
    // Simulates the documented max_tokens truncation failure mode.
    assert.equal(extractJson('{"flashcards":[{"question":"P?","answer":"A.'), null);
  });

  it("parses a valid JSON array even though an object is expected", () => {
    // Extraction succeeds; schema validation is what rejects this.
    assert.deepEqual(extractJson("[1,2,3]"), [1, 2, 3]);
  });

  it("does not throw on any input", () => {
    for (const input of ["", "{", "}", "[]", "null", "undefined", "```", "{{{"]) {
      assert.doesNotThrow(() => extractJson(input), `input: ${JSON.stringify(input)}`);
    }
  });
});

// ===========================================================================
// End-to-end: extraction -> validation
// ===========================================================================

describe("model output to validated content", () => {
  it("accepts a well-formed fenced response", () => {
    const raw = '```json\n{"summary":"Përmbledhje e materialit."}\n```';
    const parsed = extractJson(raw);
    const content = parseStudyContent(parsed);
    assert.equal(content.summary, "Përmbledhje e materialit.");
  });

  it("accepts a combined response with all three kinds", () => {
    const raw = JSON.stringify({
      summary: "Përmbledhje.",
      flashcards: [{ question: "Çfarë është qeliza?", answer: "Njësia e jetës." }],
      quizQuestions: [
        {
          question: "Sa kromozome ka njeriu?",
          options: ["23", "46", "12", "64"],
          correctOptionIndex: 1,
          explanation: "Njeriu ka 46 kromozome.",
        },
      ],
    });

    const content = parseStudyContent(extractJson(raw));
    assert.ok(content.summary);
    assert.equal(content.flashcards?.length, 1);
    assert.equal(content.quizQuestions?.length, 1);
  });

  it("rejects prose that merely looks like JSON", () => {
    const parsed = extractJson("Eva nuk është JSON.");
    assert.equal(parsed, null, "nothing to validate");
  });
});

// ===========================================================================
// Response coverage — did the model deliver what was asked for?
// ===========================================================================
// A reply can be perfectly valid JSON and still omit a requested kind. That is
// how a request for a summary, flashcards and a quiz comes back as a summary
// alone, so it has to be detected explicitly rather than assumed.

describe("response coverage", () => {
  const allKinds = ["summary", "flashcards", "quiz"] as const;

  const complete = {
    summary: "Përmbledhje.",
    flashcards: [{ question: "P?", answer: "A." }],
    quizQuestions: [
      { question: "P?", options: ["a", "b"], correctOptionIndex: 0 },
    ],
  };

  it("reports nothing missing for a complete reply", () => {
    assert.deepEqual(missingRequestedKinds(complete, [...allKinds]), []);
  });

  it("detects a summary-only reply", () => {
    // The exact reported symptom.
    const partial = { summary: "Përmbledhje." };
    assert.deepEqual(missingRequestedKinds(partial, [...allKinds]), [
      "flashcards",
      "quiz",
    ]);
  });

  it("treats an EMPTY list as missing, not as present", () => {
    // "flashcards": [] is what the user experiences as "no flashcards".
    const empty = { summary: "P.", flashcards: [], quizQuestions: [] };
    assert.deepEqual(missingRequestedKinds(empty, [...allKinds]), [
      "flashcards",
      "quiz",
    ]);
  });

  it("treats a blank summary as missing", () => {
    const blank = { ...complete, summary: "   " };
    assert.deepEqual(missingRequestedKinds(blank, [...allKinds]), ["summary"]);
  });

  it("only judges the kinds that were actually requested", () => {
    // A summary-only request is complete with just a summary.
    assert.deepEqual(missingRequestedKinds(complete, ["summary"]), []);
    assert.deepEqual(missingRequestedKinds({ summary: "P." }, ["summary"]), []);
  });

  it("reports everything missing for a non-object reply", () => {
    assert.deepEqual(missingRequestedKinds(null, [...allKinds]), [...allKinds]);
    assert.deepEqual(missingRequestedKinds("text", [...allKinds]), [...allKinds]);
  });

  it("producesKind agrees with the list helper", () => {
    assert.equal(producesKind(complete, "flashcards"), true);
    assert.equal(producesKind(complete, "quiz"), true);
    assert.equal(producesKind(complete, "summary"), true);
    assert.equal(producesKind({}, "summary"), false);
  });

  it("names what is missing in Albanian, for the user", () => {
    const message = missingKindsMessage(["flashcards", "quiz"]);
    assert.ok(message);
    assert.match(message, /flashcards/);
    assert.match(message, /pyetjet e kuizit/);
    assert.match(message, /nuk u krijuan/);
  });

  it("uses correct Albanian for a single missing kind", () => {
    const message = missingKindsMessage(["flashcards"]);
    assert.ok(message);
    assert.match(message, /nuk u krijuan flashcards\./);
    assert.doesNotMatch(message, /dhe/);
  });

  it("says nothing when nothing is missing", () => {
    assert.equal(missingKindsMessage([]), null);
  });
});

// ===========================================================================
// The provider retries an INCOMPLETE reply rather than accepting it
// ===========================================================================

describe("incomplete reply handling", () => {
  it("the provider checks coverage and retries once", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/server/ai/deepseek-generate.ts",
      "utf8",
    );

    assert.match(
      source,
      /missingRequestedKinds\(/,
      "the provider must check whether the reply covered the request",
    );
    assert.match(
      source,
      /buildMissingInstruction\(/,
      "an incomplete reply must trigger a corrective instruction",
    );
    assert.match(
      source,
      /stillMissing\.length < missing\.length/,
      "a retry must only be accepted when it covers more, never less",
    );
  });
});
