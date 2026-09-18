"use client";

/**
 * Quiz panel.
 *
 * Dashboard section matching the approved design: one question at a time, the
 * progress counter and navigation in the panel header, and the options as
 * lettered rows.
 *
 * Selecting an option immediately records the answer and reveals whether it was
 * correct, which is what the single-button design implies. The correct option
 * is always marked afterwards, and the explanation is shown when the model
 * provided one.
 *
 * The score is session state only and is never persisted.
 */
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import {
  ArrowRightIcon,
  BulbIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  QuizIcon,
} from "@/components/ui/icons";
import { Panel } from "@/components/dashboard/panel";
import {
  answerFor,
  buildResult,
  clampIndex,
  createQuizSession,
  recordAnswer,
  type QuizSession,
} from "@/lib/quiz";
import type { QuizQuestion } from "@/types";
import { createQuizShare } from "@/services/quiz-shares";

/** Letters used to label the options, matching how a quiz is read aloud. */
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"] as const;

export function QuizPanel({
  questions,
  tag,
  onRequestMore,
  studySetId,
}: {
  questions: QuizQuestion[];
  /** Short label shown above the question, e.g. the material title. */
  tag?: string | null;
  onRequestMore?: () => void;
  studySetId?: string | null;
}) {
  const { getIdToken } = useAuth();
  const [session, setSession] = useState<QuizSession>(createQuizSession);
  const [finished, setFinished] = useState(false);
  /** The option the user has picked but not yet checked. */
  const [selected, setSelected] = useState<number | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  const total = questions.length;
  const index = clampIndex(session.currentIndex, total);
  const question = questions[index] ?? null;
  const recorded = answerFor(session, index);

  /**
   * Moves to a question and restores any answer already given for it.
   *
   * The session is passed in rather than read from state, so the selection
   * restored and the position moved to come from the same snapshot.
   */
  const goTo = (next: number, current: QuizSession) => {
    const target = clampIndex(next, total);
    const previous = answerFor(current, target);
    setSelected(previous ? previous.selectedIndex : null);
    setSession({ ...current, currentIndex: target });
  };

  /**
   * Records the picked option. Correctness is revealed only after this, so the
   * answer is never given away by simply highlighting a choice.
   */
  const submit = () => {
    if (selected === null || !question) return;
    setSession((current) => recordAnswer(current, index, selected, questions));
  };

  const share = async () => {
    if (!studySetId) return;
    const token = await getIdToken();
    if (!token) {
      setShareStatus("Hyr përsëri për të krijuar linkun.");
      return;
    }
    const result = await createQuizShare(token, studySetId);
    if (!result.ok) {
      setShareStatus(result.message);
      return;
    }
    const url = `${window.location.origin}/share/quiz/${result.data.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Linku u kopjua.");
    } catch {
      setShareStatus("Linku u krijua, por nuk u kopjua automatikisht.");
    }
  };

  /** Coach line under the quiz: a nudge before answering, feedback after. */
  const tip = (() => {
    if (!question) return "";
    if (recorded === null) {
      return `Mendo mirë, ${question.options.length} mundësi!`;
    }
    if (recorded.correct) return "Saktë! Vazhdo kështu.";
    return (
      question.explanation ??
      `Përgjigjja e saktë: ${
        question.options[question.correctOptionIndex] ?? "—"
      }`
    );
  })();

  // --- Result view --------------------------------------------------------
  if (finished) {
    const result = buildResult(session, questions);

    return (
      <Panel
        id="kuiz"
        icon={QuizIcon}
        tone="orange"
        title="Kuiz"
        subtitle="Testo njohuritë e tua dhe ndiq përparimin."
        action={
          <span className="text-sm tabular-nums text-muted">
            {result.correct} / {result.total}
          </span>
        }
      >
        <div className="flex h-full flex-col items-center justify-center py-8 text-center">
          <p className="text-3xl font-semibold tracking-tight">
            {result.correct} / {result.total}
          </p>
          <p className="mt-1 text-sm text-muted">{result.percentage}%</p>
          <p className="mt-3 text-sm">{result.message}</p>

          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => {
              setSession(createQuizSession());
              setFinished(false);
            }}
          >
            Provo përsëri
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      id="kuiz"
      icon={QuizIcon}
      tone="orange"
      title="Kuiz"
      subtitle="Testo njohuritë e tua dhe ndiq përparimin."
      action={
        <div className="flex items-center gap-2">
          {onRequestMore ? (
            <Button variant="secondary" onClick={onRequestMore}>
              Gjenero më shumë
            </Button>
          ) : null}
          {studySetId && questions.length > 0 ? (
            <Button variant="secondary" onClick={() => void share()}>
              Ndaje kuizin
            </Button>
          ) : null}
          <span className="text-sm tabular-nums text-muted">
            {total === 0 ? "0 / 0" : `${index + 1} / ${total}`}
          </span>
          <button
            type="button"
            onClick={() => goTo(index - 1, session)}
            disabled={index === 0}
            aria-label="Pyetja e mëparshme"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-content disabled:opacity-40"
          >
            <ChevronLeftIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1, session)}
            disabled={index >= total - 1}
            aria-label="Pyetja tjetër"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-content disabled:opacity-40"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>
      }
    >
      {total === 0 || !question ? (
        <p className="py-10 text-center text-sm text-muted">
          Ky material nuk përmban pyetje kuizi.
        </p>
      ) : (
        <div className="flex h-full flex-col">
          {tag ? (
            <span className="mb-3 max-w-full self-start truncate rounded-full bg-accent/15 px-3 py-1 text-[11px] font-semibold text-accent">
              {tag}
            </span>
          ) : null}

          <p className="wrap-break-word text-sm font-medium leading-6">
            {question.question}
          </p>

          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Zgjidh një përgjigje</legend>
            {question.options.map((option, optionIndex) => {
              const isChosen =
                recorded !== null
                  ? recorded.selectedIndex === optionIndex
                  : selected === optionIndex;
              const isCorrectOption = optionIndex === question.correctOptionIndex;
              // Correctness is only marked once an answer has been recorded.
              const showCorrect = recorded !== null && isCorrectOption;
              const showWrong = recorded !== null && isChosen && !isCorrectOption;

              return (
                <label
                  key={`${option}-${optionIndex}`}
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                    showCorrect
                      ? "border-success bg-success/5"
                      : showWrong
                        ? "border-danger bg-danger/5"
                        : isChosen
                          ? "border-accent bg-accent/5"
                          : "border-line hover:border-line-strong",
                    recorded !== null ? "cursor-default" : "",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name={`dashboard-quiz-${index}`}
                    className="sr-only"
                    checked={isChosen}
                    disabled={recorded !== null}
                    onChange={() => setSelected(optionIndex)}
                  />
                  <span
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                      showCorrect
                        ? "bg-success text-white"
                        : showWrong
                          ? "bg-danger text-white"
                          : isChosen
                            ? "bg-accent text-white"
                            : "bg-surface-2 text-muted",
                    ].join(" ")}
                  >
                    {OPTION_LABELS[optionIndex] ?? optionIndex + 1}
                  </span>
                  <span className="min-w-0 break-words leading-6">{option}</span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-auto pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[11px] leading-4 text-muted">
                <BulbIcon size={14} className="shrink-0 text-stat-orange" />
                {tip}
              </p>

              {recorded === null ? (
                <Button onClick={submit} disabled={selected === null}>
                  Kontrollo përgjigjen →
                </Button>
              ) : index >= total - 1 ? (
                <Button onClick={() => setFinished(true)}>
                  Shiko rezultatin
                  <ArrowRightIcon size={16} />
                </Button>
              ) : (
                <Button onClick={() => goTo(index + 1, session)}>
                  Pyetja tjetër
                  <ArrowRightIcon size={16} />
                </Button>
              )}
            </div>

            {index > 0 ? (
              <div className="mt-3">
                <Button
                  variant="secondary"
                  onClick={() => goTo(index - 1, session)}
                >
                  ← Prapa
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {shareStatus ? (
        <Toast tone="success" onDismiss={() => setShareStatus(null)}>
          {shareStatus}
        </Toast>
      ) : null}
    </Panel>
  );
}
