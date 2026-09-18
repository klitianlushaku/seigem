/**
 * Dashboard rendering tests.
 *
 * Run with:  npm run test:dashboard
 *
 * Covers the redesigned dashboard: the panel shell, statistic tiles, and the
 * working panels. These assert that the required Albanian labels are actually
 * rendered and that the flat, light-theme constraints hold.
 *
 * Authored as JSX (hence .tsx) because several components take required
 * children, which `React.createElement` cannot express without passing
 * `children` as a prop.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { Panel } from "../src/components/dashboard/panel.tsx";
import { DateTile, StatTile } from "../src/components/dashboard/stat-tile.tsx";
import { FlashcardsPanel } from "../src/components/dashboard/flashcards-panel.tsx";
import { QuizPanel } from "../src/components/dashboard/quiz-panel.tsx";
import { ContinueSection } from "../src/components/dashboard/continue-section.tsx";
import { QuickActions } from "../src/components/dashboard/quick-actions.tsx";
import {
  albanianDate,
  formatAlbanianDate,
  relativeAlbanianDate,
} from "../src/lib/utils/albanian-date.ts";
import { ClockIcon } from "../src/components/ui/icons.tsx";

/** Renders a React element tree to HTML. */
function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

// ===========================================================================
// Panel shell
// ===========================================================================

describe("Panel shell", () => {
  const html = render(
    <Panel
      id="seksioni"
      icon={ClockIcon}
      tone="purple"
      title="Titulli"
      subtitle="Nëntitulli shpjegues."
    >
      <p>Përmbajtja</p>
    </Panel>,
  );

  it("renders the anchor id so sidebar links work", () => {
    assert.match(html, /id="seksioni"/);
  });

  it("renders the title and subtitle", () => {
    assert.match(html, /Titulli/);
    assert.match(html, /Nëntitulli shpjegues\./);
  });

  it("renders the body", () => {
    assert.match(html, /Përmbajtja/);
  });

  it("uses a tinted tile, not a gradient", () => {
    // A flat low-opacity accent fill; the palette stays gradient-free.
    assert.match(html, /bg-stat-purple\/12/);
    assert.doesNotMatch(html, /gradient/i);
  });
});

// ===========================================================================
// Statistic and date tiles
// ===========================================================================

describe("statistic tile", () => {
  const html = render(
    <StatTile
      icon={ClockIcon}
      tone="blue"
      label="Studimi sot"
      value="2h 15m"
      sublabel="kohë aktive"
      title="Koha e kaluar duke studiuar sot."
    />,
  );

  it("renders the label, value and sub-label", () => {
    assert.match(html, /Studimi sot/);
    assert.match(html, /2h 15m/);
    assert.match(html, /kohë aktive/);
  });

  it("explains what the number counts", () => {
    assert.match(html, /Koha e kaluar duke studiuar sot\./);
  });

  it("shows a placeholder while loading", () => {
    const loading = render(
      <StatTile
        icon={ClockIcon}
        tone="blue"
        label="Flashcards"
        value="142"
        sublabel="të krijuara"
        loading
      />,
    );
    assert.match(loading, /…/);
    assert.doesNotMatch(loading, /142/);
  });
});

describe("date tile", () => {
  it("formats the Albanian weekday and date", () => {
    // 2025-03-10 is a Monday.
    const { weekday, full } = formatAlbanianDate(new Date(2025, 2, 10));
    assert.equal(weekday, "E hënë");
    assert.equal(full, "10 Mars 2025");
  });

  it("formats month names in Albanian", () => {
    assert.equal(albanianDate(new Date(2026, 0, 5)), "5 Janar 2026");
    assert.equal(albanianDate(new Date(2026, 11, 31)), "31 Dhjetor 2026");
  });

  it("renders the encouragement line", () => {
    const html = render(<DateTile date={new Date(2025, 2, 10)} />);
    assert.match(html, /E hënë/);
    assert.match(html, /10 Mars 2025/);
    assert.match(html, /Vazhdo këtu!/);
    assert.match(html, /Çdo ditë ka rëndësi!/);
  });
});

// ===========================================================================
// Flashcards panel
// ===========================================================================

