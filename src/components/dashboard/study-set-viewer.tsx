"use client";

/**
 * Saved study-set viewer.
 *
 * Shows the saved summary, flashcards, and quiz for one study set, with tabs so
 * only one resource is displayed at a time.
 *
 * Deliberately does NOT attempt to show the original document: it was never
 * stored. The UI says so explicitly rather than implying it is available.
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { StudySetDetail } from "@/services/history";

type Tab = "summary" | "flashcards" | "quiz";

/** Tabs, in display order, each with an Albanian label. */
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "summary", label: "Përmbledhje" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Kuiz" },
];

export function StudySetViewer({
  studySet,
  onClose,
  onRequestMore,
}: {
  studySet: StudySetDetail;
  onClose: () => void;
  onRequestMore: () => void;
}) {
  // Open on the first resource that actually exists.
  const [tab, setTab] = useState<Tab>(() => {
    if (studySet.hasSummary) return "summary";
    if (studySet.hasFlashcards) return "flashcards";
    return "quiz";
  });

  const available = TABS.filter((entry) =>
    entry.id === "summary"
      ? studySet.hasSummary
      : entry.id === "flashcards"
        ? studySet.hasFlashcards
        : studySet.hasQuiz,
  );

  return (
    <section
      aria-labelledby="study-set-heading"
      className="rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="study-set-heading" className="truncate text-sm font-medium">
            {studySet.title}
          </h3>
          <p className="mt-1 text-xs text-muted">
            Ruajtur më{" "}
            {new Date(studySet.updatedAt).toLocaleDateString("sq-AL")}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          Mbyll
        </Button>
      </div>

      {/* Tab list. Plain buttons, so keyboard behaviour is native. */}
      <div role="tablist" className="mt-4 flex flex-wrap gap-2 border-b border-line">
        {available.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={
              tab === entry.id
                ? "border-b-2 border-accent px-3 py-2 text-sm font-medium"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-content"
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "summary" && studySet.hasSummary ? (
          <p className="whitespace-pre-wrap text-sm leading-6">
            {studySet.summary}
          </p>
        ) : null}

        {tab === "flashcards" && studySet.hasFlashcards ? (
          <ul className="space-y-2">
            {studySet.flashcards.map((card, index) => (
              <li
                key={`${card.question}-${index}`}
                className="rounded-md border border-line p-3 text-sm"
              >
                <p className="font-medium">{card.question}</p>
                <p className="mt-1 text-muted">{card.answer}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "quiz" && studySet.hasQuiz ? (
          <ul className="space-y-3">
            {studySet.quizQuestions.map((question, index) => (
              <li
                key={`${question.question}-${index}`}
                className="rounded-md border border-line p-3 text-sm"
              >
                <p className="font-medium">
                  {index + 1}. {question.question}
                </p>
                <ol className="mt-2 space-y-1">
                  {question.options.map((option, optionIndex) => (
                    <li
                      key={`${option}-${optionIndex}`}
                      className={
                        optionIndex === question.correctOptionIndex
                          ? "text-success"
                          : "text-muted"
                      }
                    >
                      {option}
                    </li>
                  ))}
                </ol>
                {question.explanation ? (
                  <p className="mt-2 text-xs text-muted">{question.explanation}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-5 space-y-3 border-t border-line pt-4">
        {/*
          Stated plainly so the user is never led to believe the original
          document is stored. It is not, and cannot be retrieved.
        */}
        <p className="text-xs leading-5 text-muted">
          Dokumenti origjinal nuk ruhet. Ruhen vetëm përmbledhja, flashcards dhe
          pyetjet e kuizit që shfaqen më sipër.
        </p>

        <Button variant="secondary" onClick={onRequestMore}>
          Gjenero materiale shtesë
        </Button>
      </div>
    </section>
  );
}
