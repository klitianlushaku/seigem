"use client";

/**
 * Document uploader and generation workflow.
 *
 * The user drops one or more documents and Seigem does the rest: text is
 * extracted locally, then a summary, flashcards and a quiz are generated for
 * each document in one pass. Nothing is asked first.
 *
 * Privacy: the extracted text is held only for the duration of each document's
 * request and is released as soon as it has been sent. It is never persisted.
 *
 * Quota: each document consumes one document unit, plus one unit per generated
 * flashcard and quiz question. A document that runs into a plan limit fails on
 * its own and the remaining documents still run, so one refusal never discards
 * a whole batch.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/documents/drop-zone";
import { RegeneratePanel } from "@/components/dashboard/regenerate-panel";
import { ACCEPTED_FORMATS_LABEL, MAX_FILE_SIZE_BYTES, MAX_TITLE_LENGTH } from "@/config/app";
import {
  HISTORY_CHANGED,
  NEW_MATERIAL,
  OPEN_MORE_MATERIAL,
  emitAppEvent,
} from "@/lib/app-events";
import {
  missingKindsMessage,
  missingRequestedKinds,
} from "@/lib/generation-coverage";
import {
  DEFAULT_FLASHCARDS,
  DEFAULT_QUIZ_QUESTIONS,
} from "@/lib/plan-limits";
import { titleFromFilename } from "@/lib/utils/text";
import { extractTextFromFile } from "@/services/document";
import { validateFile } from "@/services/document/validate";
import { requestGeneration } from "@/services/generation";
import { fetchStudySet, type StudySetDetail } from "@/services/history";

/** Where one uploaded document has got to. */
type JobStatus = "queued" | "extracting" | "generating" | "done" | "error";

interface Job {
  id: string;
  filename: string;
  status: JobStatus;
  /** Failure message, in Albanian. */
  message?: string;
  /** Set once the study set has been saved. */
  studySetId?: string;
  title?: string;
  flashcards?: number;
  quizQuestions?: number;
  hasSummary?: boolean;
  /**
   * Set when the request SUCCEEDED but produced less than was asked for, e.g.
   * a summary with no flashcards. Without this the row looks like a plain
   * success and the user is left wondering where their cards went.
   */
  note?: string;
}

/** Albanian label for each job state. */
const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Në pritje…",
  extracting: "Duke nxjerrë tekstin…",
  generating: "Duke gjeneruar përmbledhje, flashcards dhe kuiz…",
  done: "Gati",
  error: "Dështoi",
};

