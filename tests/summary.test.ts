/**
 * Summary structure tests.
 *
 * Run with:  npm run test:summary
 *
 * The summary parser is the part most likely to break silently: a misread
 * heading turns a glossary into prose and the user never sees definitions. These
 * tests pin the behaviour for the shapes a model actually emits.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  hasStructuredContent,
  parseDefinition,
  parseSummary,
  stripInlineMarkup,
} from "../src/lib/summary.ts";
import { planIncrement } from "../src/lib/incremental.ts";

/** A summary in the shape the prompt asks for. */
const STRUCTURED = `## Pikat kryesore
- Qeliza është njësia bazë e jetës.
- Mitokondria prodhon energji.

## Shpjegimi
Qeliza përmban organele të specializuara. Secila ka një funksion të caktuar.

## Definicione
**Qeliza** — njësia bazë strukturore dhe funksionale e organizmave.
**Mitokondria** — organela që prodhon energji përmes frymëmarrjes.`;

// ===========================================================================
// Structure
// ===========================================================================

describe("summary structure", () => {
  it("extracts the key points", () => {
    const parsed = parseSummary(STRUCTURED);
    assert.equal(parsed.keyPoints.length, 2);
    assert.match(parsed.keyPoints[0] ?? "", /Qeliza është njësia bazë/);
  });

  it("extracts the definitions with term and explanation", () => {
    const parsed = parseSummary(STRUCTURED);
    assert.equal(parsed.definitions.length, 2);
    assert.equal(parsed.definitions[0]?.term, "Qeliza");
    assert.match(
      parsed.definitions[0]?.explanation ?? "",
      /njësia bazë strukturore/,
    );
  });

  it("keeps the explanation prose", () => {
    const parsed = parseSummary(STRUCTURED);
    const prose = parsed.blocks
      .filter((block) => block.kind === "paragraph")
      .map((block) => (block.kind === "paragraph" ? block.text : ""))
      .join(" ");
    assert.match(prose, /organele të specializuara/);
  });

  it("reports structured content when sections exist", () => {
    assert.equal(hasStructuredContent(parseSummary(STRUCTURED)), true);
  });

  it("does not duplicate key points into the prose", () => {
    const parsed = parseSummary(STRUCTURED);
    const prose = JSON.stringify(parsed.blocks);
    assert.doesNotMatch(prose, /Mitokondria prodhon energji/);
  });
});

// ===========================================================================
// Tolerant parsing
// ===========================================================================

describe("tolerant parsing", () => {
  it("accepts accented and unaccented headings", () => {
    for (const heading of ["Pikat kryesore", "Pikat Kryesore", "pikat kryesore"]) {
      const parsed = parseSummary(`## ${heading}\n- Pika e parë.`);
      assert.equal(parsed.keyPoints.length, 1, heading);
    }
  });

  it("accepts a bold line instead of a heading", () => {
    const parsed = parseSummary(
      "**Pikat kryesore**\n- Pika e parë.\n- Pika e dytë.",
    );
    assert.equal(parsed.keyPoints.length, 2);
  });

  it("accepts variant heading names", () => {
    for (const heading of ["Konceptet kryesore", "Idet kryesore"]) {
      const parsed = parseSummary(`## ${heading}\n- Pika.`);
      assert.equal(parsed.keyPoints.length, 1, heading);
    }
  });

  it("accepts a glossary written with a colon instead of an em dash", () => {
    const parsed = parseSummary("## Definicione\n**Qeliza**: njësia bazë e jetës.");
    assert.equal(parsed.definitions.length, 1);
    assert.equal(parsed.definitions[0]?.term, "Qeliza");
  });

  it("accepts an unnumbered bullet list", () => {
    const parsed = parseSummary("## Pikat kryesore\n* Pika e parë.\n• Pika e dytë.");
    assert.equal(parsed.keyPoints.length, 2);
  });

  it("promotes a leading untitled bullet list to key points", () => {
    // Models often omit the heading entirely on the first section.
    const parsed = parseSummary("- Pika e parë.\n- Pika e dytë.");
    assert.equal(parsed.keyPoints.length, 2);
  });

  it("groups a themed section into topics", () => {
    const parsed = parseSummary(
      "## Fazat\n- Faza e parë.\n- Faza e dytë.\n\n## Tjetër\nTekst.",
    );
    assert.equal(parsed.groups.length, 1);
    assert.equal(parsed.groups[0]?.heading, "Fazat");
    assert.equal(parsed.groups[0]?.points.length, 2);
  });

  it("handles a plain prose summary with no sections", () => {
    const parsed = parseSummary(
      "Kjo është një përmbledhje e thjeshtë pa seksione.\n\nParagraf i dytë.",
    );
    assert.equal(hasStructuredContent(parsed), false);
    assert.equal(parsed.blocks.length, 2);
  });

  it("returns nothing for empty input", () => {
    const parsed = parseSummary("   \n\n  ");
    assert.equal(parsed.keyPoints.length, 0);
    assert.equal(parsed.definitions.length, 0);
    assert.equal(parsed.blocks.length, 0);
  });
});

// ===========================================================================
// Definition detection
// ===========================================================================

