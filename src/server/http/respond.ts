/**
 * Shared helpers for API route handlers.
 *
 * Centralizes error-to-response conversion so every endpoint returns the same
 * shape and never leaks internal details.
 */
import "server-only";

import { NextResponse } from "next/server";

import { ApiError, API_ERROR_MESSAGES } from "@/server/http/errors";

/**
 * Converts any thrown value into a safe JSON error response.
 * Unknown errors become a generic 500 without stack traces or messages.
 */
export function errorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(error.toBody(), { status: error.status });
  }

  console.error(`[api] ${context} failed:`, error);
  return NextResponse.json(
    {
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internal_error,
      },
    },
    { status: 500 },
  );
}