export function StudyWorkflow() {
  const { user, getIdToken } = useAuth();
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The study set being topped up with extra material, if any. */
  const [moreFor, setMoreFor] = useState<StudySetDetail | null>(null);

  // "Material i ri" from the sidebar clears the panel.
  useEffect(() => {
    const handler = () => {
      setJobs([]);
      setError(null);
      setMoreFor(null);
    };
    window.addEventListener(NEW_MATERIAL, handler);
    return () => window.removeEventListener(NEW_MATERIAL, handler);
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((previous) =>
      previous.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  }, []);

  /** Runs every selected document through extraction and generation. */
  const runBatch = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setError(null);
      setMoreFor(null);

      const batch: Job[] = files.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        filename: file.name,
        status: "queued",
      }));
      setJobs(batch);
      setBusy(true);

      const token = await getIdToken();
      if (!token) {
        setBusy(false);
        if (!user) {
          router.push(`/login?next=${encodeURIComponent("/dashboard")}`);
        }
        setError("Duhet të hyni për të ngarkuar materialin.");
        return;
      }

      for (const [index, file] of files.entries()) {
        const job = batch[index];
        if (!job) continue;

        // 1. Validate before doing any work.
        const validation = validateFile(file);
        if (!validation.ok) {
          updateJob(job.id, { status: "error", message: validation.message });
          continue;
        }

        // 2. Extract locally. Never uploaded.
        updateJob(job.id, { status: "extracting" });
        const extraction = await extractTextFromFile(file);
        if (!extraction.ok) {
          updateJob(job.id, { status: "error", message: extraction.message });
          continue;
        }

        // 3. Generate everything in one request. `extraction.text` lives only
        //    for the duration of this call and is dropped afterwards.
        updateJob(job.id, { status: "generating" });

        const title =
          titleFromFilename(file.name, MAX_TITLE_LENGTH) || file.name;

        const outcome = await requestGeneration(token, {
          title,
          text: extraction.text,
          kinds: ["summary", "flashcards", "quiz"],
          flashcards: DEFAULT_FLASHCARDS,
          quizQuestions: DEFAULT_QUIZ_QUESTIONS,
          uploads: 1,
          sourceFormat: extraction.format,
          sourceUnits: extraction.unitCount,
        });

        if (!outcome.ok) {
          updateJob(job.id, { status: "error", message: outcome.message });
          continue;
        }

        const { studySet } = outcome.data;

        // Report any requested kind the document could not produce, so a
        // "success" that is missing its cards is explained rather than silent.
        // `exactOptionalPropertyTypes` is on, so the field is spread in only
        // when there is something to say.
        const note = missingKindsMessage(
          missingRequestedKinds(
            {
              summary: studySet.hasSummary ? studySet.summary : null,
              flashcards: studySet.flashcards,
              quizQuestions: studySet.quizQuestions,
            },
            ["summary", "flashcards", "quiz"],
          ),
        );

        updateJob(job.id, {
          status: "done",
          studySetId: studySet.id,
          title: studySet.title,
          flashcards: studySet.flashcards.length,
          quizQuestions: studySet.quizQuestions.length,
          hasSummary: studySet.hasSummary,
          ...(note ? { note } : {}),
        });
      }

      setBusy(false);
      // The sidebar's recent list and the dashboard panels reload from this.
      emitAppEvent(HISTORY_CHANGED);
    },
    [getIdToken, router, updateJob, user],
  );

  /** Opens the "more material" panel for a finished set. */
  const openMore = useCallback(
    async (studySetId: string) => {
      setError(null);

      const token = await getIdToken();
      if (!token) {
        if (!user) {
          router.push(`/login?next=${encodeURIComponent("/dashboard")}`);
        }
        setError("Duhet të hyni për të vazhduar me këtë veprim.");
        return;
      }

      const result = await fetchStudySet(token, studySetId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMoreFor(result.data.studySet);
    },
    [getIdToken, router, user],
  );

  // Practice panels use the same full regeneration experience as history and
  // completed upload rows, including the option selectors and file re-upload.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ studySetId?: unknown }>).detail;
      if (typeof detail?.studySetId !== "string") return;
      void openMore(detail.studySetId);
    };

    window.addEventListener(OPEN_MORE_MATERIAL, handler);
    return () => window.removeEventListener(OPEN_MORE_MATERIAL, handler);
  }, [openMore]);

  // --- Extra material view ------------------------------------------------
  if (moreFor) {
    return (
      <RegeneratePanel
        studySet={moreFor}
        onCancel={() => setMoreFor(null)}
        onDone={() => {
          setMoreFor(null);
          emitAppEvent(HISTORY_CHANGED);
        }}
      />
    );
  }

  const doneCount = jobs.filter((job) => job.status === "done").length;

  return (
    <Card id="ngarko" className="scroll-mt-6">
      {/*
        Two columns as in the design: what happens on the left, the target on
        the right, and a small badge cluster marking the accepted formats.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_auto] lg:items-center lg:gap-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">Ngarko materialin</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Formate të pranuara: {ACCEPTED_FORMATS_LABEL}. Për çdo dokument
            gjenerohen automatikisht përmbledhja, flashcards dhe kuizi.
          </p>
        </div>

        <DropZone
          onFiles={(files) => void runBatch(files)}
          disabled={busy}
          layout="inline"
          formatsLabel="PDF, DOCX, PPTX"
          sizeLabel={`(maks. ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB)`}
        />

        {/* Accepted-format badges. Purely informative, so hidden from readers. */}
        <div className="hidden lg:block" aria-hidden="true">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold leading-none text-stat-green">
              +
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger text-[9px] font-bold text-white">
              PDF
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stat-blue text-[11px] font-bold text-white">
              W
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stat-orange text-[11px] font-bold text-white">
              P
            </span>
          </div>
          <p className="mt-2 max-w-[8.5rem] text-[10px] leading-4 text-muted">
            Një material, gjuhë e ndryshme për të mësuar!
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {error ? <Alert>{error}</Alert> : null}

        {jobs.length > 0 ? (
          <ul className="divide-y divide-[var(--color-line)] rounded-xl border border-line">
            {jobs.map((job) => (
              <li key={job.id} className="flex items-start gap-3 px-3 py-3">
                <StatusDot status={job.status} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={job.filename}>
                    {job.title ?? job.filename}
                  </p>

                  <p
                    className={
                      job.status === "error"
                        ? "mt-0.5 text-xs text-danger"
                        : "mt-0.5 text-xs text-muted"
                    }
                  >
                    {job.status === "error"
                      ? (job.message ?? STATUS_LABELS.error)
                      : STATUS_LABELS[job.status]}
                  </p>

                  {job.status === "done" ? (
                    <p className="mt-0.5 text-xs text-muted">
                      {job.hasSummary ? "Përmbledhje · " : ""}
                      {job.flashcards ?? 0} flashcards ·{" "}
                      {job.quizQuestions ?? 0} pyetje kuizi
                    </p>
                  ) : null}

                  {/* Succeeded, but produced less than was asked for. */}
                  {job.status === "done" && job.note ? (
                    <p className="mt-1 text-xs leading-5 text-stat-orange">
                      {job.note}
                    </p>
                  ) : null}
                </div>

                {job.status === "done" && job.studySetId ? (
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/studim?id=${encodeURIComponent(job.studySetId)}`}
                    >
                      <Button variant="secondary" className="px-3 py-1.5">
                        Hap
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5"
                      onClick={() => void openMore(job.studySetId ?? "")}
                    >
                      Gjenero më shumë
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {doneCount > 0 && !busy ? (
          <p className="text-xs text-muted">
            {doneCount === 1
              ? "1 material u krijua dhe u ruajt."
              : `${doneCount} materiale u krijuan dhe u ruajtën.`}{" "}
            Gjenden te lista &ldquo;Të fundit&rdquo; në anën e majtë.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** Small coloured indicator for a job's state. */
function StatusDot({ status }: { status: JobStatus }) {
  const tone =
    status === "done"
      ? "bg-success"
      : status === "error"
        ? "bg-danger"
        : status === "queued"
          ? "bg-line-strong"
          : "bg-accent";

  return (
    <span
      aria-hidden="true"
      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone}`}
    />
  );
}
