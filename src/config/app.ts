/**
 * Application-level constants that are not plan-related.
 */

/** Product name. */
export const APP_NAME = "Seigem";

/** Default locale. The entire customer-facing UI is in Albanian. */
export const APP_LOCALE = "sq";

/**
 * Contact address shown on the legal pages and used for data requests.
 *
 * REPLACE THIS before going live. It must be a mailbox someone actually reads:
 * GDPR data requests and cancellation questions arrive here, and an unread
 * address is itself a compliance problem.
 */
export const SUPPORT_EMAIL = "support@seigem.app";

/**
 * Date the legal pages were last revised, in Albanian, shown to the reader.
 * Update it whenever the wording changes.
 */
export const LEGAL_LAST_UPDATED = "21 Shtator 2026";

/**
 * The merchant of record for payments.
 *
 * Whop sells on Seigem's behalf, so the payment terms are Whop's and their
 * name must appear in the terms. Whop's guidance requires this notice to be
 * visible at checkout, which is why it is also stated on the pricing page.
 */
export const MERCHANT_OF_RECORD = "Whop";

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
