/** POST /api/billing/cancel - schedules the caller's Whop membership to end. */
import { NextResponse, type NextRequest } from "next/server";

import { cancelMembershipAtPeriodEnd } from "@/server/billing/manage-subscription";
import {
  getSubscriptionState,
  markCancellationAtPeriodEnd,
} from "@/server/billing/subscriptions";
import { requireUser } from "@/server/http/auth-guard";
import { ApiError } from "@/server/http/errors";
import { errorResponse } from "@/server/http/respond";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);
    enforceRateLimit(
      "billing-cancel",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.checkout,
    );
    const state = await getSubscriptionState(decoded.uid);

    if (!state.whopSubscriptionId) {
      throw new ApiError("invalid_request", "Nuk ka një abonim aktiv për anulim.");
    }

    if (state.cancelAtPeriodEnd && state.planExpiresAt) {
      return NextResponse.json({
        cancelAtPeriodEnd: true,
        planExpiresAt: state.planExpiresAt.toISOString(),
      });
    }

    const cancellation = await cancelMembershipAtPeriodEnd(
      state.whopSubscriptionId,
    );
    const planExpiresAt = cancellation.expiresAt ?? state.planExpiresAt;
    if (!planExpiresAt) {
      throw new ApiError(
        "internal_error",
        "Nuk mundëm të gjejmë fundin e periudhës së abonimit.",
      );
    }
    await markCancellationAtPeriodEnd(decoded.uid, planExpiresAt);

    return NextResponse.json({
      cancelAtPeriodEnd: true,
      planExpiresAt: planExpiresAt.toISOString(),
    });
  } catch (error) {
    return errorResponse(error, "billing/cancel");
  }
}