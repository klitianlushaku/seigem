/**
 * POST /api/admin/users/[uid]
 *
 * Performs one privileged action on an account. Two actions are supported:
 *
 *   { action: "set_plan", plan: "free" | "plus" | "pro", days: number | null }
 *   { action: "cancel_subscription" }
 *
 * Both bypass billing, so this route is the most powerful in the application and
 * is guarded by `requireAdmin` — a verified Firebase token AND an allow-list
 * check. A non-admin receives 404, not 403.
 *
 * WHAT IS TRUSTED
 * ---------------
 * Only the admin's identity, and that only via their verified token. The target
 * uid comes from the path and is validated; the plan must be one of the three
 * known ids; the duration is bounded. Nothing from the body may name a target,
 * and nothing reaches Whop or Firestore unvalidated.
 */
import { NextResponse, type NextRequest } from "next/server";

import { isPlanId } from "@/config/plans";
import { cancelMembershipAtPeriodEnd } from "@/server/billing/manage-subscription";
import {
  markCancellationAtPeriodEnd,
} from "@/server/billing/subscriptions";
import { requireAdmin } from "@/server/http/admin-guard";
import { ApiError } from "@/server/http/errors";
import { errorResponse } from "@/server/http/respond";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";
import {
  recordAdminCancellation,
  setUserPlan,
  subscriptionIdFor,
} from "@/server/services/admin";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  try {
    const admin = await requireAdmin(request);

    // A dedicated bucket: generous enough for real admin work such as fixing
    // several accounts in a row, but still bounded in case a token is stolen.
    enforceRateLimit(
      "admin-mutation",
      rateLimitIdentifier(admin.uid, request),
      RATE_LIMITS.admin,
    );

    const { uid } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("invalid_request", "Kërkesa nuk është e vlefshme.");
    }

    const action =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).action
        : undefined;

    // --- Change the plan ----------------------------------------------------
    if (action === "set_plan") {
      const record = body as Record<string, unknown>;
      const plan = record.plan;

      if (!isPlanId(plan)) {
        throw new ApiError("invalid_request", "Plani i zgjedhur nuk është i vlefshëm.");
      }

      /*
       * `days` decides how long a paid grant lasts. Explicitly `null` means no
       * expiry, which is a permanent grant — legitimate for a comp, but it must
       * be chosen rather than defaulted into, because a paid plan with no expiry
       * never lapses.
       */
      const rawDays = record.days;
      const days =
        rawDays === null || rawDays === undefined
          ? null
          : typeof rawDays === "number"
            ? rawDays
            : Number.NaN;

      if (days !== null && !Number.isFinite(days)) {
        throw new ApiError("invalid_request", "Kohëzgjatja nuk është e vlefshme.");
      }

      await setUserPlan(
        { uid: admin.uid, email: admin.email ?? null },
        uid,
        plan,
        days,
      );

      return NextResponse.json({ ok: true, plan, days });
    }

    // --- Cancel the subscription -------------------------------------------
    if (action === "cancel_subscription") {
      const subscriptionId = await subscriptionIdFor(uid);
      if (!subscriptionId) {
        throw new ApiError(
          "invalid_request",
          "Kjo llogari nuk ka abonim të lidhur për anulim.",
        );
      }

      const result = await cancelMembershipAtPeriodEnd(subscriptionId);

      if (!result.cancelled) {
        // The same reasons the customer-facing endpoint distinguishes, so an
        // admin can tell "Whop refused" apart from "our key lacks permission".
        const message =
          result.failure === "unknown_membership"
            ? "Abonimi i ruajtur nuk ekziston në Whop."
            : result.failure === "forbidden"
              ? "Ky API key nuk mund të anulojë abonime."
              : "Whop nuk e pranoi anulimin.";
        throw new ApiError("internal_error", message);
      }

      /*
       * Access is kept until the period ends. This is the same rule the customer
       * -facing cancellation follows: cancelling stops the renewal, it does not
       * shorten what was paid for — and an admin must not be able to take away
       * paid time by pressing a different button.
       */
      await markCancellationAtPeriodEnd(uid, result.expiresAt);
      await recordAdminCancellation(
        { uid: admin.uid, email: admin.email ?? null },
        uid,
        subscriptionId,
        result.expiresAt,
      );

      return NextResponse.json({
        ok: true,
        cancelAtPeriodEnd: true,
        planExpiresAt: result.expiresAt?.toISOString() ?? null,
      });
    }

    throw new ApiError("invalid_request", "Veprimi i panjohur.");
  } catch (error) {
    return errorResponse(error, "admin/users/action");
  }
}
