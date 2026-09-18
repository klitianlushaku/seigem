/**
 * Shared types for client-side document text extraction.
 *
 * Extraction is deterministic and local: it never calls DeepSeek or any other
 * AI model. File bytes stay in browser memory and are discarded as soon as
 * extraction finishes.
 */
import type { DocumentFormat } from "@/services/document/validate";

/** Outcome of an extraction attempt. */
export type ExtractionResult =
  | {
      ok: true;
      text: string;
      format: DocumentFormat;
      /** Number of pages (PDF), slides (PPTX), or 1 for DOCX. */
      unitCount: number;
      /** Non-fatal notes, e.g. "3 slides contained no text". */
      warnings: string[];
      /** True when the extracted text exceeds the server-side limit. */
      truncated: boolean;
    }
  | {
      ok: false;
      /** Albanian message safe to display directly. */
      message: string;
      /** Machine-readable reason, for logging and tests. */
      reason: ExtractionFailureReason;
    };

/** Why extraction failed. */
export type ExtractionFailureReason =
  | "empty_file"
  | "unsupported_format"
  | "corrupt_file"
  | "password_protected"
  | "no_selectable_text"
  | "too_large"
  | "unknown";

/** Helper for building a failure result. */
export function failure(
  reason: ExtractionFailureReason,
  message: string,
): ExtractionResult {
  return { ok: false, reason, message };
}
