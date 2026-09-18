/**
 * Summary structure.
 *
 * A summary is more useful when it is more than prose: students look for the
 * key points of a topic and the definitions of its terms. This module parses
 * AI summary text into that structure.
 *
 * The model is asked to emit a documented shape (see `@/server/ai/prompts`),
 * but its output is untrusted, so parsing is:
 *   - tolerant of formatting drift (headings, bullets, numbering, bold),
 *   - narrow about what counts as a definition, so appending another bullet is
 *     not mistaken for one,
 *   - safe by construction: it returns text, and rendering escapes it.
 *
 * Pure and dependency-free so it can be unit-tested directly.
 */

/** One block of readable summary content. */
export type SummaryBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string };

/** A term and its explanation. */
export interface Definition {
  term: string;
  explanation: string;
}

/** A heading with the points listed beneath it. */
export interface KeyPointGroup {
  heading: string;
  points: string[];
}

/** The parsed summary, in the order the sections appeared. */
export interface ParsedSummary {
  /** Standalone points from a "Pikat kryesore" section. */
  keyPoints: string[];
  /** Terms from a "Definicione"/"Fjalorth" section. */
  definitions: Definition[];
  /** Extra "term: explanation" bullets found among the key points. */
  pointsWithTerms: Definition[];
  /** Headings with their bullets, when the summary is organised by topic. */
  groups: KeyPointGroup[];
  /** Everything else, in document order. */
  blocks: SummaryBlock[];
  /** The bulleted paragraphs carrying the structured sections. */
  sections: { heading: string; blocks: SummaryBlock[] }[];
}

/** Matches a Markdown ATX heading: "# Title", "## Title", "### Title". */
const HEADING_PATTERN = /^(#{1,3})\s+(.+)$/;

/** Matches a bullet line: "- item", "* item", "• item". */
const BULLET_PATTERN = /^[-*•]\s+(.+)$/;

/** Matches a numbered line: "1. item", "2) item". */
const ORDERED_PATTERN = /^\d+[.)]\s+(.+)$/;

/**
 * Headings that introduce the key points of a topic.
 * Compared case-insensitively, with diacritics folded so both "Pikat kryesore"
 * and "Pikat Kryesore" match.
 */
const KEY_POINT_HEADINGS: readonly string[] = [
  "pikat kryesore",
  "pika kryesore",
  "konceptet kryesore",
  "konceptet kryesore",
  "permbledhje e shkurter",
  "idet kryesore",
];

/** Headings that introduce a glossary. */
const DEFINITION_HEADINGS: readonly string[] = [
  "definicione",
  "definicione",
  "definicionet",
  "definicione kryesore",
  "fjalorth",
  "termat kryesore",
  "konceptet dhe definicionet",
];

/** Folds Albanian diacritics so heading matching is accent-insensitive. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ë/g, "e")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strips Markdown emphasis and code ticks from a line. */
export function stripInlineMarkup(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(?!\s)(.+?)(?<!\s)\*/g, "$1$2")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .trim();
}

/** Minimum length of a usable explanation, in characters. */
const MIN_EXPLANATION_LENGTH = 8;

/**
 * Recognises a "term: explanation" bullet.
 *
 * Deliberately narrow, because promoting an ordinary bullet to a definition is
 * worse than missing one: a definition card implies the text IS a definition.
 * A term must be short, must not read as a sentence, and the explanation must
 * carry at least a few words.
 */
export function parseDefinition(line: string): Definition | null {
  const cleaned = stripInlineMarkup(line);

  // Prefer a bolded term, which is how glossaries are usually written.
  const bolded = line.match(/^\s*[-*•]?\s*\*\*(.+?)\*\*\s*[:—–-]\s*(.+)$/);
  if (bolded?.[1] && bolded[2]) {
    const term = stripInlineMarkup(bolded[1]);
    const explanation = stripInlineMarkup(bolded[2]);
    if (isPlausibleTerm(term) && isPlausibleExplanation(explanation)) {
      return { term, explanation };
    }
  }

  const colon = cleaned.match(/^(.{2,60}?)\s*[:—–]\s*(.+)$/);
  if (colon?.[1] && colon[2]) {
    const term = colon[1].trim();
    const explanation = colon[2].trim();
    if (isPlausibleTerm(term) && isPlausibleExplanation(explanation)) {
      return { term, explanation };
    }
  }

  return null;
}

