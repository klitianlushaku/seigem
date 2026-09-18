/**
 * Standard API error shape.
 *
 * `message` is always a safe, user-facing Albanian string. Internal details are
 * logged server-side and never returned, so secrets and stack traces cannot
 * leak through an API response.
 */

export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_request"
  | "file_too_large"
  | "unsupported_file_type"
  | "no_readable_text"
  | "quota_exceeded"
  | "ai_failed"
  | "ai_invalid_response"
  | "rate_limited"
  | "not_found"
  | "internal_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Safe Albanian message, suitable for direct display. */
    message: string;
  };
}

/** User-facing Albanian messages for each error code. */
export const API_ERROR_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  unauthenticated: "Duhet të hysh në llogari për të vazhduar.",
  forbidden: "Nuk ke leje për këtë veprim.",
  invalid_request: "Kërkesa nuk është e vlefshme.",
  file_too_large: "Skedari është shumë i madh.",
  unsupported_file_type: "Formati i skedarit nuk mbështetet.",
  no_readable_text:
    "Nuk u gjet tekst i lexueshëm. PDF-të e skanuara nuk mbështeten aktualisht.",
  quota_exceeded: "Ke arritur kufirin ditor të planit tënd.",
  ai_failed:
    "Gjenerimi dështoi. Provoni përsëri pas pak. Nuk u konsumua kuota.",
  ai_invalid_response: "Përgjigjja e modelit nuk ishte e vlefshme. Provoni përsëri.",
  rate_limited: "Shumë kërkesa. Provoni përsëri pas pak.",
  not_found: "Nuk u gjet.",
  internal_error: "Ndodhi një gabim i papritur. Provoni përsëri.",
};

/** HTTP status codes paired with each error code. */
const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  invalid_request: 400,
  file_too_large: 413,
  unsupported_file_type: 415,
  no_readable_text: 422,
  quota_exceeded: 429,
  ai_failed: 502,
  ai_invalid_response: 502,
  rate_limited: 429,
  not_found: 404,
  internal_error: 500,
};

/**
 * An error that is safe to serialize back to the client.
 * Anything else thrown inside a route handler becomes a generic 500.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message?: string) {
    const safeMessage = message ?? API_ERROR_MESSAGES[code];
    super(safeMessage);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }

  /** Serializes to the standard client-facing body. */
  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message } };
  }
}
