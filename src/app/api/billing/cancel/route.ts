/** POST /api/billing/cancel - schedules the caller's Whop membership to end. */
import { NextResponse, type NextRequest } from "next/server";

import { cancelMembershipAtPeriodEnd } from "@/server/billing/manage-subscription";
import {
  clearSubscriptionLink,
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

    // Already scheduled: report the existing state rather than calling Whop again.
    if (state.cancelAtPeriodEnd) {
      return NextResponse.json({
        cancelAtPeriodEnd: true,
        planExpiresAt: state.planExpiresAt?.toISOString() ?? null,
        alreadyScheduled: true,
      });
    }

    const result = await cancelMembershipAtPeriodEnd(state.whopSubscriptionId);

    if (!result.cancelled) {
      switch (result.failure) {
        case "unknown_membership":
          /*
           * The stored membership id is not one Whop knows about. That happens
           * when a subscription was created outside the normal flow, or the link
           * was recorded by hand. Retrying can never succeed, so the stale link
           * is cleared: otherwise this account is offered a cancel button that
           * is guaranteed to fail every time.
           *
           * The PLAN IS NOT TOUCHED. Removing a subscription link must never
           * revoke access the customer may have paid for.
           */
          console.error(
            `[billing] stored membership ${state.whopSubscriptionId} is unknown ` +
              `to Whop for ${decoded.uid}; clearing the stale link`,
          );
          await clearSubscriptionLink(decoded.uid);
          throw new ApiError(
            "not_found",
            "Abonimi i ruajtur nuk u gjet në Whop. Lidhja u pastrua — kontakto mbështetjen që ta rregullojmë.",
          );

        case "forbidden":
          // Configuration fault: the API key cannot cancel.
          console.error(
            "[billing] the Whop API key cannot cancel memberships. It needs " +
              "the `membership:cancel` scope.",
          );
          throw new ApiError(
            "internal_error",
            "Anulimi nuk është konfiguruar ende. Kontakto mbështetjen.",
          );

        case "rejected":
          throw new ApiError(
            "internal_error",
            "Whop nuk e pranoi anulimin e këtij abonimi. Kontakto mbështetjen.",
          );

        default:
          throw new ApiError(
            "internal_error",
            "Nuk mund të lidhemi me Whop tani. Provo përsëri pas pak.",
          );
      }
    }

    /*
     * Cancelled. The period end is recorded when Whop reports one.
     *
     * A missing date is NOT an error: these memberships report
     * `current_period_end: null`, and requiring it previously turned a
     * successful cancellation into a reported failure that was never stored.
     */
    await markCancellationAtPeriodEnd(decoded.uid, result.expiresAt);

    return NextResponse.json({
      cancelAtPeriodEnd: true,
      planExpiresAt: result.expiresAt?.toISOString() ?? null,
      alreadyScheduled: false,
    });
  } catch (error) {
    return errorResponse(error, "billing/cancel");
  }
}