/**
 * A term is short, has no sentence-ending punctuation, and is not a clause.
 *
 * The word-count ceiling is what rejects a full sentence: a real term is a
 * noun phrase of a few words, not a statement with a verb and an object.
 */
function isPlausibleTerm(term: string): boolean {
  if (term.length < 2 || term.length > 60) return false;
  if (/[.!?]$/.test(term)) return false;
  // A term has no internal sentence punctuation and is not a long clause.
  const words = term.split(/\s+/).filter(Boolean);
  return words.length <= 6;
}

/** An explanation must carry at least a few words to be worth showing. */
function isPlausibleExplanation(explanation: string): boolean {
  if (explanation.length < MIN_EXPLANATION_LENGTH) return false;
  return explanation.split(/\s+/).filter(Boolean).length >= 2;
}

/** True when a heading introduces the key points. */
function isKeyPointHeading(text: string): boolean {
  const folded = fold(text);
  return KEY_POINT_HEADINGS.some((candidate) => folded.includes(candidate));
}

/** True when a heading introduces definitions. */
function isDefinitionHeading(text: string): boolean {
  const folded = fold(text);
  return DEFINITION_HEADINGS.some((candidate) => folded.includes(candidate));
}

/**
 * Splits summary text into sections at each heading.
 *
 * Anything before the first heading becomes an untitled leading section, so no
 * content is ever dropped.
 */
export function splitSections(
  text: string,
): { heading: string; lines: string[] }[] {
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } = {
    heading: "",
    lines: [],
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const headingMatch = line.match(HEADING_PATTERN);

    if (headingMatch?.[2]) {
      sections.push(current);
      current = { heading: stripInlineMarkup(headingMatch[2]), lines: [] };
      continue;
    }

    current.lines.push(rawLine);
  }

  sections.push(current);
  return sections.filter(
    (section) => section.heading !== "" || section.lines.some((l) => l.trim()),
  );
}

/**
 * Parses loose lines into display blocks.
 *
 * Exported alongside {@link parseSummaryText} because callers sometimes have
 * lines rather than a whole document.
 */
export function parseBlocks(lines: string[]): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  let pending: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (pending && pending.items.length > 0) {
      blocks.push({ kind: "list", ordered: pending.ordered, items: pending.items });
    }
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flush();
      continue;
    }

    const headingMatch = line.match(HEADING_PATTERN);
    if (headingMatch?.[2]) {
      flush();
      const hashes = headingMatch[1] ?? "#";
      blocks.push({
        kind: "heading",
        level: Math.min(hashes.length, 3) as 1 | 2 | 3,
        text: stripInlineMarkup(headingMatch[2]),
      });
      continue;
    }

    const bullet = line.match(BULLET_PATTERN);
    if (bullet?.[1]) {
      if (pending && pending.ordered) flush();
      pending ??= { ordered: false, items: [] };
      pending.items.push(stripInlineMarkup(bullet[1]));
      continue;
    }

    const ordered = line.match(ORDERED_PATTERN);
    if (ordered?.[1]) {
      if (pending && !pending.ordered) flush();
      pending ??= { ordered: true, items: [] };
      pending.items.push(stripInlineMarkup(ordered[1]));
      continue;
    }

    flush();
    blocks.push({ kind: "paragraph", text: stripInlineMarkup(line) });
  }

  flush();
  return blocks;
}

/**
 * Collects candidate lines from a section.
 *
 * Both bulleted items AND plain paragraphs are returned. That matters for
 * glossaries: a model commonly writes a definition either as a bullet
 * ("- **Termi** — shpjegim") or as a bare line ("**Termi** — shpjegim"), and
 * only the first form produces a list block. Reading paragraphs too means both
 * shapes are recognised.
 */
function candidatesFrom(blocks: SummaryBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.kind === "list") return block.items;
    if (block.kind === "paragraph") return [block.text];
    return [];
  });
}

