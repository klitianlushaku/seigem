/**
 * History and regeneration tests.
 *
 * Run with:  npm run test:history
 *
 * Covers the rules that matter for Task 13:
 *   - regeneration context sufficiency (when to ask for a re-upload)
 *   - safe merging with duplicate avoidance
 *   - that a title alone is never treated as sufficient context
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_CONTEXT_CHARS,
  assessRegenerationContext,
  buildContextText,
  savedContentLength,
  REGENERATION_NOTICE,
} from "../src/lib/regeneration.ts";
import { dedupeFlashcards, dedupeQuizQuestions } from "../src/lib/merge.ts";

const card = (q: string, a: string) => ({ question: q, answer: a });
const question = (q: string, correct = 0) => ({
  question: q,
  options: ["a", "b", "c", "d"],
  correctOptionIndex: correct,
});

/** Long enough text to count as sufficient context. */
const LONG_SUMMARY = "Kjo është një përmbledhje e detajuar. ".repeat(20);

// ===========================================================================
// Context sufficiency
// ===========================================================================

describe("regeneration context", () => {
  it("refuses when nothing but a title exists", () => {
    // A title alone must NEVER be treated as the whole document.
    const assessment = assessRegenerationContext({
      title: "Biologji - Qeliza",
      summary: null,
      flashcards: [],
      quizQuestions: [],
    });

    assert.equal(assessment.sufficient, false);
    if (!assessment.sufficient) {
      assert.equal(assessment.reason, "no_content");
      assert.match(assessment.message, /ngarko përsëri/i);
      assert.match(assessment.message, /origjinal/i);
    }
  });

  it("refuses when saved content is too thin to be reliable", () => {
    const assessment = assessRegenerationContext({
      title: "Biologji",
      summary: "Shkurt.",
      flashcards: [card("P?", "A.")],
      quizQuestions: [],
    });

    assert.equal(assessment.sufficient, false);
    if (!assessment.sufficient) {
      assert.equal(assessment.reason, "title_only");
      assert.match(assessment.message, /ngarko përsëri/i);
    }
  });

  it("proceeds when a substantial summary exists", () => {
    const assessment = assessRegenerationContext({
      title: "Biologji",
      summary: LONG_SUMMARY,
      flashcards: [],
      quizQuestions: [],
    });

    assert.equal(assessment.sufficient, true);
    if (assessment.sufficient) {
      assert.equal(assessment.basis, "full");
      assert.match(assessment.contextText, /Biologji/);
      assert.match(assessment.contextText, /Përmbledhja e ruajtur/);
    }
  });

  it("proceeds from flashcards alone when there are enough", () => {
    const flashcards = Array.from({ length: 12 }, (_, i) =>
      card(
        `Pyetja numër ${i} për temën e biologjisë qelizore?`,
        `Përgjigjja e detajuar numër ${i} rreth strukturës qelizore.`,
      ),
    );

    const assessment = assessRegenerationContext({
      title: "Biologji",
      summary: null,
      flashcards,
      quizQuestions: [],
    });

    assert.equal(assessment.sufficient, true);
    if (assessment.sufficient) {
      // Without a summary the basis is partial, not full.
      assert.equal(assessment.basis, "partial");
    }
  });

  it("measures saved content excluding the title", () => {
    const withTitle = savedContentLength({
      title: "x".repeat(500),
      summary: null,
      flashcards: [],
      quizQuestions: [],
    });

    assert.equal(withTitle, 0, "the title must not count as content");
  });

  it("uses the documented minimum threshold", () => {
    assert.equal(MIN_CONTEXT_CHARS, 400);

    const justUnder = assessRegenerationContext({
      title: "T",
      summary: "x".repeat(MIN_CONTEXT_CHARS - 1),
      flashcards: [],
      quizQuestions: [],
    });
    const atThreshold = assessRegenerationContext({
      title: "T",
      summary: "x".repeat(MIN_CONTEXT_CHARS),
      flashcards: [],
      quizQuestions: [],
    });

    assert.equal(justUnder.sufficient, false);
    assert.equal(atThreshold.sufficient, true);
  });

  it("includes every saved resource in the context text", () => {
    const text = buildContextText({
      title: "Fizika",
      summary: LONG_SUMMARY,
      flashcards: [card("Sa është shpejtësia?", "Ndryshimi i pozicionit.")],
      quizQuestions: [question("Sa është nxitimi?", 1)],
    });

    assert.match(text, /Fizika/);
    assert.match(text, /Përmbledhja e ruajtur/);
    assert.match(text, /Flashcards të ruajtura/);
    assert.match(text, /Pyetje kuizi të ruajtura/);
    assert.match(text, /Sa është shpejtësia\?/);
    assert.match(text, /Sa është nxitimi\?/);
  });

  it("tells the model not to invent facts", () => {
    assert.match(REGENERATION_NOTICE, /Mos shpik fakte/);
    assert.match(REGENERATION_NOTICE, /nuk përmban dokumentin origjinal/);
  });
});

// ===========================================================================
// Merging and duplicate avoidance
// ===========================================================================

