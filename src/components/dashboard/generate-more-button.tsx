"use client";

/**
 * "Gjenero më shumë" control.
 *
 * After a material is generated the user can ask for another batch of 3
 * flashcards and 3 quiz questions, repeatedly, until the daily plan limit is
 * reached. The button states exactly how many will be added and disables itself
 * with a clear reason once a ceiling is hit.
 *
 * Two ceilings apply and the button reports which one was reached, because the
 * remedy differs: a plan limit resets tomorrow, a full study set does not.
 */
import { useCallback, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { PlusIcon } from "@/components/ui/icons";
import { emitAppEvent, HISTORY_CHANGED } from "@/lib/app-events";
import { planIncrement } from "@/lib/incremental";
import { regenerateStudySet, type StudySetDetail } from "@/services/history";
import type { RemainingUsage } from "@/services/generation";

export function GenerateMoreButton({
  studySet,
  remaining,
  maxPerSet,
  onGenerated,
}: {
  studySet: StudySetDetail;
  /** Remaining daily allowance, from the server. */
  remaining: RemainingUsage | null;
  /** Items a study set may hold, per the security rules. */
  maxPerSet: number;
  /** Called with the updated set after a successful generation. */
  onGenerated?: (updated: StudySetDetail) => void;
}) {
  const { getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planNoticeVisible, setPlanNoticeVisible] = useState(true);

  const plan = planIncrement(
    {
      flashcardsRemaining: remaining?.flashcards ?? 0,
      quizQuestionsRemaining: remaining?.quizQuestions ?? 0,
      flashcardsInSet: studySet.flashcards.length,
      quizQuestionsInSet: studySet.quizQuestions.length,
      maxPerSet,
    },
    { flashcards: true, quizQuestions: true },
  );

  const generate = useCallback(async () => {
    setError(null);
    setBusy(true);

    try {
      const token = await getIdToken();
      if (!token) {
        setError("Sesioni ka skaduar. Hyr përsëri.");
        return;
      }

      const result = await regenerateStudySet(token, {
        studySetId: studySet.id,
        kinds: ["flashcards", "quiz"],
        // No re-uploaded text: generation works from the saved content, and the
        // server refuses if that content is too thin to support more.
        counts: {
          flashcards: plan.flashcards,
          quizQuestions: plan.quizQuestions,
        },
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      // The sidebar's recent list shows item counts, so it refreshes too.
      emitAppEvent(HISTORY_CHANGED);
      onGenerated?.(result.data.studySet);
    } catch (unexpected) {
      console.error("[generate-more] failed:", unexpected);
      setError("Ndodhi një gabim i papritur. Provo përsëri.");
    } finally {
      setBusy(false);
    }
  }, [
    getIdToken,
    studySet.id,
    plan.flashcards,
    plan.quizQuestions,
    onGenerated,
  ]);

  if (!plan.canAdd) {
    return (
      <>
        <p className="text-xs leading-5 text-muted">
          {plan.reason ?? "Nuk mund të shtohen materiale të reja për momentin."}
        </p>
        {remaining !== null && plan.blockedByPlan && planNoticeVisible ? (
          <Toast
            tone="error"
            onDismiss={() => setPlanNoticeVisible(false)}
          >
            Ke mbaruar gjenerimet falas për sot. Kuota e planit rifreskohet nesër.
          </Toast>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        id="generate-more-action"
        variant="secondary"
        onClick={() => void generate()}
        disabled={busy}
      >
        <PlusIcon size={16} />
        {busy
          ? "Duke gjeneruar…"
          : `Gjenero edhe ${plan.flashcards} flashcards dhe ${plan.quizQuestions} pyetje`}
      </Button>

      <p className="text-xs text-muted">
        Mund ta përsëritësh derisa të arrish kufirin ditor të planit.
      </p>

      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
