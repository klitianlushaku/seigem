/**
 * Application-level constants that are not plan-related.
 */

/** Product name. */
export const APP_NAME = "Seigem";

/** Default locale. The entire customer-facing UI is in Albanian. */
export const APP_LOCALE = "sq";

/**
 * Maximum accepted upload size, in bytes (25 MB).
 * Enforced in the browser before parsing and re-checked server-side.
 */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Accepted upload extensions, lowercase, including the dot. */
export const ACCEPTED_FILE_EXTENSIONS = [".pdf", ".docx", ".pptx"] as const;

/** Accepted upload extensions without the dot, for the `accept` attribute. */
export const ACCEPTED_FILE_EXTENSIONS_PLAIN = ACCEPTED_FILE_EXTENSIONS.map((ext) =>
  ext.slice(1),
);

/** Accepted MIME types, used for validation. */
export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

/**
 * Maximum number of characters of extracted text sent to DeepSeek.
 * Guards against runaway cost and oversized prompts.
 */
export const MAX_EXTRACTED_TEXT_CHARS = 60_000;

/** Albanian label for accepted formats, reused across the UI. */
export const ACCEPTED_FORMATS_LABEL = "PDF, Word ose PowerPoint";

/** Maximum length of a user-editable study-set title. */
export const MAX_TITLE_LENGTH = 120;
