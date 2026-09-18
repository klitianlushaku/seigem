"use client";

/**
 * Dashboard overview.
 *
 * The single screen the app opens on: the daily meters, the uploader, the
 * materials to resume, the three working panels (flashcards, quiz, summary),
 * and the quick actions.
 *
 * Saved materials are NOT listed as a table here — the resume row shows the
 * three most recent, and the full list lives behind /materialet.
 *
 * All figures come from the server. The only client-side arithmetic is summing
 * the rows the server returned.
 */
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { StudyWorkflow } from "@/components/documents/study-workflow";
import { StatTile } from "@/components/dashboard/stat-tile";
import { FlashcardsPanel } from "@/components/dashboard/flashcards-panel";
import { QuizPanel } from "@/components/dashboard/quiz-panel";
import { SummaryPanel } from "@/components/dashboard/summary-panel";
import { GenerateMoreButton } from "@/components/dashboard/generate-more-button";
import { ContinueSection } from "@/components/dashboard/continue-section";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { Card } from "@/components/ui/card";
import { ClockIcon, FlameIcon, LayersIcon, QuizIcon } from "@/components/ui/icons";
import { emitOpenMoreMaterial, HISTORY_CHANGED } from "@/lib/app-events";
import {
  MAX_FLASHCARDS_PER_SET,
  MAX_QUIZ_QUESTIONS_PER_SET,
} from "@/lib/firebase/schema";
import {
  fetchRemainingUsage,
  type RemainingUsage,
} from "@/services/generation";
import {
  fetchHistory,
  fetchStudySet,
  type StudySetDetail,
  type StudySetSummary,
} from "@/services/history";
import { fetchStudyTime, formatStudyDuration } from "@/services/study-time";

/**
 * The daily study target, in minutes.
 *
 * Shown on the "Studimi sot" and goal tiles. A fixed target for now; it is a
 * presentation constant rather than a stored user preference.
 */
const STUDY_GOAL_MINUTES = 10;

/** How many goal dots the study tile shows. */
const GOAL_DOTS = 6;

