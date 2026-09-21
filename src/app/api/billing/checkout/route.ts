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

import {
  DEFAULT_PLAN_ID,
  PAID_PLAN_IDS,
  getPlan,
  type PlanId,
} from "@/config/plans";
import { safeRedirectUrl } from "@/lib/billing";
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

/**
 * Builds the post-checkout redirect, or null when no usable URL exists.
 *
 * The REQUEST's own origin is preferred over `NEXT_PUBLIC_APP_URL`, because it
 * is always correct for the deployment actually serving the user. The env var
 * is only a fallback, and it is not trustworthy: it is inlined at BUILD time,
 * so a missing or stale value ships a wrong URL forever. That is exactly what
 * happened — production sent `http://localhost:3000`, and Whop rejected the
 * checkout with HTTP 400 "The redirect URL must be a valid URL, starting with
 * https://", which blocked every sale.
 *
 * `safeRedirectUrl` returns null for anything not usable (a non-https URL, or a
 * malformed one), in which case Whop uses its own post-purchase page. The
 * customer can still pay, and the webhook still grants the plan — losing a
 * cosmetic redirect is a far better outcome than losing the sale.
 */
function postCheckoutRedirect(request: NextRequest): string | null {
  const fromRequest = safeRedirectUrl(
    `${request.nextUrl.origin}/dashboard?checkout=return`,
  );
  if (fromRequest) return fromRequest;

  // Fall back to the configured URL, which is the only option in some
  // proxy setups where the origin is not the public one.
  return safeRedirectUrl(
    `${publicEnv.appUrl.replace(/\/+$/, "")}/dashboard?checkout=return`,
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

    /*
     * Refuse to sell a plan to someone who already has one.
     *
     * This endpoint creates a NEW Whop checkout configuration, and a completed
     * checkout becomes a NEW subscription. Nothing in this flow replaces an
     * existing one, so allowing a purchase while a paid plan is active would
     * bill the customer TWICE: two memberships, two recurring charges, and only
     * one plan recorded against their account.
     *
     * The check is server-side on purpose. A client-side guard is presentation;
     * this is the boundary that decides whether money moves.
     *
     * Note this uses `getUserPlan`, which applies the expiry check, so a lapsed
     * subscription reads as free and its owner can subscribe again normally.
     */
    if (currentPlan !== DEFAULT_PLAN_ID) {
      const activeName = getPlan(currentPlan).name;
      console.warn(
        `[billing] refused a second checkout for ${decoded.uid}: ` +
          `already on "${currentPlan}"`,
      );
      throw new ApiError(
        "invalid_request",
        `Ke tashmë planin ${activeName} aktiv. Anulo abonimin aktual përpara se të kalosh në një plan tjetër.`,
      );
    }

    const redirectUrl = postCheckoutRedirect(request);

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
