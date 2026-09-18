"use client";

/**
 * "Materialet e mia" — saved study-set history.
 *
 * Lists previously generated study sets, shows which resources each contains,
 * and opens one for reading. Also hosts the regeneration flow.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/card";
import { StudySetViewer } from "@/components/dashboard/study-set-viewer";
import { RegeneratePanel } from "@/components/dashboard/regenerate-panel";
import {
  deleteStudySet,
  fetchHistory,
  fetchStudySet,
  type StudySetDetail,
  type StudySetSummary,
} from "@/services/history";

/** Renders the resource chips for a history entry. */
function ResourceChips({ studySet }: { studySet: StudySetSummary }) {
  const chips: string[] = [];
  if (studySet.hasSummary) chips.push("Përmbledhje");
  if (studySet.hasFlashcards) {
    chips.push(`Flashcards (${studySet.flashcardCount})`);
  }
  if (studySet.hasQuiz) {
    chips.push(`Kuiz (${studySet.quizQuestionCount})`);
  }

  if (chips.length === 0) {
    return <span className="text-xs text-muted">Pa përmbajtje</span>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip}
          className="rounded border border-line-strong px-1.5 py-0.5 text-xs text-muted"
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}

export function StudySetHistory() {
  const { getIdToken } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<StudySetSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState<StudySetDetail | null>(null);
  const [regeneratingFor, setRegeneratingFor] = useState<StudySetDetail | null>(
    null,
  );

  /** Fetches the history list without touching component state. */
  const fetchItems = useCallback(async (): Promise<
    { ok: true; items: StudySetSummary[] } | { ok: false; message: string }
  > => {
    const token = await getIdToken();
    if (!token) {
      return { ok: false, message: "Sesioni ka skaduar. Hyr përsëri." };
    }

    const result = await fetchHistory(token);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, items: result.data.studySets };
  }, [getIdToken]);

  /**
   * Reloads the list and applies the result to state.
   *
   * Defined as a plain callback (not an effect body) so the state updates
   * happen in response to an event — the initial load, or an action — rather
   * than synchronously inside an effect, which React flags as a cascading
   * render.
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const outcome = await fetchItems();
    setLoading(false);

    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setItems(outcome.items);
  }, [fetchItems]);

  // Initial load. The async work happens in a microtask, so no state is set
  // synchronously during the effect.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const outcome = await fetchItems();
      if (cancelled) return;

      setLoading(false);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setItems(outcome.items);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchItems]);

  /** Opens one study set, loading its full content. */
  const openStudySet = useCallback(
    async (id: string) => {
      setError(null);

      const token = await getIdToken();
      if (!token) {
        setError("Sesioni ka skaduar. Hyr përsëri.");
        return;
      }

      const result = await fetchStudySet(token, id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(result.data.studySet);
    },
    [getIdToken],
  );

  /** Deletes a study set after confirmation. */
  const remove = useCallback(
    async (id: string, title: string) => {
      if (!window.confirm(`Të fshihet "${title}"? Ky veprim nuk kthehet.`)) {
        return;
      }

      const token = await getIdToken();
      if (!token) return;

      const result = await deleteStudySet(token, id);
      if (!result.ok) {
        setError(result.message);
        return;
      }

      if (open?.id === id) setOpen(null);
      if (regeneratingFor?.id === id) setRegeneratingFor(null);
      await refresh();
    },
    [getIdToken, refresh, open, regeneratingFor],
  );

  // --- Regeneration view -------------------------------------------------
  if (regeneratingFor) {
    return (
      <RegeneratePanel
        studySet={regeneratingFor}
        onCancel={() => setRegeneratingFor(null)}
        onDone={async (updated) => {
          setRegeneratingFor(null);
          setOpen(updated);
          await refresh();
        }}
      />
    );
  }

  // --- Single study set view ---------------------------------------------
  if (open) {
    return (
      <StudySetViewer
        studySet={open}
        onClose={() => setOpen(null)}
        onRequestMore={() => setRegeneratingFor(open)}
      />
    );
  }

  // --- History list -------------------------------------------------------
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Materialet e mia</h2>
        {items && items.length > 0 ? (
          <span className="text-xs text-muted">{items.length} materiale</span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-3 text-sm text-muted">Duke lexuar materialet…</p>
      ) : null}

      {!loading && items && items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Nuk ke materiale të ruajtura ende. Ngarko një dokument për të
          gjeneruar përmbledhje, flashcards ose kuiz.
        </p>
      ) : null}

      {!loading && items && items.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--color-line)]">
          {items.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={item.title}>
                    {item.title}
                  </p>
                  <div className="mt-1.5">
                    <ResourceChips studySet={item} />
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void openStudySet(item.id)}
                  >
                    Hap
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      // The study experience is a separate route so it can be
                      // linked to and revisited directly.
                      router.push(`/studim?id=${encodeURIComponent(item.id)}`);
                    }}
                  >
                    Studio
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void remove(item.id, item.title)}
                  >
                    Fshi
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
