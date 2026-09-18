/** POST /api/quiz-shares - creates an authenticated, read-only quiz link. */
import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/server/http/auth-guard";
import { ApiError } from "@/server/http/errors";
import { errorResponse } from "@/server/http/respond";
import { createQuizShare } from "@/server/services/quiz-shares";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);
    const body = (await request.json()) as { studySetId?: unknown };
    if (typeof body.studySetId !== "string" || body.studySetId.length === 0) {
      throw new ApiError("invalid_request", "Mungon materiali i kuizit.");
    }

    const share = await createQuizShare(decoded.uid, body.studySetId);
    if (!share) {
      throw new ApiError("not_found", "Kuizi nuk u gjet.");
    }

    return NextResponse.json({ token: share.token });
  } catch (error) {
    return errorResponse(error, "quiz-shares/create");
  }
}