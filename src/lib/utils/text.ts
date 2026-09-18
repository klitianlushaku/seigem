/**
 * Text normalization helpers.
 *
 * Used on extracted document text. These functions are pure and isomorphic.
 */

/**
 * Normalizes whitespace in extracted document text:
 *   - converts non-breaking spaces and other Unicode spaces to plain spaces
 *   - collapses runs of spaces and tabs
 *   - collapses three or more blank lines into a single blank line
 *   - trims each line
 *   - trims the overall result
 *
 * Does not alter word order or content.
 */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    // Unicode spaces (NBSP, en/em space, thin space, etc.) -> plain space.
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ")
    // Zero-width characters.
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    // Trailing whitespace per line.
    .replace(/[ \t]+$/gm, "")
    // Leading whitespace per line.
    .replace(/^[ \t]+/gm, "")
    // Runs of spaces/tabs inside a line.
    .replace(/[ \t]{2,}/g, " ")
    // Three or more newlines -> one blank line.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Normalizes a title derived from a filename or provided by the user.
 * Strips control characters, collapses whitespace, and truncates.
 */
export function normalizeTitle(input: string, maxLength: number): string {
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Derives a readable study-set title from an uploaded filename.
 * Example: "Biologji - Qeliza (2024).pdf" -> "Biologji - Qeliza (2024)"
 *
 * Filenames are UNTRUSTED input and may contain control characters, path
 * separators, or Unicode bidi overrides, so the result is passed through
 * `normalizeTitle`. Relying on a later sanitization step is not enough: this
 * value is displayed directly in the title field, and a raw NUL byte or a
 * right-to-left override would reach the DOM.
 *
 * @param maxLength Cap for the derived title.
 */
export function titleFromFilename(
  filename: string,
  maxLength: number,
): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  // Underscores and hyphens used as word separators read better as spaces.
  const spaced = withoutExtension.replace(/[_-]+/g, " ");
  return normalizeTitle(normalizeWhitespace(spaced), maxLength);
}
