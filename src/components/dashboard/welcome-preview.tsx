"use client";

/**
 * Signed-out dashboard.
 *
 * A visitor who is not signed in used to see the full dashboard with every meter
 * reading zero, which looks broken rather than new.
 *
 * This is the third iteration, and the first two are worth recording because
 * they show what "premium" actually means here:
 *
 *   v1: one full-width flip card. At 1440px that was a 1,150px-wide card holding
 *       one short question — mostly empty space, no hierarchy, looked like a
 *       template.
 *   v2: two columns and real sections. Correct, but still flat: every block had
 *       the same weight, so nothing led the eye and it read as sparse.
 *   v3 (this): a clear focal point. The headline carries the page, the upload
 *       target sits directly beside the outcome it produces, and the remaining
 *       sections step DOWN in weight — the quiz and the steps are visibly
 *       subordinate to the hero.
 *
 * The design rules, deliberately:
 *   - No decoration. No gradients, glows, blobs, illustrations or spot art.
 *     Weight comes from type scale, spacing rhythm and the panel borders that
 *     the rest of the app already uses.
 *   - Real information only. The upload target, the deck, the quiz and the plan
 *     limits are exactly what a student gets. Nothing is a mock-up of something
 *     that does not exist.
 *   - Reuse the product's own components, so the visitor sees the actual
 *     interface rather than a marketing impression of it.
 *
 * Upload behaviour for a signed-out visitor: the drop zone is REAL. Dropping or
 * selecting a file is accepted, the filename is shown, and the visitor is then
 * asked to sign in. Nothing is uploaded — text extraction happens in the
 * browser and generation needs an account — so the file never leaves the
 * machine, and the visitor is never told something happened that did not.
 */
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/dashboard/panel";
import { DropZone } from "@/components/documents/drop-zone";
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

/** The three things a document produces, with a real example of each. */
const OUTPUTS: readonly {
  title: string;
  example: string;
  tone: "blue" | "green" | "orange";
}[] = [
  {
    title: "Përmbledhje",
    example:
      "Fotosinteza ndodh në dy faza: reaksionet e varura nga drita dhe cikli i Calvin.",
    tone: "blue",
  },
  {
    title: "Flashcards",
    example: "Një kartë për çdo koncept, me pyetjen nga njëra anë dhe përgjigjjen nga tjetra.",
    tone: "green",
  },
  {
    title: "Kuiz",
    example: "Pyetje me katër alternativa dhe shpjegim për përgjigjjen e saktë.",
    tone: "orange",
  },
];

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
    body: "Kthe kartat, përgjigju pyetjeve dhe ndiq përparimin ditor. Materialet ruhen për herën tjetër.",
  },
];

/** Tint for the little output markers, matching the app's panel tones. */
const OUTPUT_TONE_CLASSES: Record<string, string> = {
  blue: "bg-stat-blue/12 text-stat-blue",
  green: "bg-stat-green/12 text-stat-green",
  orange: "bg-stat-orange/12 text-stat-orange",
};

