/**
 * Server-renders the dashboard UI components to static HTML and asserts the
 * Task 7 requirements are actually present in the markup.
 *
 * This catches what a bundle string-search cannot: that the components render
 * without throwing, that required labels are in the DOM, and that no forbidden
 * styling (gradients, blur, glassmorphism) appears in the output.
 *
 * Run:  npm run test:render
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DropZone } from "../src/components/documents/drop-zone.tsx";
import { DocumentSummary } from "../src/components/documents/document-summary.tsx";
import { PlanPanel } from "../src/components/dashboard/plan-panel.tsx";
import { StudySetViewer } from "../src/components/dashboard/study-set-viewer.tsx";
import { FlashcardDeck } from "../src/components/study/flashcard-deck.tsx";
import { QuizRunner } from "../src/components/study/quiz-runner.tsx";
import { SummaryView } from "../src/components/study/summary-view.tsx";
import { usePlanLimitRows } from "../src/lib/plan-display.ts";

/** Renders a React element tree to HTML. */
function render(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

const noop = () => undefined;

describe("DropZone rendering", () => {
  const html = render(
    createElement(DropZone, {
      onFiles: noop,
      formatsLabel: "PDF, Word ose PowerPoint",
      sizeLabel: "Kufiri 25 MB.",
    }),
  );

  it("renders the drag-and-drop instruction in Albanian", () => {
    assert.match(html, /Tërhiq dhe lësho skedarët këtu/);
  });

  it("renders the accepted formats", () => {
    assert.match(html, /PDF, Word ose PowerPoint/);
    assert.match(html, /Kufiri 25 MB/);
  });

  it("renders a file-selection button", () => {
    assert.match(html, /Zgjidh skedar/);
    assert.match(html, /<button/);
  });

  it("renders a file input restricted to supported formats", () => {
    assert.match(html, /type="file"/);
    assert.match(html, /accept="\.pdf,\.docx,\.pptx"/);
  });

  it("marks the decorative icon as hidden from assistive tech", () => {
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /<svg/);
  });

  it("uses a dashed border to signal a drop target", () => {
    assert.match(html, /border-dashed/);
  });

  it("contains no gradients, blur, or glassmorphism", () => {
    assert.doesNotMatch(html, /gradient/i);
    assert.doesNotMatch(html, /backdrop-blur|blur\(/);
    assert.doesNotMatch(html, /bg-white\/|rgba\(255,\s*255,\s*255/);
  });

  it("disables the picker when disabled", () => {
    const disabledHtml = render(
      createElement(DropZone, {
        onFiles: noop,
        disabled: true,
        formatsLabel: "PDF",
        sizeLabel: "",
      }),
    );
    assert.match(disabledHtml, /disabled=""/);
  });
});

describe("DocumentSummary rendering", () => {
  const doc = {
    filename: "Biologji - Qeliza.pdf",
    sizeBytes: 2 * 1024 * 1024,
    format: "pdf" as const,
    text: "Qeliza është njësia bazë e jetës.",
    unitCount: 3,
    warnings: ["1 faqe nuk përmbante tekst dhe u anashkalua."],
    truncated: false,
  };

  const html = render(
    createElement(DocumentSummary, { document: doc, onReset: noop }),
  );

  it("shows the currently selected filename", () => {
    assert.match(html, /Biologji - Qeliza\.pdf/);
  });

  it("shows format, size, and unit count", () => {
    assert.match(html, /PDF/);
    assert.match(html, /2\.0 MB/);
    assert.match(html, /3 faqe/);
  });

  it("offers a way to remove the file", () => {
    assert.match(html, /Hiq skedarin/);
  });

  it("renders warnings", () => {
    assert.match(html, /nuk përmbante tekst/);
  });

  it("keeps the extracted text collapsed by default", () => {
    assert.match(html, /<details/);
  });

  it("states that the text is not persisted", () => {
    assert.match(html, /nuk\s+ruhet/);
  });

  it("contains no forbidden styling", () => {
    assert.doesNotMatch(html, /gradient/i);
    assert.doesNotMatch(html, /backdrop-blur/);
  });
});

// ===========================================================================
// Plan panel rendering
// ===========================================================================

describe("PlanPanel rendering", () => {
  const remaining = { dayKey: "2026-03-10", documents: 2, flashcards: 3, quizQuestions: 1 };

  it("shows the plan name", () => {
    const html = render(
      createElement(PlanPanel, { planId: "free", remaining, loading: false }),
    );
    assert.match(html, /Plani Falas/);
  });

  it("shows remaining against the limit for each metric", () => {
    const html = render(
      createElement(PlanPanel, { planId: "free", remaining, loading: false }),
    );
    assert.match(html, /2 nga 2/, "documents");
    assert.match(html, /3 nga 3/, "flashcards");
    assert.match(html, /1 nga 3/, "quiz questions");
  });

  it("labels all three metrics in Albanian", () => {
    const html = render(
      createElement(PlanPanel, { planId: "pro", remaining, loading: false }),
    );
    assert.match(html, /Dokumente/);
    assert.match(html, /Flashcards/);
    assert.match(html, /Pyetje kuizi/);
  });

  it("marks an exhausted metric as danger", () => {
    const html = render(
      createElement(PlanPanel, {
        planId: "free",
        remaining: { ...remaining, quizQuestions: 0 },
        loading: false,
      }),
    );
    assert.match(html, /text-danger/, "exhausted metric must stand out");
  });

  it("shows a loading state before quota arrives", () => {
    const html = render(
      createElement(PlanPanel, { planId: "free", remaining: null, loading: true }),
    );
    assert.match(html, /Duke lexuar kuotën/);
  });

  it("falls back to showing the limits when quota is unknown", () => {
    const html = render(
      createElement(PlanPanel, { planId: "free", remaining: null, loading: false }),
    );
    assert.match(html, /2 në ditë/);
    assert.match(html, /3 në ditë/);
  });

  it("contains no forbidden styling", () => {
    const html = render(
      createElement(PlanPanel, { planId: "pro", remaining, loading: false }),
    );
    assert.doesNotMatch(html, /gradient/i);
    assert.doesNotMatch(html, /backdrop-blur/);
  });
});

describe("plan limit rows", () => {
  it("returns one row per metric", () => {
    const rows = usePlanLimitRows("free", null);
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.key),
      ["documents", "flashcards", "quizQuestions"],
    );
  });

  it("uses the configured limits, not hardcoded values", () => {
    assert.equal(usePlanLimitRows("free", null)[0]?.limit, 2);
    assert.equal(usePlanLimitRows("plus", null)[0]?.limit, 50);
    assert.equal(usePlanLimitRows("pro", null)[0]?.limit, 200);
  });

  it("computes percent remaining", () => {
    const rows = usePlanLimitRows("free", {
      documents: 1,
      flashcards: 3,
      quizQuestions: 0,
    });
    assert.equal(rows[0]?.percentRemaining, 50, "1 of 2 documents");
    assert.equal(rows[1]?.percentRemaining, 100, "3 of 3 flashcards");
    assert.equal(rows[2]?.percentRemaining, 0, "0 of 3 quiz");
  });

  it("never reports negative remaining", () => {
    const rows = usePlanLimitRows("free", {
      documents: -5,
      flashcards: 999,
      quizQuestions: 999,
    });
    for (const row of rows) {
      assert.ok(row.remaining >= 0, `${row.key} must not be negative`);
      assert.ok(row.percentRemaining <= 100, `${row.key} must not exceed 100%`);
    }
  });
});

