/**
 * Generation validation tests.
 *
 * Run with:  npm run test:generate
 *
 * These cover the two trust boundaries in Task 8:
 *   1. request parsing — what a (possibly manipulated) client sends
 *   2. response parsing — what the model returns before anything is persisted
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseGenerationRequest,
  parseStudyContent,
} from "../src/server/ai/validation.ts";
import { MAX_EXTRACTED_TEXT_CHARS } from "../src/config/app.ts";

// ===========================================================================
// Request parsing
// ===========================================================================

describe("generation request parsing", () => {
  const valid = {
    title: "Biologji - Qeliza",
    text: "Qeliza është njësia bazë e jetës.",
    kinds: ["summary"],
  };

  it("accepts a well-formed request", () => {
    const result = parseGenerationRequest(valid);
    assert.equal(result.title, "Biologji - Qeliza");
    assert.deepEqual(result.kinds, ["summary"]);
  });

  it("accepts multiple generation kinds", () => {
    const result = parseGenerationRequest({
      ...valid,
      kinds: ["summary", "flashcards", "quiz"],
    });
    assert.deepEqual(result.kinds, ["summary", "flashcards", "quiz"]);
  });

  it("de-duplicates repeated kinds", () => {
    const result = parseGenerationRequest({
      ...valid,
      kinds: ["quiz", "quiz", "summary"],
    });
    assert.deepEqual(result.kinds, ["quiz", "summary"]);
  });

  it("rejects a non-object body", () => {
    assert.throws(() => parseGenerationRequest("nope"), /nuk është e vlefshme/i);
    assert.throws(() => parseGenerationRequest(null), /nuk është e vlefshme/i);
    assert.throws(() => parseGenerationRequest([]), /nuk është e vlefshme/i);
  });

  it("rejects a missing or empty title", () => {
    assert.throws(() => parseGenerationRequest({ ...valid, title: undefined }), /Titulli/i);
    assert.throws(() => parseGenerationRequest({ ...valid, title: "   " }), /bosh/i);
  });

  it("rejects missing or empty text", () => {
    assert.throws(() => parseGenerationRequest({ ...valid, text: undefined }), /Teksti/i);
    assert.throws(() => parseGenerationRequest({ ...valid, text: "   " }), /lexueshëm/i);
  });

  it("rejects oversized text", () => {
    const huge = "a".repeat(MAX_EXTRACTED_TEXT_CHARS + 1);
    assert.throws(
      () => parseGenerationRequest({ ...valid, text: huge }),
      /tejkalon kufirin/i,
    );
  });

  it("accepts text exactly at the limit", () => {
    const exact = "a".repeat(MAX_EXTRACTED_TEXT_CHARS);
    const result = parseGenerationRequest({ ...valid, text: exact });
    assert.equal(result.text.length, MAX_EXTRACTED_TEXT_CHARS);
  });

  it("rejects an empty kinds array", () => {
    assert.throws(
      () => parseGenerationRequest({ ...valid, kinds: [] }),
      /të paktën një/i,
    );
  });

  it("rejects an unknown kind", () => {
    assert.throws(
      () => parseGenerationRequest({ ...valid, kinds: ["summary", "essay"] }),
      /nuk njihet/i,
    );
  });

  it("clamps requested counts to the storable maximum", () => {
    const result = parseGenerationRequest({
      ...valid,
      flashcards: 9999,
      quizQuestions: 9999,
    });
    assert.ok(result.flashcards <= 8, `got ${result.flashcards}`);
    assert.ok(result.quizQuestions <= 8, `got ${result.quizQuestions}`);
  });

  it("rejects a negative flashcard count", () => {
    // A negative count would reduce usage, i.e. hand out free quota.
    const result = parseGenerationRequest({ ...valid, flashcards: -10 });
    assert.ok(result.flashcards >= 1, `got ${result.flashcards}`);
  });

  it("truncates an overlong title rather than rejecting it", () => {
    const result = parseGenerationRequest({ ...valid, title: "x".repeat(500) });
    assert.ok(result.title.length <= 120, "title must be capped at 120 chars");
  });

  it("does not pass through unknown top-level fields", () => {
    const result = parseGenerationRequest({
      ...valid,
      rawText: "should never be persisted",
      ownerUid: "attacker-chosen-uid",
      plan: "pro",
    });

    // The parser returns a fixed shape. Unknown fields are dropped entirely —
    // critically, a client cannot inject its own ownerUid or plan.
    const asRecord: Record<string, unknown> = { ...result };
    assert.deepEqual(Object.keys(asRecord).sort(), [
      "flashcards",
      "kinds",
      "quizQuestions",
      "sourceFormat",
      "sourceUnits",
      "text",
      "title",
      "uploads",
    ]);
    assert.equal(
      asRecord.ownerUid,
      undefined,
      "ownerUid must never come from the body",
    );
    assert.equal(asRecord.plan, undefined);
    assert.equal(asRecord.rawText, undefined);
  });

  it("accepts display-only source metadata", () => {
    const result = parseGenerationRequest({
      ...valid,
      sourceFormat: "pdf",
      sourceUnits: 24,
    });

    assert.equal(result.sourceFormat, "pdf");
    assert.equal(result.sourceUnits, 24);
  });

  it("rejects an unknown source format", () => {
    // Only the three supported formats may be recorded.
    const result = parseGenerationRequest({ ...valid, sourceFormat: "exe" });
    assert.equal(result.sourceFormat, null);
  });

  it("rejects nonsense source metadata", () => {
    assert.equal(
      parseGenerationRequest({ ...valid, sourceUnits: -5 }).sourceUnits,
      null,
    );
    assert.equal(
      parseGenerationRequest({ ...valid, sourceUnits: 999_999 }).sourceUnits,
      null,
    );
    assert.equal(
      parseGenerationRequest({ ...valid, sourceUnits: "24" }).sourceUnits,
      null,
    );
  });

  it("defaults uploads to 1 for a first-time generation", () => {
    const result = parseGenerationRequest(valid);
    assert.equal(result.uploads, 1, "a new upload consumes one document unit");
  });

  it("honours an explicit uploads value of 0 (regeneration)", () => {
    const result = parseGenerationRequest({ ...valid, uploads: 0 });
    assert.equal(result.uploads, 0, "regeneration must not re-charge the upload");
  });

  it("rejects a negative uploads value", () => {
    // A negative upload count would credit the user's document allowance.
    const result = parseGenerationRequest({ ...valid, uploads: -5 });
    assert.equal(result.uploads, 0);
  });
});

// ===========================================================================
// Response parsing
// ===========================================================================

describe("model response parsing", () => {
  it("parses a summary", () => {
    const content = parseStudyContent({ summary: "  Përmbledhje.  " });
    assert.equal(content.summary, "Përmbledhje.");
  });

  it("parses flashcards", () => {
    const content = parseStudyContent({
      flashcards: [{ question: "Çfarë është qeliza?", answer: "Njësia e jetës." }],
    });
    assert.equal(content.flashcards?.length, 1);
    assert.equal(content.flashcards?.[0]?.question, "Çfarë është qeliza?");
  });

  it("parses quiz questions with a valid correct answer", () => {
    const content = parseStudyContent({
      quizQuestions: [
        {
          question: "Sa kromozome ka njeriu?",
          options: ["23", "46", "12", "64"],
          correctOptionIndex: 1,
          explanation: "Njeriu ka 46 kromozome.",
        },
      ],
    });
    assert.equal(content.quizQuestions?.[0]?.correctOptionIndex, 1);
    assert.equal(content.quizQuestions?.[0]?.explanation, "Njeriu ka 46 kromozome.");
  });

  it("omits an explanation when absent", () => {
    const content = parseStudyContent({
      quizQuestions: [
        { question: "Pyetje?", options: ["a", "b"], correctOptionIndex: 0 },
      ],
    });
    assert.equal("explanation" in (content.quizQuestions?.[0] ?? {}), false);
  });

  it("drops flashcards missing a side", () => {
    const content = parseStudyContent({
      flashcards: [
        { question: "E vlefshme?", answer: "Po." },
        { question: "", answer: "Pa pyetje." },
        { question: "Pa përgjigje?", answer: "" },
      ],
    });
    assert.equal(content.flashcards?.length, 1);
  });

  it("drops quiz questions whose correct answer is out of range", () => {
    const content = parseStudyContent({
      quizQuestions: [
        { question: "E vlefshme?", options: ["a", "b"], correctOptionIndex: 0 },
        { question: "Keq?", options: ["a", "b"], correctOptionIndex: 9 },
      ],
    });
    assert.equal(content.quizQuestions?.length, 1);
  });

  it("drops quiz questions with fewer than two options", () => {
    // The single invalid question leaves nothing usable, so parsing fails
    // rather than returning an empty content object. Nothing is persisted and
    // the caller refunds the quota.
    assert.throws(
      () =>
        parseStudyContent({
          quizQuestions: [
            { question: "Vetëm një?", options: ["a"], correctOptionIndex: 0 },
          ],
        }),
      /nuk ktheu përmbajtje/i,
    );
  });

  it("keeps valid questions while dropping malformed ones", () => {
    const content = parseStudyContent({
      quizQuestions: [
        { question: "E vlefshme?", options: ["a", "b"], correctOptionIndex: 1 },
        { question: "Vetëm një?", options: ["a"], correctOptionIndex: 0 },
      ],
    });
    assert.equal(content.quizQuestions?.length, 1);
    assert.equal(content.quizQuestions?.[0]?.question, "E vlefshme?");
  });

  it("caps flashcards at the per-set limit", () => {
    const content = parseStudyContent({
      flashcards: Array.from({ length: 50 }, (_, i) => ({
        question: `Pyetja ${i}?`,
        answer: `Përgjigjja ${i}.`,
      })),
    });
    assert.ok(
      (content.flashcards?.length ?? 0) <= 8,
      `expected <= 8, got ${content.flashcards?.length}`,
    );
  });

  it("caps quiz questions at the per-set limit", () => {
    const content = parseStudyContent({
      quizQuestions: Array.from({ length: 50 }, (_, i) => ({
        question: `Pyetja ${i}?`,
        options: ["a", "b", "c", "d"],
        correctOptionIndex: 0,
      })),
    });
    assert.ok((content.quizQuestions?.length ?? 0) <= 8);
  });

  it("THROWS when the model returns nothing usable", () => {
    assert.throws(() => parseStudyContent({}), /nuk ktheu përmbajtje/i);
    assert.throws(() => parseStudyContent({ summary: "  " }), /nuk ktheu përmbajtje/i);
    assert.throws(() => parseStudyContent(null), /formatin e pritur/i);
    assert.throws(() => parseStudyContent("plain text"), /formatin e pritur/i);
  });

  it("THROWS when the model returns arbitrary prose instead of JSON", () => {
    // A model that ignores the JSON instruction must not be persisted.
    assert.throws(
      () => parseStudyContent({ summary: 123 }),
      /nuk është tekst/i,
    );
    assert.throws(
      () => parseStudyContent({ flashcards: "not-an-array" }),
      /formatin e saktë/i,
    );
  });

  it("rejects a summary that is unreasonably long", () => {
    assert.throws(
      () => parseStudyContent({ summary: "x".repeat(20_001) }),
      /shumë e gjatë/i,
    );
  });
});