/** Extracts only the bulleted items, used for key points and topic groups. */
function bulletsFrom(blocks: SummaryBlock[]): string[] {
  return blocks
    .filter(
      (block): block is Extract<SummaryBlock, { kind: "list" }> =>
        block.kind === "list",
    )
    .flatMap((block) => block.items);
}

/**
 * Parses a full summary.
 *
 * Section names are matched case- and accent-insensitively and are also
 * detected when they arrive as bold text rather than a heading, because models
 * are inconsistent about that.
 */
export function parseSummary(text: string): ParsedSummary {
  const result: ParsedSummary = {
    keyPoints: [],
    definitions: [],
    pointsWithTerms: [],
    groups: [],
    blocks: [],
    sections: [],
  };

  if (!text.trim()) return result;

  for (const section of splitSections(text)) {
    const blocks = parseBlocks(section.lines);
    result.sections.push({ heading: section.heading, blocks });

    // Also treat a *bold first line* as a heading, which models often emit
    // instead of a real Markdown heading.
    const boldHeading = section.heading
      ? null
      : blocks[0]?.kind === "paragraph"
        ? matchBoldHeading(blocks[0].text)
        : null;

    const effectiveHeading = section.heading || boldHeading || "";

    if (isDefinitionHeading(effectiveHeading)) {
      // Uses `candidatesFrom`, not `bulletsFrom`: definitions may arrive as
      // bullets or as bare bold lines, and only bullets form list blocks.
      for (const candidate of candidatesFrom(blocks)) {
        const definition = parseDefinition(candidate);
        // A line that is not a definition is still shown, so a miscategorised
        // sentence is never silently dropped.
        if (definition) result.definitions.push(definition);
        else if (candidate.trim()) result.blocks.push({ kind: "paragraph", text: candidate });
      }
      continue;
    }

    if (isKeyPointHeading(effectiveHeading)) {
      for (const bullet of bulletsFrom(blocks)) {
        const definition = parseDefinition(bullet);
        if (definition) {
          // A glossary-style bullet inside the key points is still a term.
          result.pointsWithTerms.push(definition);
        } else {
          result.keyPoints.push(bullet);
        }
      }
      continue;
    }

    // An untitled opening section that is entirely bullets is the key points
    // list in practice, so it is promoted rather than shown twice.
    if (!effectiveHeading && result.sections.length === 1) {
      const bullets = bulletsFrom(blocks);
      if (bullets.length > 0) {
        for (const bullet of bullets) {
          const definition = parseDefinition(bullet);
          if (definition) result.pointsWithTerms.push(definition);
          else result.keyPoints.push(bullet);
        }
        continue;
      }
    }

    // A titled section with bullets becomes a topic group. Any prose that came
    // with it is kept as well: returning early here would silently drop it.
    if (effectiveHeading) {
      const bullets = bulletsFrom(blocks);
      const prose = blocks.filter(
        (block) => block.kind === "paragraph" || block.kind === "heading",
      );

      if (bullets.length >= 2) {
        result.groups.push({ heading: effectiveHeading, points: bullets });
        result.blocks.push(...prose);
        continue;
      }
    }

    result.blocks.push(...blocks);
  }

  return result;
}

/** Matches a paragraph that is entirely bold, e.g. "**Pikat kryesore**". */
function matchBoldHeading(text: string): string | null {
  const match = text.match(/^\*\*(.+?)\*\*:?$/);
  return match?.[1] ? match[1].trim() : null;
}

/** True when a parsed summary carries any structured section. */
export function hasStructuredContent(parsed: ParsedSummary): boolean {
  return (
    parsed.keyPoints.length > 0 ||
    parsed.definitions.length > 0 ||
    parsed.pointsWithTerms.length > 0 ||
    parsed.groups.length > 0
  );
}

/**
 * Parses summary TEXT into display blocks.
 *
 * Convenience wrapper for callers that hold the raw string rather than lines.
 * Note that a bold first line is treated as a heading (models often emit
 * `**Pikat kryesore**` instead of a real Markdown heading), so the block list
 * may contain a heading the raw text did not.
 */
export function parseSummaryText(text: string): SummaryBlock[] {
  return parseBlocks(text.split("\n"));
}