describe("flashcards panel", () => {
  const cards = [
    {
      question: "Çfarë është qarkullimi i gjakut?",
      answer: "Qarkullimi i gjakut.",
    },
    { question: "Pyetja e dytë?", answer: "Përgjigjja e dytë." },
  ];

  const html = render(<FlashcardsPanel cards={cards} tag="Biologji" />);

  it("renders the panel title and subtitle", () => {
    assert.match(html, /Flashcards/);
    assert.match(html, /Mëso në mënyrë të shpejtë dhe efektive\./);
  });

  it("shows one card at a time", () => {
    assert.match(html, /Çfarë është qarkullimi i gjakut\?/);
    assert.doesNotMatch(html, /Pyetja e dytë\?/);
  });

  it("hides the answer until the card is tapped", () => {
    assert.match(html, /data-flipped="false"/);
    assert.match(html, /flip-face-back/);
    assert.match(html, /Kliko për të parë përgjigjen/);
    assert.match(html, /aria-expanded="false"/);
  });

  it("shows progress in the panel header", () => {
    assert.match(html, /1 \/ 2/);
  });

  it("renders the material tag", () => {
    assert.match(html, /Biologji/);
  });

  it("offers shuffle and next actions", () => {
    assert.match(html, /Përzie kartat/);
    assert.match(html, /Karta tjetër/);
  });

  it("has previous and next controls", () => {
    assert.match(html, /Karta e mëparshme/);
  });

  it("handles an empty deck", () => {
    const empty = render(<FlashcardsPanel cards={[]} />);
    assert.match(empty, /nuk përmban flashcards/);
  });

  it("stays flat and on-theme", () => {
    assert.doesNotMatch(html, /gradient/i);
    assert.doesNotMatch(html, /backdrop-blur/);
  });
});

// ===========================================================================
// Quiz panel
// ===========================================================================

describe("quiz panel", () => {
  const questions = [
    {
      question: "Cila është vlera e derivatit të funksionit f(x) = x²?",
      options: ["2x", "x²", "1", "x"],
      correctOptionIndex: 0,
      explanation: "Derivati i x² është 2x.",
    },
    {
      question: "Pyetja e dytë?",
      options: ["a", "b", "c", "d"],
      correctOptionIndex: 1,
    },
  ];

  const html = render(<QuizPanel questions={questions} tag="Matematikë" />);

  it("renders the panel title and subtitle", () => {
    assert.match(html, /Kuiz/);
    assert.match(html, /Testo njohuritë e tua dhe ndiq përparimin\./);
  });

  it("shows one question at a time", () => {
    assert.match(html, /derivatit të funksionit/);
    assert.doesNotMatch(html, /Pyetja e dytë\?/);
  });

  it("renders each option as a labelled choice", () => {
    assert.match(html, /type="radio"/);
    assert.match(html, /2x/);
    assert.match(html, /x²/);
  });

  it("does NOT reveal correctness before an answer is chosen", () => {
    assert.doesNotMatch(html, /Saktë!/);
    assert.doesNotMatch(html, /Derivati i x² është 2x\./);
  });

  it("shows the progress counter", () => {
    assert.match(html, /1 \/ 2/);
  });

  it("renders the material tag", () => {
    assert.match(html, /Matematikë/);
  });

  it("handles an empty quiz", () => {
    const empty = render(<QuizPanel questions={[]} />);
    assert.match(empty, /nuk përmban pyetje kuizi/);
  });

  it("stays flat and on-theme", () => {
    assert.doesNotMatch(html, /gradient/i);
    assert.doesNotMatch(html, /backdrop-blur/);
  });
});

// ===========================================================================
// Statistic tile meters, goals and links
// ===========================================================================