// ===========================================================================
// Study-set viewer rendering
// ===========================================================================

describe("StudySetViewer rendering", () => {
  const studySet = {
    id: "s1",
    title: "Biologji - Qeliza",
    summary: "Përmbledhje e materialit për qelizën.",
    flashcards: [{ question: "Çfarë është qeliza?", answer: "Njësia e jetës." }],
    quizQuestions: [
      {
        question: "Sa kromozome ka njeriu?",
        options: ["23", "46", "12", "64"],
        correctOptionIndex: 1,
        explanation: "Njeriu ka 46 kromozome.",
      },
    ],
    hasSummary: true,
    hasFlashcards: true,
    hasQuiz: true,
    flashcardCount: 1,
    quizQuestionCount: 1,
    sourceFormat: "pdf",
    sourceUnits: 24,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
  };

  const html = render(
    createElement(StudySetViewer, {
      studySet,
      onClose: noop,
      onRequestMore: noop,
    }),
  );

  it("shows the saved title", () => {
    assert.match(html, /Biologji - Qeliza/);
  });

  it("renders tabs for each available resource", () => {
    assert.match(html, /Përmbledhje/);
    assert.match(html, /Flashcards/);
    assert.match(html, /Kuiz/);
  });

  it("opens on the summary when one exists", () => {
    assert.match(html, /Përmbledhje e materialit/);
  });

  it("offers the regenerate action", () => {
    assert.match(html, /Gjenero materiale shtesë/);
  });

  it("states plainly that the original document is not stored", () => {
    assert.match(html, /Dokumenti origjinal nuk ruhet/);
  });

  it("does not offer any way to open the original document", () => {
    // The document was never stored, so no download/view link may appear.
    assert.doesNotMatch(html, /Shkarko|Dokumenti origjinal<\/a>|download=/);
  });

  it("hides tabs for resources that do not exist", () => {
    const summaryOnly = render(
      createElement(StudySetViewer, {
        studySet: {
          ...studySet,
          flashcards: [],
          quizQuestions: [],
          hasFlashcards: false,
          hasQuiz: false,
          flashcardCount: 0,
          quizQuestionCount: 0,
          sourceFormat: "pdf",
          sourceUnits: 24,
        },
        onClose: noop,
        onRequestMore: noop,
      }),
    );

    assert.match(summaryOnly, /Përmbledhje/);
    assert.doesNotMatch(summaryOnly, /role="tab"[^>]*>Flashcards/);
  });
});

