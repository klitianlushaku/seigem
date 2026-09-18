"use client";

/**
 * Interactive quiz screen.
 *
 * Presents ONE question at a time. The student selects an answer, presses
 * "Kontrollo", and only then is correctness revealed — along with the correct
 * answer and the explanation when one exists.
 *
 * The score is held in temporary session state. It is not persisted, which the
 * master prompt explicitly allows.
 */
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  answerFor,
  buildResult,
  clampIndex,
  createQuizSession,
  isComplete,
  recordAnswer,
  type QuizSession,
} from "@/lib/quiz";
import type { QuizQuestion } from "@/types";

/** Albanian letters used as option labels, matching how quizzes are read. */
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export function QuizRunner({ questions }: { questions: QuizQuestion[] }) {
  const [session, setSession] = useState<QuizSession>(createQuizSession);
  const [selected, setSelected] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const total = questions.length;
  const index = clampIndex(session.currentIndex, total);
  const question = questions[index];
  const recorded = answerFor(session, index);

  /** Moves to a question and restores any answer already given for it. */
  const goTo = useCallback(
    (next: number, current: QuizSession) => {
      const target = clampIndex(next, total);
      const previous = answerFor(current, target);
      setSelected(previous ? previous.selectedIndex : null);
      setSession({ ...current, currentIndex: target });
    },
    [total],
  );

  /** Submits the current selection. Only then is correctness revealed. */
  const submit = useCallback(() => {
    if (selected === null || !question) return;
    setSession((current) => recordAnswer(current, index, selected, questions));
  }, [selected, question, index, questions]);

  if (total === 0) {
    return (
      <p className="text-sm text-muted">Ky material nuk përmban pyetje kuizi.</p>
    );
  }

  // --- Final score --------------------------------------------------------
  if (finished) {
    const result = buildResult(session, questions);

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-surface p-6 text-center">
          <p className="text-xs uppercase tracking-wide text-muted">
            Rezultati përfundimtar
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {result.correct} / {result.total}
          </p>
          <p className="mt-1 text-sm text-muted">{result.percentage}%</p>
          <p className="mt-4 text-sm">{result.message}</p>
        </div>

        {/* Per-question review, so the score is actionable. */}
        <ul className="space-y-2">
          {questions.map((entry, questionIndex) => {
            const answer = answerFor(session, questionIndex);
            const wasCorrect = answer?.correct ?? false;

            return (
              <li
                key={`${entry.question}-${questionIndex}`}
                className="rounded-md border border-line p-3 text-sm"
              >
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={wasCorrect ? "text-success" : "text-danger"}
                  >
                    {wasCorrect ? "✓" : "✗"}
                  </span>
                  <div className="min-w-0">
                    <p>
                      {questionIndex + 1}. {entry.question}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      E saktë: {entry.options[entry.correctOptionIndex]}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <Button
          variant="secondary"
          onClick={() => {
            setSession(createQuizSession());
            setSelected(null);
            setFinished(false);
          }}
        >
          Provo përsëri
        </Button>
      </div>
    );
  }

  const isLast = index === total - 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted" aria-live="polite">
          {index + 1} / {total}
        </p>
        <p className="text-xs text-muted">
          Saktë deri tani: {session.answers.filter((a) => a.correct).length}
        </p>
      </div>

      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <fieldset className="rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 text-xs uppercase tracking-wide text-muted">
          Pyetja {index + 1}
        </legend>

        <p className="break-words text-base leading-7">{question?.question}</p>

        <div className="mt-4 space-y-2">
          {question?.options.map((option, optionIndex) => {
            const isSelected = selected === optionIndex;
            const isCorrectOption = optionIndex === question.correctOptionIndex;
            // Correctness is only shown AFTER the answer is submitted.
            const showAsCorrect = recorded !== null && isCorrectOption;
            const showAsWrong =
              recorded !== null && isSelected && !isCorrectOption;

            return (
              <label
                key={`${option}-${optionIndex}`}
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                  showAsCorrect
                    ? "border-success"
                    : showAsWrong
                      ? "border-danger"
                      : isSelected
                        ? "border-accent bg-surface-2"
                        : "border-line hover:border-line-strong",
                  recorded !== null ? "cursor-default" : "",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name={`question-${index}`}
                  checked={isSelected}
                  disabled={recorded !== null}
                  onChange={() => setSelected(optionIndex)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="text-muted">
                    {OPTION_LABELS[optionIndex] ?? optionIndex + 1}.
                  </span>{" "}
                  {option}
                  {showAsCorrect ? (
                    <span className="ml-2 text-xs text-success">
                      (e saktë)
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        {/* Feedback: correctness, the right answer, and the explanation. */}
        {recorded !== null ? (
          <div className="mt-4 border-t border-line pt-4">
            <p
              role="status"
              className={
                recorded.correct
                  ? "text-sm text-success"
                  : "text-sm text-danger"
              }
            >
              {recorded.correct
                ? "Saktë!"
                : "Gabim. Përgjigjja e saktë është shënuar më sipër."}
            </p>

            {question?.explanation ? (
              <p className="mt-2 text-sm leading-6 text-muted">
                {question.explanation}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        {recorded === null ? (
          <Button onClick={submit} disabled={selected === null}>
            Kontrollo
          </Button>
        ) : isLast ? (
          <Button onClick={() => setFinished(true)}>Shiko rezultatin</Button>
        ) : (
          <Button onClick={() => goTo(index + 1, session)}>
            Pyetja tjetër →
          </Button>
        )}

        <Button
          variant="secondary"
          onClick={() => goTo(index - 1, session)}
          disabled={index === 0}
        >
          ← Prapa
        </Button>
      </div>

      {/* Shown once every question has been answered, so the quiz can end early. */}
      {!isLast && isComplete(session, questions) ? (
        <Button variant="secondary" onClick={() => setFinished(true)}>
          Shiko rezultatin përfundimtar
        </Button>
      ) : null}
    </div>
  );
}