export function DashboardOverview() {
  const { getIdToken } = useAuth();

  const [remaining, setRemaining] = useState<RemainingUsage | null>(null);
  const [studySets, setStudySets] = useState<StudySetSummary[]>([]);
  const [latest, setLatest] = useState<StudySetDetail | null>(null);
  const [studySeconds, setStudySeconds] = useState(0);
  const [loading, setLoading] = useState(true);

  /** Reads everything the overview needs. */
  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) {
      return { ok: false as const };
    }

    const [usage, history, studyTime] = await Promise.all([
      fetchRemainingUsage(token),
      fetchHistory(token),
      fetchStudyTime(token),
    ]);

    const sets = history.ok ? history.data.studySets : [];

    // The panels show the most recent material; its content is fetched
    // separately because the list endpoint returns summaries only.
    const first = sets[0];
    const detail = first ? await fetchStudySet(token, first.id) : null;

    return {
      ok: true as const,
      usage,
      sets,
      studySeconds: studyTime?.seconds ?? 0,
      latest: detail?.ok ? detail.data.studySet : null,
    };
  }, [getIdToken]);

  // Initial load. State is applied in a microtask, not synchronously.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const outcome = await load();
      if (cancelled) return;

      if (outcome.ok) {
        if (outcome.usage) {
          setRemaining(outcome.usage.remaining);
        }
        setStudySets(outcome.sets);
        setStudySeconds(outcome.studySeconds);
        setLatest(outcome.latest);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  // Reload after a document is generated or a material is removed, so the
  // panels and totals reflect the change without a page refresh.
  useEffect(() => {
    const handler = () => {
      void (async () => {
        const outcome = await load();
        if (!outcome.ok) return;

        if (outcome.usage) {
          setRemaining(outcome.usage.remaining);
        }
        setStudySets(outcome.sets);
        setStudySeconds(outcome.studySeconds);
        setLatest(outcome.latest);
        setLoading(false);
      })();
    };

    window.addEventListener(HISTORY_CHANGED, handler);
    return () => window.removeEventListener(HISTORY_CHANGED, handler);
  }, [load]);

  const totalFlashcards = studySets.reduce(
    (sum, set) => sum + set.flashcardCount,
    0,
  );
  const totalQuizQuestions = studySets.reduce(
    (sum, set) => sum + set.quizQuestionCount,
    0,
  );

  // The meters show how far the material currently on screen goes, against the
  // per-set ceiling — which is what the "6 / 8" figure in the design expresses.
  const latestFlashcards = latest?.flashcards.length ?? 0;
  const latestQuizQuestions = latest?.quizQuestions.length ?? 0;

  const studiedMinutes = Math.floor(studySeconds / 60);
  const goalReached = studiedMinutes >= STUDY_GOAL_MINUTES;
  const goalDotsFilled = Math.min(
    GOAL_DOTS,
    Math.round((studiedMinutes / STUDY_GOAL_MINUTES) * GOAL_DOTS),
  );

  const requestMore = () => {
    if (latest?.id) {
      emitOpenMoreMaterial(latest.id);
      return;
    }
    document
      .getElementById("generate-more")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      {/*
        The daily meters: what has been made, how much has been studied, and the
        goal. Each figure comes from the server.
      */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={LayersIcon}
          tone="green"
          label="Flashcards"
          value={String(totalFlashcards)}
          sublabel={
            latestFlashcards > 0
              ? "Po ecën mirë!"
              : "Nuk ka ende karta për të studiuar."
          }
          sublabelTone={latestFlashcards > 0 ? "green" : "muted"}
          progress={{
            value: latestFlashcards,
            max: MAX_FLASHCARDS_PER_SET,
          }}
          href="/dashboard#flashcards"
          title={`Totali i flashcards në të gjitha materialet: ${totalFlashcards}.`}
          loading={loading}
        />
        <StatTile
          icon={QuizIcon}
          tone="orange"
          label="Pyetje Kuizi"
          value={String(totalQuizQuestions)}
          sublabel={
            latestQuizQuestions > 0
              ? "Testo veten ende sot!"
              : "Nuk ka ende pyetje për t'u provuar."
          }
          sublabelTone={latestQuizQuestions > 0 ? "orange" : "muted"}
          progress={{
            value: latestQuizQuestions,
            max: MAX_QUIZ_QUESTIONS_PER_SET,
          }}
          href="/dashboard#kuiz"
          title={`Totali i pyetjeve të kuizit në të gjitha materialet: ${totalQuizQuestions}.`}
          loading={loading}
        />
        <StatTile
          icon={ClockIcon}
          tone="purple"
          label="Studimi sot"
          value={formatStudyDuration(studySeconds)}
          sublabel={
            goalReached
              ? "Vazhdo kështu!"
              : `Sot nuk ke nisur ende — syno të bësh ${STUDY_GOAL_MINUTES} minuta`
          }
          title="Koha e kaluar duke studiuar sot. Rifreskohet gjatë sesionit."
          loading={loading}
        />
        <StatTile
          icon={FlameIcon}
          tone="orange"
          label="Streak / Synimi sot"
          value="0 ditë"
          sublabel={`Synimi: ${STUDY_GOAL_MINUTES} minuta`}
          dots={GOAL_DOTS}
          dotsFilled={goalDotsFilled}
          title="Ditët me radhë që ke studiuar."
          loading={loading}
        />
      </div>

      {/* Uploader: one or more documents, everything generated at once. */}
      <StudyWorkflow />

      {/* Recently touched materials */}
      <ContinueSection studySets={studySets} />

      {/* Practice panels */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/*
          The `key` ties each panel's internal state to the study set, so
          opening a different material remounts the deck and quiz with clean
          state instead of carrying over the previous position.
        */}
        <FlashcardsPanel
          key={`cards-${latest?.id ?? "none"}`}
          cards={latest?.flashcards ?? []}
          tag={latest?.title ?? null}
          onRequestMore={requestMore}
        />
        <QuizPanel
          key={`quiz-${latest?.id ?? "none"}`}
          questions={latest?.quizQuestions ?? []}
          tag={latest?.title ?? null}
          studySetId={latest?.id ?? null}
          onRequestMore={requestMore}
        />
      </div>

      {/* Reading panel */}
      <SummaryPanel
        summary={latest?.summary ?? null}
        studySetId={latest?.id ?? null}
      />

      {/*
        Incremental generation: another batch of 3 flashcards and 3 quiz
        questions, repeatable until the daily plan limit is reached. The panel
        only appears once there is a material to extend.
      */}
      {latest ? (
        <Card>
          <div id="generate-more" className="scroll-mt-6" />
          <h2 className="text-sm font-semibold">Gjenero më shumë</h2>
          <p className="mt-1 text-sm text-muted">
            Shto materiale të reja për &ldquo;{latest.title}&rdquo;.
          </p>
          <div className="mt-3">
            <GenerateMoreButton
              studySet={latest}
              remaining={remaining}
              maxPerSet={MAX_FLASHCARDS_PER_SET}
              onGenerated={(updated) => {
                setLatest(updated);
                // The totals and quota both changed.
                void (async () => {
                  const outcome = await load();
                  if (!outcome.ok) return;
                  if (outcome.usage) {
                    setRemaining(outcome.usage.remaining);
                  }
                  setStudySets(outcome.sets);
                })();
              }}
            />
          </div>
        </Card>
      ) : null}

      {/* Shortcuts to the most common actions */}
      <QuickActions />
    </div>
  );
}
