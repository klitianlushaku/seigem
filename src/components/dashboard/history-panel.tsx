"use client";

/**
 * History panel.
 *
 * Dashboard section listing the most recent saved study sets. Each row shows
 * the source format, its page or slide count, and when it was created, with an
 * "Hap" action that opens the study experience.
 *
 * The original document is never shown or offered as a download because it was
 * never stored.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ArrowRightIcon, FolderIcon } from "@/components/ui/icons";
import { Panel } from "@/components/dashboard/panel";
import { albanianDate, parseIsoDate } from "@/lib/utils/albanian-date";
import { unitLabel } from "@/lib/utils/display";
import type { StudySetSummary } from "@/services/history";

/** How many rows the dashboard shows before deferring to the full page. */
const MAX_ROWS = 5;

/** Tint per source format, so the file type reads at a glance. */
const FORMAT_CLASSES: Record<string, string> = {
  pdf: "bg-danger/10 text-danger",
  docx: "bg-accent/10 text-accent",
  pptx: "bg-stat-orange/10 text-stat-orange",
};

export function HistoryPanel({
  studySets,
  loading,
}: {
  studySets: StudySetSummary[];
  loading: boolean;
}) {
  const rows = studySets.slice(0, MAX_ROWS);

  return (
    <Panel
      id="materialet"
      icon={FolderIcon}
      tone="purple"
      title="Materialet e mia"
      subtitle="Materialet e fundit që ke studiuar."
      action={
        <Link
          href="/materialet"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Shiko të gjitha
          <ArrowRightIcon size={14} />
        </Link>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-sm text-muted">
          Duke lexuar materialet…
        </p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Nuk ke materiale të ruajtura ende. Ngarko një dokument për të
          filluar.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {rows.map((studySet) => (
            <li
              key={studySet.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FormatBadge format={studySet.sourceFormat} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={studySet.title}>
                    {studySet.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {describeSource(studySet)}
                  </p>
                </div>
              </div>

              <Link
                href={`/studim?id=${encodeURIComponent(studySet.id)}`}
                className="shrink-0"
              >
                <Button variant="secondary" className="px-3 py-1.5">
                  Hap
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Rounded format chip, e.g. a red "PDF" tile. */
function FormatBadge({ format }: { format: string | null }) {
  const label = (format ?? "").toUpperCase();

  return (
    <span
      className={[
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold",
        format ? (FORMAT_CLASSES[format] ?? "bg-surface-2 text-muted") : "bg-surface-2 text-muted",
      ].join(" ")}
    >
      {label || "DOC"}
    </span>
  );
}

/** Builds the "PDF · 24 faqe · 12 Mars 2025" meta line from what we stored. */
function describeSource(studySet: StudySetSummary): string {
  const parts: string[] = [];

  if (studySet.sourceFormat) parts.push(studySet.sourceFormat.toUpperCase());

  if (studySet.sourceUnits && studySet.sourceUnits > 0) {
    const format = studySet.sourceFormat;
    const label =
      format === "pdf" || format === "docx" || format === "pptx"
        ? unitLabel(format, studySet.sourceUnits)
        : "faqe";
    parts.push(`${studySet.sourceUnits} ${label}`);
  }

  parts.push(albanianDate(parseIsoDate(studySet.createdAt)));

  return parts.join(" · ");
}
