"use client";

/**
 * Regeneration panel.
 *
 * Lets the user request MORE material for an existing study set. Because the
 * original document is no longer available, the panel:
 *
 *   - explains that only the saved content will be used,
 *   - offers an optional re-upload when the saved content is too thin,
 *   - makes clear that re-uploaded text stays temporary.
 *
 * The server independently decides whether saved context is sufficient and
 * returns a clear Albanian message telling the user to re-upload when it is not.
 */
import { useCallback, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { DropZone } from "@/components/documents/drop-zone";
import { GenerationOptions } from "@/components/documents/generation-options";
import { useDocumentUploader } from "@/components/documents/use-document-uploader";
import { ACCEPTED_FORMATS_LABEL } from "@/config/app";
import { regenerateStudySet, type StudySetDetail } from "@/services/history";
import type { GenerationKind } from "@/types";

export function RegeneratePanel({
  studySet,
  onCancel,
  onDone,
}: {
  studySet: StudySetDetail;
  onCancel: () => void;
  onDone: (updated: StudySetDetail) => void | Promise<void>;
}) {
  const { getIdToken } = useAuth();
  const uploader = useDocumentUploader();

  const [kinds, setKinds] = useState<GenerationKind[]>(["flashcards"]);
  const [counts, setCounts] = useState({ flashcards: 3, quizQuestions: 3 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** What the saved set actually contains, used to warn about thin context. */
  const savedChars =
    (studySet.summary?.length ?? 0) +
    studySet.flashcards.reduce(
      (total, card) => total + card.question.length + card.answer.length,
      0,
    ) +
    studySet.quizQuestions.reduce(
      (total, question) =>
        total +
        question.question.length +
        question.options.join("").length,
      0,
    );

  const generate = useCallback(async () => {
    setError(null);

    if (kinds.length === 0) {
      setError("Zgjidh të paktën një lloj përmbajtjeje.");
      return;
    }

    setBusy(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setError("Sesioni ka skaduar. Hyr përsëri.");
        return;
      }

      // Re-uploaded text is sent for this request only and is never stored.
      const result = await regenerateStudySet(token, {
        studySetId: studySet.id,
        kinds,
        ...(uploader.document ? { text: uploader.document.text } : {}),
        counts,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      // Release the re-uploaded document as soon as the request completes.
      uploader.reset();
      await onDone(result.data.studySet);
    } catch (unexpected) {
      console.error("[regenerate] failed:", unexpected);
      setError("Ndodhi një gabim i papritur. Provo përsëri.");
    } finally {
      setBusy(false);
    }
  }, [getIdToken, studySet.id, kinds, counts, uploader, onDone]);

  return (
    <section
      aria-labelledby="regenerate-heading"
      className="rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="regenerate-heading" className="text-sm font-medium">
            Gjenero materiale shtesë
          </h3>
          <p className="mt-1 truncate text-xs text-muted">{studySet.title}</p>
        </div>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Anulo
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        <Alert tone="info">
          Dokumenti origjinal nuk ruhet. Materialet e reja gjenerohen nga
          përmbajtja e ruajtur (përmbledhja, flashcards dhe kuizi). Nëse kjo nuk
          mjafton, ngarko përsëri dokumentin origjinal më poshtë.
        </Alert>

        <GenerationOptions
          selected={kinds}
          onChange={setKinds}
          disabled={busy}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {kinds.includes("flashcards") ? (
            <div>
              <label htmlFor="regen-cards" className="block text-xs font-medium">
                Sa flashcards të reja?
              </label>
              <input
                id="regen-cards"
                type="number"
                min={1}
                max={8}
                value={counts.flashcards}
                disabled={busy}
                onChange={(event) =>
                  setCounts((current) => ({
                    ...current,
                    flashcards: clamp(event.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
              />
            </div>
          ) : null}

          {kinds.includes("quiz") ? (
            <div>
              <label htmlFor="regen-quiz" className="block text-xs font-medium">
                Sa pyetje kuizi të reja?
              </label>
              <input
                id="regen-quiz"
                type="number"
                min={1}
                max={8}
                value={counts.quizQuestions}
                disabled={busy}
                onChange={(event) =>
                  setCounts((current) => ({
                    ...current,
                    quizQuestions: clamp(event.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
              />
            </div>
          ) : null}
        </div>

        {/* Optional re-upload. Shown prominently when saved content is thin. */}
        <div>
          <h4 className="text-xs font-medium">
            Ngarko përsëri dokumentin origjinal (opsionale)
          </h4>
          <p className="mt-1 text-xs text-muted">
            {savedChars < 400
              ? "Përmbajtja e ruajtur është e vogël — rekomandohet ngarkimi i dokumentit origjinal."
              : "Zakonisht nuk nevojitet, por jep materiale më të sakta."}
          </p>

          {uploader.document ? (
            <div className="mt-2 rounded-md border border-line bg-surface-2 p-3">
              <p className="truncate text-sm" title={uploader.document.filename}>
                {uploader.document.filename}
              </p>
              <p className="mt-1 text-xs text-muted">
                {uploader.document.text.length.toLocaleString("sq-AL")}{" "}
                karaktere · teksti mbahet përkohësisht dhe nuk ruhet
              </p>
              <Button
                variant="ghost"
                onClick={uploader.reset}
                disabled={busy}
                className="mt-2"
              >
                Hiq skedarin
              </Button>
            </div>
          ) : (
            <div className="mt-2">
              <DropZone
                onFiles={(files) => {
                  const first = files[0];
                  if (first) void uploader.selectFile(first);
                }}
                multiple={false}
                disabled={busy}
                formatsLabel={ACCEPTED_FORMATS_LABEL}
                sizeLabel="Kufiri 25 MB."
              />
            </div>
          )}

          {uploader.busy ? (
            <p role="status" className="mt-2 text-xs text-muted">
              Duke nxjerrë tekstin…
            </p>
          ) : null}
          {uploader.error ? (
            <div className="mt-2">
              <Alert>{uploader.error}</Alert>
            </div>
          ) : null}
        </div>

        {error ? <Alert>{error}</Alert> : null}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button onClick={() => void generate()} disabled={busy || uploader.busy}>
            {busy ? "Duke gjeneruar…" : "Gjenero"}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Anulo
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Clamps a number input into [1, 8]. */
function clamp(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), 8);
}
