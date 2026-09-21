"use client";

/**
 * Signed-out dashboard.
 *
 * A visitor who is not signed in used to see the full dashboard with every meter
 * reading zero, which looks broken rather than new.
 *
 * The first attempt at replacing it put one full-width flip card on the page.
 * On a 1440px screen that produced a 1,150px-wide card holding a single short
 * question: mostly empty space, no hierarchy, and it read as a template rather
 * than a study tool. This version is built on three rules:
 *
 *   1. USE THE WIDTH. Desktop gets two columns, so the page is not a single
 *      stretched strip. The card sits in a column and is capped at a sensible
 *      size, the way a real card is.
 *   2. REAL INFORMATION, NOT FILLER. Instead of decorative flourishes it states
 *      what Seigem produces, how it works in three steps, and exactly what the
 *      free plan allows. A student deciding whether to sign up needs those
 *      facts, not ornament.
 *   3. LOOK LIKE THE PRODUCT. The two previews use the same panel shell as the
 *      signed-in dashboard, so a visitor sees what they will actually get.
 *
 * The samples are static and live only in this file. Nothing here touches
 * Firestore or the API, so an anonymous visitor costs nothing and cannot read
 * anyone's data.
 */
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Panel } from "@/components/dashboard/panel";
import { FlipCard } from "@/components/study/flip-card";
import { ArrowRightIcon, LayersIcon, QuizIcon } from "@/components/ui/icons";
import { ACCEPTED_FORMATS_LABEL, MAX_FILE_SIZE_BYTES } from "@/config/app";
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
  answer:
    "Reaksionet e varura nga drita, që ndodhin në membranat e tilakoideve, dhe cikli i Calvin, që ndodh në stromë.",
};

const SAMPLE_CARDS: readonly SampleCard[] = [
  FIRST_SAMPLE_CARD,
  {
    question: "Ku ndodh cikli i Calvin?",
    answer: "Në stromë, lëngu i brendshëm i kloroplastit.",
  },
  {
    question: "Çfarë prodhojnë reaksionet e varura nga drita?",
    answer: "ATP dhe NADPH, të cilat më pas ushqejnë ciklin e Calvin.",
  },
  {
    question: "Cili pigment thith dritën gjatë fotosintezës?",
    answer: "Klorofili, pigmenti i gjelbër i vendosur në kloroplaste.",
  },
];

/** One sample quiz question, with the correct option marked. */
const SAMPLE_QUIZ = {
  question: "Cili pigment thith dritën gjatë fotosintezës?",
  options: ["Klorofili", "Karoteni", "Hemoglobina", "Melanina"],
  correctIndex: 0,
  explanation:
    "Klorofili është pigmenti i gjelbër në kloroplaste që thith dritën.",
} as const;

/** The three steps, stated plainly. */
const STEPS: readonly { title: string; body: string }[] = [
  {
    title: "Ngarko dokumentin",
    body: `${ACCEPTED_FORMATS_LABEL}, deri në ${Math.round(
      MAX_FILE_SIZE_BYTES / (1024 * 1024),
    )} MB. Teksti nxirret brenda shfletuesit — skedari nuk dërgohet askund.`,
  },
  {
    title: "Gjenerohet automatikisht",
    body: "Përmbledhja, flashcards dhe kuizi krijohen njëherësh nga i njëjti material. Nuk zgjedh asgjë para se të nisësh.",
  },
  {
    title: "Përsërit dhe testohu",
    body: "Kthe kartat, përgjigju pyetjeve të kuizit dhe ndiq përparimin ditor. Materialet ruhen për herën tjetër.",
  },
];

