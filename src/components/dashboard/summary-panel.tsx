"use client";

/**
 * Summary panel.
 *
 * Dashboard section showing the latest summary. The text is clamped so the
 * panel keeps a predictable height, with an inline toggle to read the rest —
 * no navigation needed to skim the key points.
 *
 * The summary is rendered as React elements, never as raw HTML.
 */
import { useState } from "react";
import Link from "next/link";

import { ArrowRightIcon, DocumentIcon } from "@/components/ui/icons";
import { Panel } from "@/components/dashboard/panel";
import { SummaryView } from "@/components/study/summary-view";

export function SummaryPanel({
  summary,
  studySetId,
}: {
  summary: string | null;
  studySetId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasSummary = Boolean(summary && summary.trim());

  return (
    <Panel
      id="permbledhje"
      icon={DocumentIcon}
      tone="blue"
      title="Përmbledhje"
      subtitle="Pika kryesore nga materialet e tua."
      action={
        studySetId ? (
          <Link
            href={`/studim?id=${encodeURIComponent(studySetId)}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Shiko më shumë
            <ArrowRightIcon size={14} />
          </Link>
        ) : null
      }
    >
      {!hasSummary ? (
        <p className="py-10 text-center text-sm text-muted">
          Nuk ka përmbledhje të ruajtur. Ngarko një dokument për të gjeneruar
          një përmbledhje.
        </p>
      ) : (
        <div className="rounded-xl border border-line bg-accent/5 p-4">
          <div
            className={
              expanded ? "" : "max-h-56 overflow-hidden"
            }
          >
            <SummaryView summary={summary ?? ""} />
          </div>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-3 text-xs font-medium text-accent hover:underline"
          >
            {expanded ? "Shfaq më pak" : "Shfaq të gjithë përmbledhjen"}
          </button>
        </div>
      )}
    </Panel>
  );
}
