"use client";

/**
 * "Vazhdo aty ku e le" — the resume row.
 *
 * Shows the most recently touched materials so returning to work takes one
 * click. Each card states what the material is made of and how far it goes, and
 * the whole card links into the study screen.
 *
 * Progress is expressed against the per-set ceiling (the most cards a set can
 * hold), which is what the "6 / 8" figure in the design represents. The figures
 * come from the history endpoint, so nothing is invented client-side.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DocumentIcon,
  LayersIcon,
  QuizIcon,
} from "@/components/ui/icons";
import {
  MAX_FLASHCARDS_PER_SET,
  MAX_QUIZ_QUESTIONS_PER_SET,
} from "@/lib/firebase/schema";
import { cn } from "@/lib/utils/cn";
import type { StudySetSummary } from "@/services/history";

/** How many resume cards the row shows. */
const MAX_CARDS = 3;

/** What a material is primarily, in the order the design prioritises them. */
type MaterialKind = "flashcards" | "quiz" | "summary";

/** Resolves the primary kind of a saved material. */
function primaryKind(studySet: StudySetSummary): MaterialKind {
  if (studySet.hasFlashcards) return "flashcards";
  if (studySet.hasQuiz) return "quiz";
  return "summary";
}

/** Presentation for each kind: label, icon and accent tone. */
const KIND_PRESENTATION = {
  flashcards: { label: "Flashcards", icon: LayersIcon, tone: "green" },
  quiz: { label: "Kuiz", icon: QuizIcon, tone: "orange" },
  summary: { label: "Përmbledhje", icon: DocumentIcon, tone: "blue" },
} as const;

export function ContinueSection({ studySets }: { studySets: StudySetSummary[] }) {
  const cards = studySets.slice(0, MAX_CARDS);

  return (
    <section aria-labelledby="vazhdo-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id="vazhdo-heading" className="text-[15px] font-semibold">
            Vazhdo aty ku e le
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Materialet e fundit ku ke punuar. Mos e humb ritmin!
          </p>
        </div>

        <Link
          href="/materialet"
          className="text-xs font-medium text-accent hover:underline"
        >
          Shiko të gjitha →
        </Link>
      </div>

      {cards.length === 0 ? (
        <p className="dash-panel mt-3 rounded-2xl px-4 py-5 text-sm text-muted">
          Nuk ke materiale ende. Ngarko një dokument për të filluar.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((studySet) => (
            <ResumeCard key={studySet.id} studySet={studySet} />
          ))}
        </div>
      )}
    </section>
  );
}

function ResumeCard({ studySet }: { studySet: StudySetSummary }) {
  const kind = primaryKind(studySet);
  const { label, icon: Icon, tone } = KIND_PRESENTATION[kind];

  // Only the kind actually present carries a meter; a summary has no length to
  // measure, so it shows no bar at all rather than an empty one.
  const progress =
    kind === "flashcards"
      ? { value: studySet.flashcardCount, max: MAX_FLASHCARDS_PER_SET }
      : kind === "quiz"
        ? { value: studySet.quizQuestionCount, max: MAX_QUIZ_QUESTIONS_PER_SET }
        : null;

  return (
    <article className="dash-panel flex items-center gap-3 rounded-2xl p-3.5">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          TONE_CLASSES[tone],
        )}
      >
        <Icon size={20} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold" title={studySet.title}>
          {studySet.title}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">{label}</p>

        {progress ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <span
                className={cn("block h-full rounded-full", BAR_TONES[tone])}
                style={{ width: `${percentOf(progress.value, progress.max)}%` }}
              />
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted">
              {progress.value}/{progress.max}
            </span>
          </div>
        ) : null}
      </div>

      <Link
        href={`/studim?id=${encodeURIComponent(studySet.id)}`}
        className="shrink-0"
      >
        <Button variant="secondary" className="px-3 py-1.5">
          {kind === "summary" ? "Hape →" : "Vazhdo →"}
        </Button>
      </Link>
    </article>
  );
}

/** Clamps a progress pair into a whole-number percentage. */
function percentOf(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

const TONE_CLASSES = {
  green: "bg-stat-green/12 text-stat-green",
  orange: "bg-stat-orange/12 text-stat-orange",
  blue: "bg-stat-blue/12 text-stat-blue",
} as const;

const BAR_TONES = {
  green: "bg-stat-green",
  orange: "bg-stat-orange",
  blue: "bg-stat-blue",
} as const;
