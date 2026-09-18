/**
 * Study experience tests.
 *
 * Run with:  npm run test:study
 *
 * Covers the logic behind the three study modes: summary block parsing,
 * flashcard navigation, and quiz scoring.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Summary parsing moved to a pure module in `@/lib/summary`, where it can be
// tested directly; `summary-view.tsx` now only renders the parsed result.
import { parseSummaryText as parseSummaryBlocks } from "../src/lib/summary.ts";
import {
  answerFor,
  buildResult,
  clampIndex,
  createQuizSession,
  isComplete,
  recordAnswer,
  resultMessage,
  scoreOf,
} from "../src/lib/quiz.ts";

const question = (q: string, correct = 0, explanation?: string) => ({
  question: q,
  options: ["a", "b", "c", "d"],
  correctOptionIndex: correct,
  ...(explanation ? { explanation } : {}),
});

const QUESTIONS = [
  question("P1", 0, "Shpjegimi 1"),
  question("P2", 1),
  question("P3", 2),
];

// ===========================================================================
// Summary parsing
// ===========================================================================

describe("summary parsing", () => {
  it("parses plain text into paragraphs", () => {
    const blocks = parseSummaryBlocks("Paragrafi i parë.\n\nParagrafi i dytë.");
    assert.deepEqual(blocks, [
      { kind: "paragraph", text: "Paragrafi i parë." },
      { kind: "paragraph", text: "Paragrafi i dytë." },
    ]);
  });

  it("parses markdown headings by level", () => {
    const blocks = parseSummaryBlocks("# Titulli\n\n## Nëntitulli\n\nTekst.");
    assert.equal(blocks[0]?.kind, "heading");
    assert.equal(blocks[1]?.kind, "heading");
    assert.equal(blocks[2]?.kind, "paragraph");

    const first = blocks[0];
    const second = blocks[1];
    if (first?.kind === "heading") assert.equal(first.level, 1);
    if (second?.kind === "heading") assert.equal(second.level, 2);
  });

  it("groups consecutive bullets into ONE list", () => {
    const blocks = parseSummaryBlocks("- Pika e parë\n- Pika e dytë\n- E treta");

    assert.equal(blocks.length, 1, "one list, not three");
    const list = blocks[0];
    assert.equal(list?.kind, "list");
    if (list?.kind === "list") {
      assert.equal(list.ordered, false);
      assert.deepEqual(list.items, ["Pika e parë", "Pika e dytë", "E treta"]);
    }
  });

  it("groups consecutive numbered lines into an ordered list", () => {
    const blocks = parseSummaryBlocks("1. Hapi i parë\n2. Hapi i dytë");

    const list = blocks[0];
    assert.equal(list?.kind, "list");
    if (list?.kind === "list") {
      assert.equal(list.ordered, true);
      assert.deepEqual(list.items, ["Hapi i parë", "Hapi i dytë"]);
    }
  });

  it("accepts alternative bullet and numbering styles", () => {
    for (const bullet of ["- a\n- b", "* a\n* b", "• a\n• b"]) {
      const blocks = parseSummaryBlocks(bullet);
      assert.equal(blocks[0]?.kind, "list", bullet);
    }
    for (const ordered of ["1. a\n2. b", "1) a\n2) b"]) {
      const blocks = parseSummaryBlocks(ordered);
      const list = blocks[0];
      if (list?.kind === "list") assert.equal(list.ordered, true, ordered);
    }
  });

  it("splits a bullet list from a following numbered list", () => {
    const blocks = parseSummaryBlocks("- pika\n1. hapi");
    assert.equal(blocks.length, 2, "different list types must not merge");
  });

  it("ends a list when a paragraph follows", () => {
    const blocks = parseSummaryBlocks("- pika\n\nTekst normal.");
    assert.equal(blocks.length, 2);
    assert.equal(blocks[1]?.kind, "paragraph");
  });

  it("handles a heading immediately followed by a list", () => {
    const blocks = parseSummaryBlocks("# Titulli\n- pika");
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0]?.kind, "heading");
    assert.equal(blocks[1]?.kind, "list");
  });

  it("ignores blank lines and collapses runs of them", () => {
    const blocks = parseSummaryBlocks("A\n\n\n\n\nB");
    assert.equal(blocks.length, 2, "blank runs must not create empty blocks");
  });

  it("returns no blocks for empty input", () => {
    assert.deepEqual(parseSummaryBlocks(""), []);
    assert.deepEqual(parseSummaryBlocks("   \n\n  "), []);
  });

  it("preserves Albanian diacritics and punctuation", () => {
    const blocks = parseSummaryBlocks("## Përmbledhje e qelizës\n\nQeliza është njësia bazë.");
    const heading = blocks[0];
    if (heading?.kind === "heading") {
      assert.equal(heading.text, "Përmbledhje e qelizës");
    }
    const paragraph = blocks[1];
    if (paragraph?.kind === "paragraph") {
      assert.match(paragraph.text, /është/);
    }
  });

  it("does not treat a mid-line hash as a heading", () => {
    const blocks = parseSummaryBlocks("Kjo është # jo titull");
    assert.equal(blocks[0]?.kind, "paragraph");
  });

  it("does not treat a mid-line dash as a bullet", () => {
    const blocks = parseSummaryBlocks("Fjala - vazhdon fjalia");
    assert.equal(blocks[0]?.kind, "paragraph");
  });
});

// ===========================================================================
// Quiz scoring
// ===========================================================================

describe("quiz scoring", () => {
  it("starts empty at the first question", () => {
    const session = createQuizSession();
    assert.equal(session.currentIndex, 0);
    assert.deepEqual(session.answers, []);
    assert.equal(scoreOf(session), 0);
  });

  it("counts a correct answer", () => {
    let session = createQuizSession();
    session = recordAnswer(session, 0, 0, QUESTIONS); // correct is 0
    assert.equal(scoreOf(session), 1);
  });

  it("does not count an incorrect answer", () => {
    let session = createQuizSession();
    session = recordAnswer(session, 0, 3, QUESTIONS); // correct is 0
    assert.equal(scoreOf(session), 0);
  });

  it("REPLACES an answer when the same question is re-answered", () => {
    // Going back and changing a selection must not double-count.
    let session = createQuizSession();
    session = recordAnswer(session, 0, 3, QUESTIONS); // wrong
    assert.equal(scoreOf(session), 0);

    session = recordAnswer(session, 0, 0, QUESTIONS); // corrected
    assert.equal(session.answers.length, 1, "one entry per question");
    assert.equal(scoreOf(session), 1);
  });

  it("tracks a full attempt", () => {
    let session = createQuizSession();
    session = recordAnswer(session, 0, 0, QUESTIONS); // correct
    session = recordAnswer(session, 1, 1, QUESTIONS); // correct
    session = recordAnswer(session, 2, 0, QUESTIONS); // wrong

    assert.equal(scoreOf(session), 2);
    assert.equal(isComplete(session, QUESTIONS), true);
  });

  it("ignores an answer for a question that does not exist", () => {
    const session = recordAnswer(createQuizSession(), 99, 0, QUESTIONS);
    assert.deepEqual(session.answers, []);
  });

  it("finds the recorded answer for a question", () => {
    let session = createQuizSession();
    session = recordAnswer(session, 1, 3, QUESTIONS);

    const answer = answerFor(session, 1);
    assert.equal(answer?.selectedIndex, 3);
    assert.equal(answer?.correct, false);

    assert.equal(answerFor(session, 0), null);
  });

  it("is not complete until every question is answered", () => {
    let session = createQuizSession();
    session = recordAnswer(session, 0, 0, QUESTIONS);
    assert.equal(isComplete(session, QUESTIONS), false);

    session = recordAnswer(session, 1, 1, QUESTIONS);
    session = recordAnswer(session, 2, 2, QUESTIONS);
    assert.equal(isComplete(session, QUESTIONS), true);
  });

  it("treats an empty quiz as incomplete", () => {
    assert.equal(isComplete(createQuizSession(), []), false);
  });
});

// ===========================================================================
// Final result
// ===========================================================================

describe("final result", () => {
  function attempt(selections: number[]) {
    let session = createQuizSession();
    selections.forEach((selection, index) => {
      session = recordAnswer(session, index, selection, QUESTIONS);
    });
    return session;
  }

  it("reports the score and percentage", () => {
    const result = buildResult(attempt([0, 1, 2]), QUESTIONS);
    assert.equal(result.correct, 3);
    assert.equal(result.total, 3);
    assert.equal(result.percentage, 100);
  });

  it("computes a partial percentage", () => {
    const result = buildResult(attempt([0, 0, 0]), QUESTIONS);
    assert.equal(result.correct, 1);
    assert.equal(result.percentage, 33);
  });

  it("handles a zero score", () => {
    const result = buildResult(attempt([3, 3, 3]), QUESTIONS);
    assert.equal(result.correct, 0);
    assert.equal(result.percentage, 0);
  });

  it("does not divide by zero on an empty quiz", () => {
    const result = buildResult(createQuizSession(), []);
    assert.equal(result.percentage, 0);
    assert.equal(result.total, 0);
  });

  it("gives Albanian feedback for each band", () => {
    assert.match(resultMessage(100), /Përsosur/);
    assert.match(resultMessage(80), /Shumë mirë/);
    assert.match(resultMessage(60), /vend për përmirësim/);
    assert.match(resultMessage(40), /përsëritësh/);
    assert.match(resultMessage(0), /Rishiko/);
  });
});

// ===========================================================================
// Navigation bounds
// ===========================================================================

describe("index clamping", () => {
  it("keeps an index inside the list", () => {
    assert.equal(clampIndex(0, 5), 0);
    assert.equal(clampIndex(4, 5), 4);
    assert.equal(clampIndex(5, 5), 4, "cannot go past the end");
    assert.equal(clampIndex(-1, 5), 0, "cannot go before the start");
  });

  it("returns 0 for an empty list", () => {
    assert.equal(clampIndex(0, 0), 0);
    assert.equal(clampIndex(5, 0), 0);
  });
});