export function WelcomePreview() {
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /** null until the visitor picks an option. */
  const [chosen, setChosen] = useState<number | null>(null);
  /** Name of a file the visitor selected, so the next step is obvious. */
  const [pickedFile, setPickedFile] = useState<string | null>(null);

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
      {/* ==================================================================
          HERO — the focal point. Headline, the upload target, and the thing
          it produces, side by side.
          ================================================================== */}
      <section className="dash-panel rounded-[22px] p-5 sm:p-7">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center">
          {/* --- Left: the promise, and the action --------------------- */}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              Studim nga dokumentet e tua
            </p>

            <h1 className="mt-3 text-[1.6rem] font-semibold leading-[1.15] tracking-tight sm:text-[2rem] lg:text-[2.15rem]">
              Kthe materialin e kursit në flashcards dhe kuize
            </h1>

            <p className="mt-3 max-w-lg text-sm leading-6 text-muted">
              Ngarko një {ACCEPTED_FORMATS_LABEL}. Seigem nxjerr tekstin, shkruan
              përmbledhjen dhe krijon kartat e pyetjet — njësoj siç do t&apos;i
              bëje vetë, por në një hap.
            </p>

            {/* The upload target. Real: it accepts a drop, then explains that
                an account is needed to generate. */}
            <div className="mt-5">
              <DropZone
                onFiles={(files) => {
                  const first = files[0];
                  if (first) setPickedFile(first.name);
                }}
                formatsLabel="PDF, DOCX, PPTX"
                sizeLabel={`(maks. ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB)`}
                multiple={false}
              />
            </div>

            {pickedFile ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2.5">
                <p className="min-w-0 truncate text-xs">
                  <span className="font-semibold">{pickedFile}</span>
                  <span className="text-muted"> — gati për gjenerim.</span>
                </p>
                <Link href={loginHref} className="shrink-0">
                  <Button className="px-3 py-1.5 text-xs">
                    Hyr dhe vazhdo
                    <ArrowRightIcon size={14} />
                  </Button>
                </Link>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
              <span>Hyr me Google</span>
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>
              <span>Pa kartë krediti</span>
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>
              <span>Dokumenti nuk ruhet</span>
            </div>
          </div>

          {/* --- Right: the outcome, as a real deck ---------------------- */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Shembull rezultati
              </p>
              <p className="text-xs tabular-nums text-muted">
                {cardIndex + 1} / {SAMPLE_CARDS.length}
              </p>
            </div>

            {/*
              Deck depth: two cards peeking out BELOW the active one, using the
              same `deck-layer` treatment as the signed-in deck. They are sized
              to the card (inside the same max-w-sm wrapper) rather than to the
              column — a deck that sticks out at the sides reads as a stray box,
              not as a stack.
            */}
            <div className="mt-3 pb-5">
              <div className="relative mx-auto w-full max-w-sm">
                <div
                  aria-hidden="true"
                  className="deck-layer absolute inset-x-4 -bottom-1.5 h-6 rounded-2xl border border-line bg-surface-2"
                />
                <div
                  aria-hidden="true"
                  className="deck-layer absolute inset-x-2 -bottom-3 h-6 rounded-2xl border border-line bg-surface-2"
                />

                <div className="relative">
                  <FlipCard
                    key={cardIndex}
                    flipped={flipped}
                    onToggle={() => setFlipped((value) => !value)}
                    label={`Karta mostër ${cardIndex + 1}. Trokit për ta kthyer.`}
                    front={
                      <>
                        <span className="flashcard-eyebrow">Pyetja</span>
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
                        <span className="flashcard-eyebrow">Përgjigjja</span>
                        <p className="mt-2.5 text-[15px] leading-6">
                          {card.answer}
                        </p>
                      </>
                    }
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-4 text-muted">
                Nga një dokument i vërtetë.
              </p>
              <Button
                variant="secondary"
                onClick={nextCard}
                className="shrink-0 px-3 py-1.5 text-xs"
              >
                Karta tjetër
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================
          WHAT A DOCUMENT PRODUCES — three outputs, each with a real example.
          ================================================================== */}
      <div className="grid gap-4 sm:grid-cols-3">
        {OUTPUTS.map((output) => (
          <div
            key={output.title}
            className="dash-panel rounded-[22px] p-4 sm:p-5"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  OUTPUT_TONE_CLASSES[output.tone],
                )}
                aria-hidden="true"
              />
              <h2 className="text-[13px] font-semibold">{output.title}</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{output.example}</p>
          </div>
        ))}
      </div>

      {/* ==================================================================
          THE QUIZ, AND HOW IT WORKS — deliberately lighter than the hero.
          ================================================================== */}
      <div className="grid gap-4 lg:grid-cols-2">
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

        <Panel
          icon={LayersIcon}
          tone="green"
          title="Si funksionon"
          subtitle="Tri hapa, pa konfigurim."
        >
          <ol className="space-y-4">
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
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {/* ==================================================================
          PRICE, AND THE CLOSING ACTION.
          ================================================================== */}
      <section className="dash-panel rounded-[22px] p-4 sm:p-5">
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
      </section>
    </div>
  );
}