describe("statistic tile meters", () => {
  it("renders a progress meter with its value/max figure", () => {
    const html = render(
      <StatTile
        icon={ClockIcon}
        tone="green"
        label="Flashcards"
        value="16"
        sublabel="Po ecën mirë!"
        progress={{ value: 6, max: 8 }}
      />,
    );

    assert.match(html, /Flashcards/);
    assert.match(html, /16/);
    assert.match(html, /Po ecën mirë!/);
    assert.match(html, /6\/8/, "the meter states its position");
    // 6 of 8 is 75%.
    assert.match(html, /width:75%/);
  });

  it("clamps an absurd meter rather than overflowing", () => {
    const html = render(
      <StatTile
        icon={ClockIcon}
        tone="green"
        label="Flashcards"
        value="99"
        sublabel="Shumë!"
        progress={{ value: 99, max: 8 }}
      />,
    );
    assert.match(html, /width:100%/);
  });

  it("renders a goal-dots row", () => {
    const html = render(
      <StatTile
        icon={ClockIcon}
        tone="orange"
        label="Streak / Synimi sot"
        value="0 ditë"
        sublabel="Synimi: 10 minuta"
        dots={6}
        dotsFilled={3}
      />,
    );

    assert.match(html, /Streak \/ Synimi sot/);
    assert.match(html, /0 ditë/);
    assert.match(html, /Synimi: 10 minuta/);
    // Three of the six dots are filled. The quote after the class name is what
    // distinguishes a dot from the icon tile, whose fill is "bg-stat-orange/12".
    assert.equal((html.match(/bg-stat-orange"/g) ?? []).length, 3);
    assert.equal((html.match(/bg-line-strong"/g) ?? []).length, 3);
  });

  it("links when given a destination", () => {
    const html = render(
      <StatTile
        icon={ClockIcon}
        tone="green"
        label="Flashcards"
        value="16"
        sublabel="Po ecën mirë!"
        href="/dashboard#flashcards"
      />,
    );
    assert.match(html, /href="\/dashboard#flashcards"/);
    assert.match(html, /<a /);
  });

  it("is not a link without a destination", () => {
    const html = render(
      <StatTile
        icon={ClockIcon}
        tone="green"
        label="Flashcards"
        value="16"
        sublabel="Po ecën mirë!"
      />,
    );
    assert.doesNotMatch(html, /<a /);
  });
});

// ===========================================================================
// "Vazhdo aty ku e le"
// ===========================================================================

describe("continue section", () => {
  /** A saved material as the history endpoint returns it. */
  function material(overrides: Partial<{
    id: string;
    title: string;
    hasSummary: boolean;
    hasFlashcards: boolean;
    hasQuiz: boolean;
    flashcardCount: number;
    quizQuestionCount: number;
  }> = {}) {
    return {
      id: "s1",
      title: "OOP Hyrje dhe Koncepte",
      hasSummary: true,
      hasFlashcards: true,
      hasQuiz: false,
      flashcardCount: 6,
      quizQuestionCount: 0,
      sourceFormat: "pdf",
      sourceUnits: 12,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
      ...overrides,
    };
  }

  it("renders the heading and its helper line", () => {
    const html = render(<ContinueSection studySets={[material()]} />);
    assert.match(html, /Vazhdo aty ku e le/);
    assert.match(html, /Materialet e fundit ku ke punuar\./);
  });

  it("shows the material title, its kind and its progress", () => {
    const html = render(<ContinueSection studySets={[material()]} />);
    assert.match(html, /OOP Hyrje dhe Koncepte/);
    assert.match(html, /Flashcards/);
    assert.match(html, /6\/8/, "flashcards count runs against the per-set ceiling");
    assert.match(html, /Vazhdo →/);
  });

  it("labels a quiz-only material as a quiz", () => {
    const html = render(
      <ContinueSection
        studySets={[
          material({
            id: "s2",
            title: "Vargjet (Arrays) në Java",
            hasSummary: false,
            hasFlashcards: false,
            hasQuiz: true,
            flashcardCount: 0,
            quizQuestionCount: 2,
          }),
        ]}
      />,
    );
    assert.match(html, /Kuiz/);
    assert.match(html, /2\/8/);
  });

  it("offers \"Hape\" for a summary, which has no meter", () => {
    const html = render(
      <ContinueSection
        studySets={[
          material({
            id: "s3",
            title: "Qarget Digjitale",
            hasSummary: true,
            hasFlashcards: false,
            hasQuiz: false,
            flashcardCount: 0,
            quizQuestionCount: 0,
          }),
        ]}
      />,
    );
    assert.match(html, /Përmbledhje/);
    assert.match(html, /Hape →/);
  });

  it("links each card into the study screen", () => {
    const html = render(<ContinueSection studySets={[material()]} />);
    assert.match(html, /href="\/studim\?id=s1"/);
  });

  it("shows at most three cards", () => {
    const sets = ["a", "b", "c", "d", "e"].map((id) =>
      material({ id, title: `Materiali ${id}` }),
    );
    const html = render(<ContinueSection studySets={sets} />);

    assert.match(html, /Materiali a/);
    assert.match(html, /Materiali c/);
    assert.doesNotMatch(html, /Materiali d/);
  });

  it("explains the empty state instead of showing nothing", () => {
    const html = render(<ContinueSection studySets={[]} />);
    assert.match(html, /Nuk ke materiale ende\./);
  });
});

// ===========================================================================
// "Veprime të shpejta"
// ===========================================================================

describe("quick actions", () => {
  const html = render(<QuickActions />);

  it("renders the heading and its helper line", () => {
    assert.match(html, /Veprime të shpejta/);
    assert.match(html, /Kursen kohën, mëso më shpejt\./);
  });

  it("offers the common destinations as links", () => {
    assert.match(html, /href="\/materialet"/);
    assert.match(html, /href="\/cmimet"/);
    assert.match(html, /href="\/dashboard#kuiz"/);
  });

  it("renders the new-material action as a real control", () => {
    // An in-page action must be a button, not a dead link.
    assert.match(html, /Material i ri/);
    assert.match(html, /<button/);
  });

  it("stays flat and on-theme", () => {
    assert.doesNotMatch(html, /gradient/i);
    assert.doesNotMatch(html, /backdrop-blur/);
  });
});

// ===========================================================================
// Relative dates, used by the sidebar's recent list
// ===========================================================================

describe("relative albanian dates", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");

  it("collapses anything under a minute to \"Tani\"", () => {
    assert.equal(relativeAlbanianDate(new Date("2026-03-10T11:59:40.000Z"), now), "Tani");
  });

  it("counts minutes and hours", () => {
    assert.equal(
      relativeAlbanianDate(new Date("2026-03-10T11:55:00.000Z"), now),
      "5 minuta më parë",
    );
    assert.equal(
      relativeAlbanianDate(new Date("2026-03-10T10:00:00.000Z"), now),
      "2 orë më parë",
    );
  });

  it("names yesterday", () => {
    assert.equal(
      relativeAlbanianDate(new Date("2026-03-09T12:00:00.000Z"), now),
      "Dje",
    );
  });

  it("counts days, then weeks", () => {
    assert.equal(
      relativeAlbanianDate(new Date("2026-03-07T12:00:00.000Z"), now),
      "3 ditë më parë",
    );
    assert.equal(
      relativeAlbanianDate(new Date("2026-03-01T12:00:00.000Z"), now),
      "1 javë më parë",
    );
  });

  it("falls back to an absolute date when it is old", () => {
    assert.equal(
      relativeAlbanianDate(new Date("2025-12-24T12:00:00.000Z"), now),
      "24 Dhjetor 2025",
    );
  });

  it("treats a future timestamp as now, not a negative duration", () => {
    // Client/server clock skew must never render "-3 minuta më parë".
    assert.equal(relativeAlbanianDate(new Date("2026-03-10T12:05:00.000Z"), now), "Tani");
  });
});

// ===========================================================================
// Theme constraints for the new components
// ===========================================================================

describe("dashboard theme constraints", () => {
  const FILES = [
    "src/components/dashboard/panel.tsx",
    "src/components/dashboard/stat-tile.tsx",
    "src/components/dashboard/flashcards-panel.tsx",
    "src/components/dashboard/quiz-panel.tsx",
    "src/components/dashboard/summary-panel.tsx",
    "src/components/dashboard/history-panel.tsx",
    "src/components/dashboard/sidebar.tsx",
    "src/components/dashboard/top-bar.tsx",
    "src/components/dashboard/dashboard-shell.tsx",
    "src/components/dashboard/dashboard-overview.tsx",
  ];

  it("uses no gradients, blur or neon effects", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of FILES) {
      // Strip comments: a comment explaining WHY a pattern is avoided must not
      // be mistaken for a usage.
      const source = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\/|\/\*|\{?\s*\/\*)/.test(line))
        .join("\n");

      for (const forbidden of [
        "gradient",
        "backdrop-blur",
        "drop-shadow-",
        "animate-bounce",
        "sparkle",
        "bg-white/",
      ]) {
        assert.doesNotMatch(
          source,
          new RegExp(forbidden, "i"),
          `${file}: ${forbidden}`,
        );
      }
    }
  });

  it("does not hardcode colours outside the theme tokens", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      // Hex colours belong in globals.css only.
      assert.doesNotMatch(
        source,
        /#[0-9a-fA-F]{6}\b/,
        `${file} hardcodes a hex colour`,
      );
    }
  });
});
