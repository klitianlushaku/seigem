"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { QuizQuestion } from "@/types";

export function PublicQuiz({
  title,
  questions,
}: {
  title: string;
  questions: QuizQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answered, setAnswered] = useState(false);
  const question = questions[index];

  if (finished) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-muted">Kuiz i përbashkët</p>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="mt-8 text-4xl font-semibold">{score} / {questions.length}</p>
        <Button
          className="mt-6"
          onClick={() => {
            setIndex(0);
            setSelected(null);
            setScore(0);
            setAnswered(false);
            setFinished(false);
          }}
        >
          Provo përsëri
        </Button>
      </main>
    );
  }

  if (!question) return null;

  const submit = () => {
    if (selected === null) return;
    if (!answered) {
      if (selected === question.correctOptionIndex) {
        setScore((value) => value + 1);
      }
      setAnswered(true);
      return;
    }

    if (index === questions.length - 1) {
      setFinished(true);
    } else {
      setIndex((value) => value + 1);
      setSelected(null);
      setAnswered(false);
    }
  };

  const isCorrect = selected === question.correctOptionIndex;
  const tip = !answered
    ? `Mendo mirë, ${question.options.length} mundësi!`
    : isCorrect
      ? "Saktë! Vazhdo kështu."
      : question.explanation ??
        `Përgjigjja e saktë: ${question.options[question.correctOptionIndex] ?? "—"}`;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="text-sm text-muted">Kuiz i përbashkët · {index + 1} / {questions.length}</p>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-medium leading-7">{question.question}</h2>
        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">Zgjidh një përgjigje</legend>
          {question.options.map((option, optionIndex) => {
            const isChosen = selected === optionIndex;
            const showCorrect =
              answered && optionIndex === question.correctOptionIndex;
            const showWrong = answered && isChosen && !showCorrect;

            return (
              <label
                key={`${option}-${optionIndex}`}
                className={[
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                  showCorrect
                    ? "border-success bg-success/5"
                    : showWrong
                      ? "border-danger bg-danger/5"
                      : isChosen
                        ? "border-accent bg-accent/5"
                        : "border-line hover:border-line-strong",
                  answered ? "cursor-default" : "",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name={`shared-${index}`}
                  checked={isChosen}
                  disabled={answered}
                  onChange={() => setSelected(optionIndex)}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </fieldset>
        <p className="mt-4 text-sm text-muted">{tip}</p>
        <Button className="mt-6" onClick={submit} disabled={selected === null}>
          {!answered
            ? "Kontrollo përgjigjen →"
            : index === questions.length - 1
              ? "Shiko rezultatin"
              : "Pyetja tjetër"}
        </Button>
      </section>
    </main>
  );
}