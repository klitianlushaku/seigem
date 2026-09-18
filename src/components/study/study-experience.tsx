"use client";

/**
 * Study experience.
 *
 * One screen with three modes — Përmbledhje, Flashcards, Kuiz — switchable by
 * tabs. Works on desktop, tablet, and mobile: a single column that widens on
 * larger screens, with controls that wrap rather than overflow.
 *
 * Reached as `/studim?id=<studySetId>`. When no id is given, the most recent
 * saved study set is opened so the page is never a dead end.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { FlashcardDeck } from "@/components/study/flashcard-deck";
import { QuizRunner } from "@/components/study/quiz-runner";
import { SummaryView } from "@/components/study/summary-view";
import {
  fetchHistory,
  fetchStudySet,
  type StudySetDetail,
} from "@/services/history";

type Mode = "summary" | "flashcards" | "quiz";

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: "summary", label: "Përmbledhje" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Kuiz" },
];

export function StudyExperience() {
  const { getIdToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");

  const [studySet, setStudySet] = useState<StudySetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("summary");

  /** Loads the requested study set, or the most recent one. */
  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) {
      return { ok: false as const, message: "Sesioni ka skaduar. Hyr përsëri." };
    }

    // Resolve which set to open.
    let id = requestedId;
    if (!id) {
      const history = await fetchHistory(token);
      if (!history.ok) {
        return { ok: false as const, message: history.message };
      }
      const first = history.data.studySets[0];
      if (!first) {
        return {
          ok: false as const,
          message:
            "Nuk ke materiale të ruajtura. Ngarko një dokument për të filluar studimin.",
        };
      }
      id = first.id;
    }

    const result = await fetchStudySet(token, id);
    if (!result.ok) {
      return { ok: false as const, message: result.message };
    }

    return { ok: true as const, studySet: result.data.studySet };
  }, [getIdToken, requestedId]);

  // Initial load. State is applied in a microtask, not synchronously in the
  // effect, to avoid a cascading render.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const outcome = await load();
      if (cancelled) return;

      setLoading(false);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      setStudySet(outcome.studySet);
      // Open on the first resource that exists.
      setMode(
        outcome.studySet.hasSummary
          ? "summary"
          : outcome.studySet.hasFlashcards
            ? "flashcards"
            : "quiz",
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-muted">Duke lexuar materialin…</p>
      </Card>
    );
  }

  if (error || !studySet) {
    return (
      <Card>
        <Alert>{error ?? "Materiali nuk u gjet."}</Alert>
        <div className="mt-3">
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>
            Kthehu në panel
          </Button>
        </div>
      </Card>
    );
  }

  // Only offer modes that actually have content.
  const available = MODES.filter((entry) =>
    entry.id === "summary"
      ? studySet.hasSummary
      : entry.id === "flashcards"
        ? studySet.hasFlashcards
        : studySet.hasQuiz,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {studySet.title}
        </h1>
        <span className="text-xs text-muted">
          Studim · {available.length}{" "}
          {available.length === 1 ? "burim" : "burime"}
        </span>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2 border-b border-line">
        {available.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={mode === entry.id}
            onClick={() => setMode(entry.id)}
            className={
              mode === entry.id
                ? "border-b-2 border-accent px-3 py-2 text-sm font-medium"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-content"
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {mode === "summary" && studySet.hasSummary && studySet.summary ? (
          <Card>
            <SummaryView summary={studySet.summary} />
          </Card>
        ) : null}

        {mode === "flashcards" && studySet.hasFlashcards ? (
          <Card>
            <FlashcardDeck cards={studySet.flashcards} />
          </Card>
        ) : null}

        {mode === "quiz" && studySet.hasQuiz ? (
          <Card>
            <QuizRunner questions={studySet.quizQuestions} />
          </Card>
        ) : null}
      </div>

      <p className="pt-2 text-xs text-muted">
        Dokumenti origjinal nuk ruhet. Rezultati i kuizit mbahet vetëm gjatë
        sesionit dhe nuk ruhet.
      </p>
    </div>
  );
}
