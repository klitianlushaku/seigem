"use client";

/**
 * Summary reading view.
 *
 * Renders a parsed summary as labelled sections — key points, the explanation,
 * and definitions — so a student can find what they need instead of reading
 * prose.
 *
 * Everything is rendered as React elements, never as raw HTML: model output is
 * untrusted, so every character stays text.
 */
import { useMemo, type ReactNode } from "react";

import {
  hasStructuredContent,
  parseSummary,
  type Definition,
  type ParsedSummary,
  type SummaryBlock,
} from "@/lib/summary";

/** Headings are styled by level, all within the dark theme. */
const HEADING_CLASSES: Record<1 | 2 | 3, string> = {
  1: "mt-6 text-lg font-semibold tracking-tight first:mt-0",
  2: "mt-5 text-base font-semibold tracking-tight first:mt-0",
  3: "mt-4 text-sm font-medium first:mt-0",
};

/** Renders one block. */
function Block({ block }: { block: SummaryBlock }) {
  if (block.kind === "heading") {
    const className = HEADING_CLASSES[block.level];
    if (block.level === 1) return <h2 className={className}>{block.text}</h2>;
    if (block.level === 2) return <h3 className={className}>{block.text}</h3>;
    return <h4 className={className}>{block.text}</h4>;
  }

  if (block.kind === "list") {
    const items = block.items.map((item, index) => (
      <li key={`${item}-${index}`} className="leading-6">
        {item}
      </li>
    ));

    return block.ordered ? (
      <ol className="ml-5 list-decimal space-y-1.5 text-sm">{items}</ol>
    ) : (
      <ul className="ml-5 list-disc space-y-1.5 text-sm">{items}</ul>
    );
  }

  return <p className="text-sm leading-6">{block.text}</p>;
}

/** A titled block with a small accent bar, used for each section. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-accent" />
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Numbered key points, so they are easy to reference while studying. */
function KeyPoints({ points }: { points: readonly string[] }) {
  return (
    <ol className="space-y-2">
      {points.map((point, index) => (
        <li key={`${point}-${index}`} className="flex gap-3 text-sm leading-6">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
            {index + 1}
          </span>
          <span className="min-w-0 break-words">{point}</span>
        </li>
      ))}
    </ol>
  );
}

/** Definition cards: term on top, explanation beneath. */
function Definitions({ definitions }: { definitions: readonly Definition[] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {definitions.map((definition, index) => (
        <div
          key={`${definition.term}-${index}`}
          className="rounded-lg border border-line bg-surface p-3"
        >
          <dt className="break-words text-sm font-medium text-accent">
            {definition.term}
          </dt>
          <dd className="mt-1 break-words text-xs leading-5 text-muted">
            {definition.explanation}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SummaryView({ summary }: { summary: string }) {
  const parsed: ParsedSummary = useMemo(() => parseSummary(summary), [summary]);

  if (!summary.trim()) {
    return <p className="text-sm text-muted">Përmbledhja është bosh.</p>;
  }

  const structured = hasStructuredContent(parsed);

  return (
    // `break-words` stops a long unbroken string overflowing on a phone.
    <article className="space-y-4 break-words">
      {parsed.keyPoints.length > 0 ? (
        <Section title="Pikat kryesore">
          <KeyPoints points={parsed.keyPoints} />
        </Section>
      ) : null}

      {parsed.definitions.length > 0 ? (
        <Section title="Definicione">
          <Definitions definitions={parsed.definitions} />
        </Section>
      ) : null}

      {parsed.pointsWithTerms.length > 0 ? (
        <Section title="Terma të tjerë">
          <Definitions definitions={parsed.pointsWithTerms} />
        </Section>
      ) : null}

      {parsed.groups.length > 0 ? (
        <Section title="Temat">
          <div className="space-y-4">
            {parsed.groups.map((group, index) => (
              <div key={`${group.heading}-${index}`}>
                <h4 className="text-sm font-medium">{group.heading}</h4>
                <ul className="mt-1.5 ml-5 list-disc space-y-1 text-sm">
                  {group.points.map((point, pointIndex) => (
                    <li
                      key={`${point}-${pointIndex}`}
                      className="leading-6 break-words"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* The remaining prose and headings, in document order. */}
      {parsed.blocks.length > 0 ? (
        <div className="space-y-3">
          {structured ? (
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span
                aria-hidden="true"
                className="h-3.5 w-1 rounded-full bg-accent"
              />
              Shpjegimi
            </h3>
          ) : null}
          {parsed.blocks.map((block, index) => (
            <Block key={`${block.kind}-${index}`} block={block} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
