/**
 * Display helpers for document metadata.
 *
 * Kept free of JSX so these pure functions can be unit-tested directly under
 * Node without a JSX transform.
 */
import type { DocumentFormat } from "@/services/document/validate";

/** Human-readable file size. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Rough word count for display only.
 * Counts Unicode letter/number runs, so Albanian diacritics count correctly.
 */
export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.length : 0;
}

/** Albanian singular/plural unit labels per format. */
export const UNIT_LABELS: Record<DocumentFormat, [string, string]> = {
  pdf: ["faqe", "faqe"],
  docx: ["seksion", "seksione"],
  pptx: ["slide", "slides"],
};

/** Returns the correctly inflected unit label for a format and count. */
export function unitLabel(format: DocumentFormat, count: number): string {
  const [singular, plural] = UNIT_LABELS[format];
  return count === 1 ? singular : plural;
}
