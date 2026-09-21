"use client";

/**
 * Logged-out dashboard.
 *
 * A visitor who is not signed in used to see the full dashboard with every meter
 * reading zero: "Flashcards 0", "Pyetje Kuizi 0", "Studimi sot 0m", "Streak 0
 * ditë". Four empty numbers say nothing about what the product does, and they
 * look broken rather than new.
 *
 * This replaces that with the thing Seigem actually sells: a REAL flashcard the
 * visitor can flip, a REAL quiz question they can answer, and one clear action.
 * Both are fully interactive, so the visitor experiences the product before
 * signing in rather than reading a claim about it.
 *
 * The samples are static and live only in this component. Nothing here touches
 * Firestore or the API, so an anonymous visitor costs nothing and cannot read
 * anyone's data.
 */
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FlipCard } from "@/components/study/flip-card";
import {
  ArrowRightIcon,
  BoltIcon,
  LayersIcon,
  QuizIcon,
} from "@/components/ui/icons";
import { ACCEPTED_FORMATS_LABEL } from "@/config/app";
import { PLANS } from "@/config/plans";
import { cn } from "@/lib/utils/cn";

/** A flashcard sample, written to look like output from a real document. */
interface SampleCard {
  question: string;
  answer: string;
}

/**
 * The first card, named separately so it can act as a typed fallback.
 * `noUncheckedIndexedAccess` means an array lookup is always `T | undefined`,
 * so indexing this list for a default would not narrow.
 */
const FIRST_SAMPLE_CARD: SampleCard = {
  question: "Cilat janë dy fazat kryesore të fotosintezës?",
  answer: "Reaksionet e varura nga drita dhe cikli i Calvin.",
};

const SAMPLE_CARDS: readonly SampleCard[] = [
  FIRST_SAMPLE_CARD,
  {
    question: "Ku ndodh cikli i Calvin?",
    answer: "Në stromë, lëngu i kloroplastit.",
  },
  {
    question: "Çfarë prodhojnë reaksionet e varura nga drita?",
    answer: "ATP dhe NADPH, të cilat ushqejnë ciklin e Calvin.",
  },
];

/** One sample quiz question, with the correct option marked. */
const SAMPLE_QUIZ = {
  question: "Cili pigment thith dritën gjatë fotosintezës?",
  options: ["Klorofili", "Karoteni", "Hemoglobina", "Melanina"],
  correctIndex: 0,
} as const;

export function WelcomePreview() {
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /** null until the visitor picks an option. */
  const [chosen, setChosen] = useState<number | null>(null);

  const card = SAMPLE_CARDS[cardIndex] ?? FIRST_SAMPLE_CARD;
  const loginHref = "/login?next=%2Fdashboard";

  /** Advances to the next sample card, wrapping around. */
  function nextCard() {
    setCardIndex((index) => (index + 1) % SAMPLE_CARDS.length);
    setFlipped(false);
  }

  return (
    <div className="space-y-4">
      {/* --- What Seigem does, in one line ------------------------------- */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-snug sm:text-xl">
              Kthe çdo material në flashcards dhe kuize
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              Ngarko një {ACCEPTED_FORMATS_LABEL} dhe Seigem gjeneron
              përmbledhjen, kartat dhe kuizin automatikisht.
            </p>
          </div>
          <div className="shrink-0">
            <Link href={loginHref} className="block">
              <Button className="w-full sm:w-auto">
                Fillo tani
                <ArrowRightIcon size={16} />
              </Button>
            </Link>
          </div>
        </div>

        {/* Free-tier facts, so the visitor knows the cost up front. */}
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <BoltIcon size={14} className="text-stat-green" />
            Plani {PLANS.free.name} — {PLANS.free.priceLabel}
          </li>
          <li>{PLANS.free.limits.documentsPerDay} dokumente në ditë</li>
          <li>{PLANS.free.limits.flashcardsPerDay} flashcards në ditë</li>
          <li>{PLANS.free.limits.quizQuestionsPerDay} pyetje kuizi në ditë</li>
        </ul>
      </Card>

      {/*
        A real flashcard, not a screenshot. Tapping it flips, exactly as it does
        for a signed-in user, so the visitor knows what they are signing up for.
      */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <LayersIcon size={15} />
            </span>
            <h2 className="text-sm font-semibold">Kështu duket një flashcard</h2>
          </div>
          <span className="shrink-0 text-xs text-muted">
            {cardIndex + 1} / {SAMPLE_CARDS.length}
          </span>
        </div>

        <div className="mt-3">
          <FlipCard
            key={cardIndex}
            flipped={flipped}
            onToggle={() => setFlipped((value) => !value)}
            label={`Karta mostër ${cardIndex + 1}. Trokit për ta kthyer.`}
            front={
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Pyetja
                </span>
                <p className="mt-3 text-base font-semibold leading-7 sm:text-lg">
                  {card.question}
                </p>
                <span className="mt-4 text-xs text-accent">
                  Trokit për përgjigjen
                </span>
              </>
            }
            back={
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stat-green">
                  Përgjigjja
                </span>
                <p className="mt-3 text-base leading-7 sm:text-lg">
                  {card.answer}
                </p>
              </>
            }
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Nga një dokument i vërtetë — kështu i shfaq Seigem.
          </p>
          <Button variant="secondary" onClick={nextCard} className="shrink-0">
            Karta tjetër
          </Button>
        </div>
      </Card>

      {/* A real quiz question, answerable without signing in. */}
      <Card>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stat-orange/10 text-stat-orange">
            <QuizIcon size={15} />
          </span>
          <h2 className="text-sm font-semibold">Dhe kështu një pyetje kuizi</h2>
        </div>

        <p className="mt-3 text-sm font-medium leading-6">
          {SAMPLE_QUIZ.question}
        </p>

        <ul className="mt-3 space-y-2">
          {SAMPLE_QUIZ.options.map((option, index) => {
            const isAnswer = index === SAMPLE_QUIZ.correctIndex;
            const isChosen = chosen === index;
            // Nothing is revealed until the visitor commits to an answer.
            const revealed = chosen !== null;

            return (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => setChosen(index)}
                  disabled={revealed}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    !revealed && "border-line hover:border-line-strong",
                    revealed && isAnswer && "border-stat-green/50 bg-stat-green/10",
                    revealed && isChosen && !isAnswer && "border-danger/50 bg-danger/10",
                    revealed && !isAnswer && !isChosen && "border-line opacity-60",
                    revealed ? "cursor-default" : "cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                      revealed && isAnswer
                        ? "border-stat-green text-stat-green"
                        : revealed && isChosen
                          ? "border-danger text-danger"
                          : "border-line-strong text-muted",
                    )}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="min-w-0">{option}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {chosen !== null ? (
          <p
            role="status"
            className={cn(
              "mt-3 text-xs leading-5",
              chosen === SAMPLE_QUIZ.correctIndex
                ? "text-stat-green"
                : "text-stat-orange",
            )}
          >
            {chosen === SAMPLE_QUIZ.correctIndex
              ? "Saktë! Seigem shpjegon edhe pse."
              : "Jo saktësisht — përgjigjja e saktë është theksuar më sipër."}
          </p>
        ) : null}
      </Card>

      {/* One closing action, for a visitor who scrolled past the samples. */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              Gati për materialin tënd?
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Hyr me Google dhe ngarko dokumentin e parë. Pa kartë krediti.
            </p>
          </div>
          <Link href={loginHref} className="shrink-0">
            <Button className="w-full sm:w-auto">
              Fillo tani
              <ArrowRightIcon size={16} />
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