export function WelcomePreview() {
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /** null until the visitor picks an option. */
  const [chosen, setChosen] = useState<number | null>(null);

  const card = SAMPLE_CARDS[cardIndex] ?? FIRST_SAMPLE_CARD;
  const loginHref = "/login?next=%2Fdashboard";
  const free = PLANS.free;

  /** Advances to the next sample card, wrapping around. */
  function nextCard() {
    setCardIndex((index) => (index + 1) % SAMPLE_CARDS.length);
    setFlipped(false);
  }

  return (
    <div className="space-y-4">
      {/* --- What it is, and the one action ------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
            Kthe materialin e kursit në flashcards dhe kuize
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Ngarko një {ACCEPTED_FORMATS_LABEL}. Seigem nxjerr tekstin, shkruan
            përmbledhjen dhe krijon kartat e pyetjet — njësoj siç do t&apos;i
            bëje vetë, por në një hap.
          </p>
        </div>
        <div className="shrink-0 sm:pt-1">
          <Link href={loginHref} className="block">
            <Button className="w-full sm:w-auto">
              Fillo tani
              <ArrowRightIcon size={16} />
            </Button>
          </Link>
          <p className="mt-2 text-center text-[11px] text-muted sm:text-right">
            Hyr me Google · Pa kartë krediti
          </p>
        </div>
      </div>

      {/* --- The two things Seigem makes, side by side --------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={LayersIcon}
          tone="green"
          title="Flashcards"
          // Short enough not to be truncated by the panel header on a phone.
          subtitle="Një kartë për çdo koncept."
          action={
            <span className="text-sm tabular-nums text-muted">
              {cardIndex + 1} / {SAMPLE_CARDS.length}
            </span>
          }
        >
          {/*
            Capped width. The card is a card: letting it stretch to the full
            column width was what made the previous version look empty.
          */}
          <div className="mx-auto w-full max-w-sm">
            <FlipCard
              key={cardIndex}
              flipped={flipped}
              onToggle={() => setFlipped((value) => !value)}
              label={`Karta mostër ${cardIndex + 1}. Trokit për ta kthyer.`}
              front={
                <>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Pyetja
                  </span>
                  <p className="mt-2.5 text-[15px] font-medium leading-6">
                    {card.question}
                  </p>
                  <span className="mt-3 text-[11px] text-accent">
                    Trokit për përgjigjen
                  </span>
                </>
              }
              back={
                <>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stat-green">
                    Përgjigjja
                  </span>
                  <p className="mt-2.5 text-[15px] leading-6">{card.answer}</p>
                </>
              }
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-4 text-muted">
              Shembull nga një dokument i vërtetë.
            </p>
            <Button
              variant="secondary"
              onClick={nextCard}
              className="shrink-0 px-3 py-1.5 text-xs"
            >
              Karta tjetër
            </Button>
          </div>
        </Panel>

        <Panel
          icon={QuizIcon}
          tone="orange"
          title="Kuiz"
          subtitle="Katër alternativa dhe shpjegim."
        >
          <p className="text-sm font-medium leading-6">
            {SAMPLE_QUIZ.question}
          </p>

          <ul className="mt-3 space-y-1.5">
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
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      !revealed && "border-line hover:border-line-strong",
                      revealed && isAnswer && "border-stat-green/50 bg-stat-green/10",
                      revealed &&
                        isChosen &&
                        !isAnswer &&
                        "border-danger/50 bg-danger/10",
                      revealed && !isAnswer && !isChosen && "border-line opacity-55",
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
            <div
              role="status"
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-xs leading-5",
                chosen === SAMPLE_QUIZ.correctIndex
                  ? "border-stat-green/40 bg-stat-green/10 text-stat-green"
                  : "border-stat-orange/40 bg-stat-orange/10 text-stat-orange",
              )}
            >
              <span className="font-semibold">
                {chosen === SAMPLE_QUIZ.correctIndex ? "Saktë. " : "Jo saktësisht. "}
              </span>
              {SAMPLE_QUIZ.explanation}
            </div>
          ) : null}
        </Panel>
      </div>

      {/* --- How it works, in three steps --------------------------------- */}
      <Card>
        <h2 className="text-sm font-semibold">Si funksionon</h2>
        <ol className="mt-4 grid gap-5 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              {/*
                A number, not an icon: it carries the order, which is real
                information. Decorative icons would add nothing here.
              */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] font-semibold tabular-nums text-muted">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold">{step.title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {/* --- What it costs, stated plainly -------------------------------- */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              Plani {free.name} — {free.priceLabel}, {free.periodLabel}
            </h2>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <div className="flex gap-1.5">
                <dt className="text-muted">Dokumente në ditë:</dt>
                <dd className="font-medium tabular-nums">
                  {free.limits.documentsPerDay}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">Flashcards në ditë:</dt>
                <dd className="font-medium tabular-nums">
                  {free.limits.flashcardsPerDay}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted">Pyetje kuizi në ditë:</dt>
                <dd className="font-medium tabular-nums">
                  {free.limits.quizQuestionsPerDay}
                </dd>
              </div>
            </dl>
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