describe("definition detection", () => {
  it("recognises a bolded term", () => {
    const definition = parseDefinition("**Qeliza** — njësia bazë e jetës.");
    assert.equal(definition?.term, "Qeliza");
  });

  it("recognises a term with a colon", () => {
    const definition = parseDefinition("Entropia: masë e çrregullimit të sistemit.");
    assert.equal(definition?.term, "Entropia");
  });

  it("ignores an ordinary bullet with no separator", () => {
    // A plain key point must not be mistaken for a definition.
    assert.equal(parseDefinition("Qeliza është njësia bazë e jetës."), null);
  });

  it("ignores a sentence that ends in a question mark", () => {
    assert.equal(parseDefinition("Pse studiopme qelizën?"), null);
  });

  it("ignores a term that is really a whole sentence", () => {
    const long =
      "Kjo fjali është shumë e gjatë për të qenë një term i vetëm: vazhdon edhe më shumë.";
    assert.equal(parseDefinition(long), null);
  });

  it("ignores an explanation that is too short to be useful", () => {
    assert.equal(parseDefinition("Qeliza: e vogël"), null);
  });

  it("strips markup from both sides", () => {
    const definition = parseDefinition("**Energjia** — aftësia për të kryer punë.");
    assert.doesNotMatch(definition?.term ?? "", /\*/);
  });
});

describe("inline markup", () => {
  it("removes bold markers", () => {
    assert.equal(stripInlineMarkup("**tekst**"), "tekst");
  });

  it("removes code ticks", () => {
    assert.equal(stripInlineMarkup("`kodi`"), "kodi");
  });

  it("removes a leading bullet", () => {
    assert.equal(stripInlineMarkup("- teksti"), "teksti");
  });

  it("removes a leading number", () => {
    assert.equal(stripInlineMarkup("1. teksti"), "teksti");
  });

  it("leaves ordinary text alone", () => {
    assert.equal(stripInlineMarkup("Tekst i zakonshëm."), "Tekst i zakonshëm.");
  });
});

// ===========================================================================
// Incremental generation
// ===========================================================================

describe("incremental generation", () => {
  const both = { flashcards: true, quizQuestions: true };

  /** A free plan with a full daily allowance and an empty set. */
  const fresh = {
    flashcardsRemaining: 3,
    quizQuestionsRemaining: 3,
    flashcardsInSet: 0,
    quizQuestionsInSet: 0,
    maxPerSet: 8,
  };

  it("offers a batch of 3 when quota allows", () => {
    const plan = planIncrement(fresh, both);
    assert.equal(plan.canAdd, true);
    assert.equal(plan.flashcards, 3);
    assert.equal(plan.quizQuestions, 3);
  });

  it("offers only what the remaining quota allows", () => {
    // Free plan, two flashcard units already spent today.
    const plan = planIncrement(
      { ...fresh, flashcardsRemaining: 1, quizQuestionsRemaining: 3 },
      both,
    );
    assert.equal(plan.flashcards, 1);
    assert.equal(plan.quizQuestions, 3);
  });

  it("blocks when the daily quota is exhausted", () => {
    const plan = planIncrement(
      { ...fresh, flashcardsRemaining: 0, quizQuestionsRemaining: 0 },
      both,
    );
    assert.equal(plan.canAdd, false);
    assert.equal(plan.blockedByPlan, true);
    assert.match(plan.reason ?? "", /kufirin ditor/);
  });

  it("blocks when the study set is full", () => {
    const plan = planIncrement(
      { ...fresh, flashcardsInSet: 8, quizQuestionsInSet: 8 },
      both,
    );
    assert.equal(plan.canAdd, false);
    assert.equal(plan.blockedBySetSize, true);
    assert.match(plan.reason ?? "", /arritur kufirin/);
  });

  it("reports the set ceiling before the plan ceiling", () => {
    // Both are hit. The set limit does not reset tomorrow, so saying "wait"
    // would be misleading.
    const plan = planIncrement(
      {
        ...fresh,
        flashcardsRemaining: 0,
        quizQuestionsRemaining: 0,
        flashcardsInSet: 8,
        quizQuestionsInSet: 8,
      },
      both,
    );
    assert.equal(plan.blockedBySetSize, true);
    assert.equal(plan.blockedByPlan, false);
  });

  it("reports the plan ceiling when only the plan is exhausted", () => {
    const plan = planIncrement(
      { ...fresh, flashcardsRemaining: 0, quizQuestionsRemaining: 0 },
      both,
    );
    assert.equal(plan.blockedByPlan, true);
    assert.equal(plan.blockedBySetSize, false);
  });

  it("allows repeated batches until the ceiling", () => {
    // Simulates pressing "+3" three times on the free plan.
    let used = 0;
    let inSet = 0;
    const steps: number[] = [];

    for (let i = 0; i < 4; i += 1) {
      const plan = planIncrement(
        {
          flashcardsRemaining: 3 - used,
          quizQuestionsRemaining: 3 - used,
          flashcardsInSet: inSet,
          quizQuestionsInSet: inSet,
          maxPerSet: 8,
        },
        both,
      );

      if (!plan.canAdd) break;
      steps.push(plan.flashcards);
      used += plan.flashcards;
      inSet += plan.flashcards;
    }

    assert.deepEqual(steps, [3], "the free plan allows exactly one batch");
    assert.equal(used, 3);
  });

  it("allows a Pro user many batches before the set fills", () => {
    let used = 0;
    let inSet = 0;
    let batches = 0;

    for (let i = 0; i < 20; i += 1) {
      const plan = planIncrement(
        {
          flashcardsRemaining: 200 - used,
          quizQuestionsRemaining: 200 - used,
          flashcardsInSet: inSet,
          quizQuestionsInSet: inSet,
          maxPerSet: 8,
        },
        both,
      );

      if (!plan.canAdd) break;
      batches += 1;
      used += plan.flashcards;
      inSet += plan.flashcards;
    }

    // Three batches fill the set (3 + 3 + 2), well inside the Pro quota.
    assert.equal(batches, 3);
    assert.equal(inSet, 8);
  });

  it("only counts the kinds the user asked for", () => {
    const plan = planIncrement(fresh, {
      flashcards: true,
      quizQuestions: false,
    });
    assert.equal(plan.flashcards, 3);
    assert.equal(plan.quizQuestions, 0);
  });
});
