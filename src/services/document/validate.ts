/**
 * Client-side file validation.
 *
 * Runs before any parsing so obviously invalid uploads are rejected cheaply
 * and with a clear Albanian message. The server re-validates in Task 15, so
 * this is a UX layer, not the security boundary.
 */
import {
  ACCEPTED_FILE_EXTENSIONS,
  ACCEPTED_FORMATS_LABEL,
  MAX_FILE_SIZE_BYTES,
} from "@/config/app";

/** The three document formats Seigem can extract text from. */
export type DocumentFormat = "pdf" | "docx" | "pptx";

/** Result of validating a user-selected file. */
export type ValidationResult =
  | { ok: true; format: DocumentFormat }
  | { ok: false; message: string };

/** Human-readable size, used in error messages. */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** Returns the lowercase extension including the dot, or "" when absent. */
export function fileExtension(filename: string): string {
  const index = filename.lastIndexOf(".");
  if (index <= 0) return "";
  return filename.slice(index).toLowerCase();
}

/**
 * Maps an extension to a format.
 * Returns null for anything not explicitly supported.
 */
export function formatFromExtension(filename: string): DocumentFormat | null {
  const extension = fileExtension(filename);
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx") return "docx";
  if (extension === ".pptx") return "pptx";
  return null;
}

/**
 * Validates a selected file.
 *
 * Checks, in order:
 *   1. size limit
 *   2. non-empty
 *   3. supported extension
 *   4. MIME type agreement (see below)
 *
 * On MIME types: browsers report them inconsistently — Office documents
 * sometimes arrive as `application/octet-stream` or with an empty type, so the
 * MIME check REJECTS only a positively wrong type rather than requiring an
 * exact match. The extension remains the primary signal, and the parsers fail
 * loudly on a file whose contents do not match its extension.
 */
export function validateFile(file: File): ValidationResult {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: `Skedari është shumë i madh (${formatBytes(file.size)}). Kufiri është ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, message: "Skedari është bosh." };
  }

  const format = formatFromExtension(file.name);
  if (!format) {
    const extension = fileExtension(file.name);
    return {
      ok: false,
      message: extension
        ? `Formati "${extension}" nuk mbështetet. Pranohen: ${ACCEPTED_FORMATS_LABEL}.`
        : `Skedari duhet të ketë një nga këto formate: ${ACCEPTED_FORMATS_LABEL}.`,
    };
  }

  // A declared type that clearly contradicts the extension is rejected.
  // Generic types are allowed through because they carry no information.
  const declared = file.type.trim().toLowerCase();
  if (declared && !isGenericMimeType(declared)) {
    const expected = MIME_TYPE_BY_FORMAT[format];
    if (declared !== expected) {
      return {
        ok: false,
        message: `Lloji i skedarit ("${declared}") nuk përputhet me shtesën "${fileExtension(file.name)}".`,
      };
    }
  }

  return { ok: true, format };
}

/**
 * MIME types that carry no information and must not be treated as a mismatch.
 * Browsers fall back to these when they cannot identify a file.
 */
const GENERIC_MIME_TYPES: readonly string[] = [
  "application/octet-stream",
  "binary/octet-stream",
  "application/unknown",
  "application/x-unknown",
];

function isGenericMimeType(mime: string): boolean {
  return GENERIC_MIME_TYPES.includes(mime);
}

/** The MIME type each supported format must declare. */
const MIME_TYPE_BY_FORMAT: Readonly<Record<DocumentFormat, string>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** The `accept` attribute value for a file input. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_FILE_EXTENSIONS.join(",");
