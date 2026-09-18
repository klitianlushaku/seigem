/**
 * POST /api/generate
 *
 * Protected endpoint that turns extracted document text into a saved study set.
 *
 * Security properties:
 *   - Requires a valid Firebase ID token; the uid comes from the token, never
 *     from the request body.
 *   - Re-checks plan limits on the server; the frontend check is advisory only.
 *   - The DeepSeek API key never leaves the server.
 *   - Only the title and generated content are persisted — never the source text.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/server/http/auth-guard";
import { errorResponse } from "@/server/http/respond";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";
import { runGeneration } from "@/server/ai/generate";
import { getUserPlan } from "@/server/services/users";
import { getSubscriptionState } from "@/server/billing/subscriptions";
import { getRemainingUsage } from "@/server/services/usage";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Authenticate. The uid is trustworthy only because it comes from the
    //    verified token.
    const decoded = await requireUser(request);

    // 2. Rate limit BEFORE any expensive work. Keyed on the verified uid, so a
    //    client cannot escape the limit by changing a header.
    enforceRateLimit(
      "generate",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.generate,
    );

    // 3. Resolve the plan server-side. A client cannot claim to be Pro.
    const planId = await getUserPlan(decoded.uid);

    // 4. Parse the body. Read as JSON defensively: a malformed body must
    //    produce a clean 400, not an unhandled exception.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "Kërkesa nuk është e vlefshme." } },
        { status: 400 },
      );
    }

    // 5. Run the workflow.
    const outcome = await runGeneration(decoded.uid, planId, body);

    return NextResponse.json(
      {
        studySet: {
          id: outcome.studySet.id,
          title: outcome.studySet.title,
          hasSummary: outcome.studySet.hasSummary,
          hasFlashcards: outcome.studySet.hasFlashcards,
          hasQuiz: outcome.studySet.hasQuiz,
          summary: outcome.studySet.summary,
          flashcards: outcome.studySet.flashcards,
          quizQuestions: outcome.studySet.quizQuestions,
          sourceFormat: outcome.studySet.sourceFormat,
          sourceUnits: outcome.studySet.sourceUnits,
        },
        plan: planId,
        remaining: outcome.remaining,
        model: outcome.model,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "generate");
  }
}

/**
 * GET /api/generate
 *
 * Reports the caller's plan and remaining daily allowance so the dashboard can
 * show quota before a generation is attempted.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);
    const planId = await getUserPlan(decoded.uid);
    const remaining = await getRemainingUsage(decoded.uid, planId);
    const subscription = await getSubscriptionState(decoded.uid);

    return NextResponse.json({
      plan: planId,
      remaining,
      subscription: {
        planExpiresAt: subscription.planExpiresAt?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        hasSubscription: subscription.whopSubscriptionId !== null,
      },
    });
  } catch (error) {
    return errorResponse(error, "generate/quota");
  }
}
