/**
 * /api/study-time
 *
 * Tracks how long the user has actively studied today.
 *
 *   GET  -> today's total
 *   POST -> add an elapsed-time increment, returns the new total
 *
 * The client never sets an absolute value, only reports elapsed seconds, and
 * the server clamps and totals them. Firestore rules already prevent the client
 * from writing the field directly, so the counter stays trustworthy.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/server/http/auth-guard";
import { errorResponse } from "@/server/http/respond";
import { ApiError } from "@/server/http/errors";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";
import {
  MAX_REPORT_SECONDS,
  addStudyTime,
  getStudyTime,
} from "@/server/services/study-time";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);
    enforceRateLimit(
      "history",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.history,
    );

    const studyTime = await getStudyTime(decoded.uid);
    return NextResponse.json({ studyTime });
  } catch (error) {
    return errorResponse(error, "study-time/read");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);
    enforceRateLimit(
      "history",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.history,
    );

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("invalid_request", "Kërkesa nuk është e vlefshme.");
    }

    const seconds =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).seconds
        : undefined;

    if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
      throw new ApiError(
        "invalid_request",
        "Kohëzgjatja duhet të jetë numër sekondash.",
      );
    }

    // The service clamps to [1, MAX_REPORT_SECONDS]; the bound is documented in
    // the response so the client can align its flush interval.
    const studyTime = await addStudyTime(decoded.uid, seconds);

    return NextResponse.json({ studyTime, maxReportSeconds: MAX_REPORT_SECONDS });
  } catch (error) {
    return errorResponse(error, "study-time/write");
  }
}