describe("flashcard merging", () => {
  it("keeps all cards when there are no duplicates", () => {
    const merged = dedupeFlashcards([
      card("P1", "A1"),
      card("P2", "A2"),
      card("P3", "A3"),
    ]);
    assert.equal(merged.length, 3);
  });

  it("removes an exact duplicate", () => {
    const merged = dedupeFlashcards([
      card("Çfarë është qeliza?", "Njësia e jetës."),
      card("Çfarë është qeliza?", "Njësia e jetës."),
    ]);
    assert.equal(merged.length, 1);
  });

  it("removes a duplicate that differs only in case or spacing", () => {
    const merged = dedupeFlashcards([
      card("Çfarë është qeliza?", "Njësia e jetës."),
      card("  çFARË ËSHTË QELIZA?  ", "Njësia e jetës."),
    ]);
    assert.equal(merged.length, 1, "obvious duplicates must collapse");
  });

  it("treats the same question with a different answer as a duplicate", () => {
    // Keyed on the question alone. Two cards asking the same thing but giving
    // different answers would show the student contradictory information, so
    // the first (already-saved) card wins.
    const merged = dedupeFlashcards([
      card("Përcakto energjinë.", "Aftësia për të kryer punë."),
      card("Përcakto energjinë.", "Madhësi e ruajtur."),
    ]);

    assert.equal(merged.length, 1);
    assert.equal(
      merged[0]?.answer,
      "Aftësia për të kryer punë.",
      "the first occurrence is kept",
    );
  });

  it("preserves order, keeping the first occurrence", () => {
    const merged = dedupeFlashcards([
      card("A", "1"),
      card("B", "2"),
      card("A", "1"),
      card("C", "3"),
    ]);
    assert.deepEqual(
      merged.map((c) => c.question),
      ["A", "B", "C"],
    );
  });

  it("handles an empty list", () => {
    assert.deepEqual(dedupeFlashcards([]), []);
  });

  it("merging saved with new avoids re-adding existing cards", () => {
    const saved = [card("P1", "A1"), card("P2", "A2")];
    const generated = [card("P2", "A2"), card("P3", "A3")];

    const merged = dedupeFlashcards([...saved, ...generated]);
    assert.equal(merged.length, 3, "only the genuinely new card is added");
    assert.deepEqual(
      merged.map((c) => c.question),
      ["P1", "P2", "P3"],
    );
  });
});

describe("quiz merging", () => {
  it("keeps all questions when there are no duplicates", () => {
    const merged = dedupeQuizQuestions([
      question("P1"),
      question("P2"),
      question("P3"),
    ]);
    assert.equal(merged.length, 3);
  });

  it("removes an exact duplicate", () => {
    const merged = dedupeQuizQuestions([question("P1"), question("P1")]);
    assert.equal(merged.length, 1);
  });

  it("removes a duplicate differing only in case or spacing", () => {
    const merged = dedupeQuizQuestions([
      question("Sa kromozome ka njeriu?"),
      question("  sa KROMOZOME ka njeriu?  "),
    ]);
    assert.equal(merged.length, 1);
  });

  it("preserves order", () => {
    const merged = dedupeQuizQuestions([
      question("A"),
      question("B"),
      question("A"),
    ]);
    assert.deepEqual(
      merged.map((q) => q.question),
      ["A", "B"],
    );
  });

  it("merging saved with new keeps the set coherent", () => {
    const saved = [question("P1"), question("P2")];
    const generated = [question("P2"), question("P3")];

    const merged = dedupeQuizQuestions([...saved, ...generated]);
    assert.equal(merged.length, 3);
  });

  it("retains the correct answer when de-duplicating", () => {
    const merged = dedupeQuizQuestions([
      { question: "P?", options: ["a", "b", "c", "d"], correctOptionIndex: 2 },
      { question: "P?", options: ["a", "b", "c", "d"], correctOptionIndex: 2 },
    ]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.correctOptionIndex, 2, "answer must survive");
  });
});

// ===========================================================================
// Privacy guarantees
// ===========================================================================

describe("history privacy guarantees", () => {
  it("the history route scopes reads to the authenticated uid", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/api/study-sets/route.ts", "utf8");

    // Ownership must come from the token, never from a query parameter.
    assert.match(source, /requireUser\(request\)/);
    assert.match(source, /decoded\.uid/);
    assert.doesNotMatch(
      source,
      /searchParams\.get\("uid"\)|searchParams\.get\("ownerUid"\)/,
    );
  });

  it("the regenerate route resolves the plan server-side", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/app/api/study-sets/regenerate/route.ts",
      "utf8",
    );
    assert.match(source, /getUserPlan\(decoded\.uid\)/);
  });

  it("regeneration never persists the re-uploaded text", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/ai/regenerate.ts", "utf8");

    // The text is passed to the model, but must never reach a persistence call.
    assert.match(source, /generationText/);
    assert.doesNotMatch(source, /createStudySet\([^)]*text/);
  });

  it("does not claim the original document is stored", async () => {
    const { readFileSync } = await import("node:fs");
    const viewer = readFileSync(
      "src/components/dashboard/study-set-viewer.tsx",
      "utf8",
    );

    assert.match(viewer, /Dokumenti origjinal nuk ruhet/);
    // No code path should try to fetch the source document.
    assert.doesNotMatch(viewer, /originalDocument|sourceFile|downloadUrl/);
  });
});
