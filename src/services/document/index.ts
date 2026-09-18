/**
 * Document text extraction entry point.
 *
 * Dispatches to the right parser, normalizes the result, and enforces the
 * character limit that protects the AI endpoint.
 *
 * Privacy properties:
 *   - Parsing happens entirely in the browser; the file is never uploaded.
 *   - The `File` reference is released by the caller once extraction finishes
 *     (see `disposeFile`).
 *   - Extracted text lives only in component state and is cleared after
 *     generation; it is never written to Firestore.
 */
import { MAX_EXTRACTED_TEXT_CHARS } from "@/config/app";
import { normalizeWhitespace } from "@/lib/utils/text";

import { extractDocx } from "@/services/document/extract-docx";
import { extractPdf } from "@/services/document/extract-pdf";
import { extractPptx } from "@/services/document/extract-pptx";
import { failure, type ExtractionResult } from "@/services/document/types";
import { formatFromExtension, type DocumentFormat } from "@/services/document/validate";

/**
 * Extracts normalized plain text from a supported document.
 *
 * @param file The user-selected file. Read from memory only.
 */
export async function extractTextFromFile(file: File): Promise<ExtractionResult> {
  const format = formatFromExtension(file.name);

  if (!format) {
    return failure(
      "unsupported_format",
      "Formati i skedarit nuk mbështetet. Pranohen PDF, Word ose PowerPoint.",
    );
  }

  const raw = await runExtractor(format, file);
  if (!raw.ok) return raw;

  // Normalize only after the parser has produced text, so parser-specific
  // whitespace handling is not disturbed.
  const normalized = normalizeWhitespace(raw.text);

  if (!normalized) {
    return failure(
      "no_selectable_text",
      "Nuk u gjet tekst i lexueshëm në këtë dokument.",
    );
  }

  // Cap the text sent to the server. The UI tells the user when this happens
  // rather than silently dropping content.
  const truncated = normalized.length > MAX_EXTRACTED_TEXT_CHARS;
  const text = truncated
    ? normalized.slice(0, MAX_EXTRACTED_TEXT_CHARS)
    : normalized;

  const warnings = [...raw.warnings];
  if (truncated) {
    warnings.push(
      `Teksti ishte shumë i gjatë dhe u kufizua në ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString("sq-AL")} karaktere.`,
    );
  }

  return {
    ok: true,
    text,
    format: raw.format,
    unitCount: raw.unitCount,
    warnings,
    truncated,
  };
}

/** Runs the parser for a specific format. */
function runExtractor(
  format: DocumentFormat,
  file: File,
): Promise<ExtractionResult> {
  switch (format) {
    case "pdf":
      return extractPdf(file);
    case "docx":
      return extractDocx(file);
    case "pptx":
      return extractPptx(file);
  }
}

/**
 * Revokes an object URL created for a file preview.
 *
 * Extraction itself never creates object URLs, but a preview feature might. Any
 * code that calls `URL.createObjectURL` MUST call this when the preview is
 * torn down, otherwise the blob stays alive for the lifetime of the document.
 */
export function revokeFilePreview(url: string | null): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Revoking an already-revoked or invalid URL is harmless.
  }
}

/**
 * Clears a mutable holder so file bytes become unreachable.
 *
 * JavaScript has no deterministic free, but dropping every reference lets the
 * browser reclaim the memory on the next garbage collection. Calling this as
 * soon as extraction finishes minimises the window in which file bytes remain
 * reachable from application state.
 *
 * A `WeakRef` is used rather than a plain null-assignment so the caller cannot
 * accidentally keep the value alive through a stale closure.
 */
export class FileHolder {
  private file: WeakRef<File> | null = null;
  private bytes: ArrayBuffer | null = null;

  set(file: File, buffer?: ArrayBuffer): void {
    this.clear();
    this.file = new WeakRef(file);
    this.bytes = buffer ?? null;
  }

  get(): File | null {
    return this.file?.deref() ?? null;
  }

  /** Drops all references so the file and its bytes can be collected. */
  clear(): void {
    this.file = null;
    if (this.bytes) {
      // Overwrite is not possible for a detached ArrayBuffer, so simply drop
      // the reference; the allocation becomes unreachable.
      this.bytes = null;
    }
  }

  get disposed(): boolean {
    return this.file === null && this.bytes === null;
  }
}
