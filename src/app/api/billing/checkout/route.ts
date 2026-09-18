/**
 * POST /api/billing/checkout
 *
 * Starts a Whop checkout for a paid plan.
 *
 * Security properties:
 *   - Requires a valid Firebase ID token, so only a signed-in user can start a
 *     checkout, and only for their own account.
 *   - The uid is embedded in the checkout configuration's METADATA, which Whop
 *     carries onto the resulting membership. The webhook still does not trust
 *     it blindly: it cross-checks against the stored subscription id.
 *   - This endpoint does NOT change the user's plan. Only a verified webhook
 *     can do that, so returning from checkout without paying grants nothing.
 *
 * It deliberately creates a checkout CONFIGURATION rather than linking to
 * `whop.com/checkout/?product=...`. A bare product link carries no account id,
 * so a purchase made through one could never be attributed to a user — the
 * customer would pay and receive nothing.
 */
import { NextResponse, type NextRequest } from "next/server";

import { PAID_PLAN_IDS, getPlan, type PlanId } from "@/config/plans";
import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";
import { createCheckoutConfiguration } from "@/server/billing/checkout";
import { requireUser } from "@/server/http/auth-guard";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";
import { errorResponse } from "@/server/http/respond";
import { ApiError } from "@/server/http/errors";
import { getUserPlan } from "@/server/services/users";

/**
 * Maps a plan to the Whop PLAN id used to open its checkout.
 *
 * These are `plan_...` ids, which are NOT the same as the `prod_...`/product
 * ids the webhook matches against: a product owns one or more plans, and the
 * checkout API takes a plan.
 */
function planIdFor(plan: PlanId): string | null {
  if (plan === "plus") return serverEnv.whopPlusPlanId;
  if (plan === "pro") return serverEnv.whopProPlanId;
  return null;
}

/** Validates that a value is a paid plan id. */
function isPaidPlan(value: unknown): value is PlanId {
  return (
    typeof value === "string" && PAID_PLAN_IDS.includes(value as PlanId)
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);

    enforceRateLimit(
      "checkout",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.checkout,
    );

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("invalid_request", "Kërkesa nuk është e vlefshme.");
    }

    const requested =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).plan
        : undefined;

    if (!isPaidPlan(requested)) {
      throw new ApiError(
        "invalid_request",
        "Zgjidh një plan të vlefshëm: Plus ose Pro.",
      );
    }

    const planId = planIdFor(requested);
    if (!planId) {
      // Misconfiguration, not user error. Refuse loudly: sending the buyer to a
      // checkout we cannot attribute would take their money and grant nothing.
      console.error(
        `[billing] no Whop PLAN id configured for "${requested}". ` +
          `Set WHOP_${requested.toUpperCase()}_PLAN_ID to the plan_... id ` +
          "(not the product id). Checkout is blocked until then.",
      );
      throw new ApiError(
        "internal_error",
        "Pagesat nuk janë konfiguruar ende. Provo përsëri më vonë.",
      );
    }

    const currentPlan = await getUserPlan(decoded.uid);

    const appUrl = publicEnv.appUrl;
    const redirectUrl = appUrl
      ? `${appUrl.replace(/\/+$/, "")}/dashboard?checkout=return`
      : null;

    const checkout = await createCheckoutConfiguration({
      planId,
      uid: decoded.uid,
      redirectUrl,
    });

    return NextResponse.json({
      plan: requested,
      planName: getPlan(requested).name,
      priceLabel: getPlan(requested).priceLabel,
      /** Where to send the browser to complete payment. */
      checkoutUrl: checkout.url,
      /** Whop's configuration id, useful when chasing a missing payment. */
      checkoutConfigurationId: checkout.id,
      currentPlan,
      /**
       * Explicit reminder that returning from checkout does NOT activate
       * anything. Activation happens only via a verified webhook.
       */
      activationNote:
        "Plani aktivizohet vetëm pasi Whop konfirmon pagesën përmes webhook-ut.",
    });
  } catch (error) {
    return errorResponse(error, "billing/checkout");
  }
}