describe("StudySetViewer quiz content", () => {
  it("shows the options and marks the correct one", () => {
    const html = render(
      createElement(StudySetViewer, {
        studySet: {
          id: "s2",
          title: "Kuiz",
          summary: null,
          flashcards: [],
          quizQuestions: [
            {
              question: "Sa kromozome ka njeriu?",
              options: ["23", "46", "12", "64"],
              correctOptionIndex: 1,
            },
          ],
          hasSummary: false,
          hasFlashcards: false,
          hasQuiz: true,
          flashcardCount: 0,
          quizQuestionCount: 1,
          sourceFormat: "pdf",
          sourceUnits: 24,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
        onClose: noop,
        onRequestMore: noop,
      }),
    );

    // Opens on quiz when it is the only resource.
    assert.match(html, /Sa kromozome ka njeriu\?/);
    assert.match(html, /text-success/, "the correct option must be marked");
  });
});

// ===========================================================================
// Flashcard deck rendering
// ===========================================================================

describe("FlashcardDeck rendering", () => {
  const cards = [
    { question: "Pyetja e parë?", answer: "Përgjigjja e parë." },
    { question: "Pyetja e dytë?", answer: "Përgjigjja e dytë." },
  ];

  const html = render(createElement(FlashcardDeck, { cards }));

  it("shows ONE card at a time", () => {
    assert.match(html, /Pyetja e parë\?/);
    assert.doesNotMatch(html, /Pyetja e dytë\?/, "only the current card shows");
  });

  it("keeps the answer on the hidden back face until revealed", () => {
    // The card flips in 3D, so both faces are in the DOM and the back face is
    // hidden by the rotation rather than being absent.
    assert.match(html, /data-flipped="false"/);
    assert.match(html, /flip-face-back/);
    assert.match(html, /E fshehur/);
  });

  it("shows progress as n / total", () => {
    assert.match(html, /1 \/ 2/);
  });

  it("provides previous and next controls", () => {
    assert.match(html, /Prapa/);
    assert.match(html, /Përpara/);
  });

  it("disables previous on the first card", () => {
    // The first card has no previous, so the control must be disabled.
    assert.match(html, /disabled=""/);
  });

  it("makes the card keyboard-accessible as a button", () => {
    assert.match(html, /<button[^>]*type="button"/);
    assert.match(html, /aria-expanded="false"/);
  });

  it("handles an empty deck gracefully", () => {
    const empty = render(createElement(FlashcardDeck, { cards: [] }));
    assert.match(empty, /nuk përmban flashcards/);
  });

  it("contains no forbidden styling", () => {
    assert.doesNotMatch(html, /gradient/i);
    assert.doesNotMatch(html, /backdrop-blur/);
  });
});

// ===========================================================================
// Quiz runner rendering
// ===========================================================================

describe("QuizRunner rendering", () => {
  const questions = [
    {
      question: "Sa kromozome ka njeriu?",
      options: ["23", "46", "12", "64"],
      correctOptionIndex: 1,
      explanation: "Njeriu ka 46 kromozome.",
    },
    {
      question: "Çfarë është qeliza?",
      options: ["Njësia e jetës", "Një organelë", "Një molekulë", "Një ind"],
      correctOptionIndex: 0,
    },
  ];

  const html = render(createElement(QuizRunner, { questions }));

  it("shows ONE question at a time", () => {
    assert.match(html, /Sa kromozome ka njeriu\?/);
    assert.doesNotMatch(html, /Çfarë është qeliza\?/);
  });

  it("renders every option as a radio choice", () => {
    assert.match(html, /type="radio"/);
    assert.match(html, /23/);
    assert.match(html, /46/);
    assert.match(html, /12/);
    assert.match(html, /64/);
  });

  it("does NOT reveal correctness before submission", () => {
    // The critical requirement: no (e saktë) marker and no feedback yet.
    assert.doesNotMatch(html, /e saktë/i);
    assert.doesNotMatch(html, /Saktë!/);
    assert.doesNotMatch(html, /Gabim/);
    assert.doesNotMatch(html, /Njeriu ka 46 kromozome/);
  });

  it("disables the check button until an option is chosen", () => {
    assert.match(html, /Kontrollo/);
    assert.match(html, /disabled=""/);
  });

  it("shows progress", () => {
    assert.match(html, /1 \/ 2/);
  });

  it("contains no forbidden styling", () => {
    assert.doesNotMatch(html, /gradient/i);
    assert.doesNotMatch(html, /backdrop-blur/);
  });

  it("handles an empty quiz gracefully", () => {
    const empty = render(createElement(QuizRunner, { questions: [] }));
    assert.match(empty, /nuk përmban pyetje kuizi/);
  });
});

// ===========================================================================
// Summary rendering
// ===========================================================================

describe("SummaryView rendering", () => {
  it("renders a titled bullet section as a topic group", () => {
    // A heading followed by bullets is presented as a topic, so the heading
    // becomes an h4 inside the "Temat" section rather than a bare h2. All the
    // content is still present and still real markup.
    const html = render(
      createElement(SummaryView, {
        summary: "# Titulli\n\nParagraf.\n\n- pika një\n- pika dy",
      }),
    );

    assert.match(html, /Titulli/);
    assert.match(html, /Paragraf\./);
    assert.match(html, /<ul[^>]*>/);
    assert.match(html, /pika një/);
    assert.match(html, /Temat/);
  });

  it("renders key points as a numbered list", () => {
    const html = render(
      createElement(SummaryView, {
        summary: "## Pikat kryesore\n- pika e parë\n- pika e dytë",
      }),
    );

    assert.match(html, /Pikat kryesore/);
    assert.match(html, /<ol[^>]*>/);
    assert.match(html, /pika e parë/);
    // Each point carries its own number badge.
    assert.match(html, />1</);
    assert.match(html, />2</);
  });

  it("renders definitions as term/description pairs", () => {
    const html = render(
      createElement(SummaryView, {
        summary:
          "## Definicione\n**Qeliza** — njësia bazë strukturore e organizmave.",
      }),
    );

    assert.match(html, /Definicione/);
    assert.match(html, /<dl[^>]*>/);
    assert.match(html, /<dt[^>]*>Qeliza<\/dt>/);
    assert.match(html, /njësia bazë strukturore/);
  });

  it("escapes HTML rather than rendering it", () => {
    // Model output is untrusted. Markup must appear as TEXT, never execute.
    const html = render(
      createElement(SummaryView, {
        summary: "Tekst <script>alert('xss')</script> i sigurt",
      }),
    );

    assert.doesNotMatch(html, /<script>/, "must not emit a script tag");
    assert.match(html, /&lt;script&gt;/, "must be escaped as text");
  });

  it("handles an empty summary", () => {
    const html = render(createElement(SummaryView, { summary: "" }));
    assert.match(html, /Përmbledhja është bosh/);
  });
});

// ===========================================================================
// Responsive + theme consistency
// ===========================================================================

describe("study screens are responsive and on-theme", () => {
  const STUDY_FILES = [
    "src/components/study/summary-view.tsx",
    "src/components/study/flashcard-deck.tsx",
    "src/components/study/quiz-runner.tsx",
    "src/components/study/study-experience.tsx",
    "src/app/(dashboard)/studim/page.tsx",
  ];

  it("contains no forbidden visual styling", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of STUDY_FILES) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of [
        "gradient",
        "backdrop-blur",
        "drop-shadow-",
        "animate-bounce",
        "sparkle",
        "bg-white/",
      ]) {
        assert.doesNotMatch(source, new RegExp(forbidden, "i"), `${file}: ${forbidden}`);
      }
    }
  });

  it("uses the dark theme tokens, not hardcoded colours", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of STUDY_FILES) {
      const source = readFileSync(file, "utf8");
      // Hardcoded light backgrounds would break the dark dashboard.
      assert.doesNotMatch(source, /bg-white\b(?!\/)/, file);
      assert.doesNotMatch(source, /bg-gray-50|bg-slate-50|bg-zinc-50/, file);
    }
  });

  it("avoids fixed widths that would overflow a phone screen", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of STUDY_FILES) {
      const source = readFileSync(file, "utf8");
      // A fixed pixel width larger than a phone viewport causes horizontal
      // scrolling. Percentages and max-w-* are fine.
      assert.doesNotMatch(source, /w-\[\d{3,}px\]/, `${file} has a fixed wide element`);
    }
  });

  it("wraps control rows so buttons do not overflow", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "src/components/study/flashcard-deck.tsx",
      "src/components/study/quiz-runner.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /flex-wrap/, `${file} must wrap its controls`);
    }
  });

  it("breaks long words so unbroken text cannot overflow", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "src/components/study/summary-view.tsx",
      "src/components/study/flashcard-deck.tsx",
      "src/components/study/quiz-runner.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /break-words/, `${file} must break long words`);
    }
  });
});

describe("study experience privacy", () => {
  it("does not persist the quiz score", async () => {
    const { readFileSync } = await import("node:fs");
    const runner = readFileSync("src/components/study/quiz-runner.tsx", "utf8");

    // The score lives in component state only; no write path may exist.
    assert.doesNotMatch(runner, /fetch\(|localStorage|sessionStorage/);
    assert.match(runner, /useState/, "score is session state");
  });

  it("never renders model output as raw HTML", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "src/components/study/summary-view.tsx",
      "src/components/study/quiz-runner.tsx",
      "src/components/study/flashcard-deck.tsx",
    ]) {
      // Strip comments first: a comment explaining WHY the pattern is avoided
      // must not be mistaken for an actual usage.
      const source = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join("\n");

      assert.doesNotMatch(
        source,
        /dangerouslySetInnerHTML/,
        `${file} must not inject HTML`,
      );
    }
  });
});
