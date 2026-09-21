/**
 * POST /api/billing/verify
 *
 * Called by the dashboard when the buyer returns from Whop. Asks Whop directly
 * whether this account has a paid membership, and applies it immediately —
 * instead of waiting for the webhook to arrive.
 *
 * This is what makes activation feel instant. The webhook remains the source of
 * truth; this only closes the gap between paying and the webhook landing.
 *
 * It can only GRANT, and only from a membership whose metadata names the
 * caller's OWN uid, so a forged request achieves nothing beyond claiming a plan
 * the caller has already paid for.
 */
import { NextResponse, type NextRequest } from "next/server";

import { claimSubscription } from "@/server/billing/claim";
import { requireUser } from "@/server/http/auth-guard";
import { errorResponse } from "@/server/http/respond";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);

    /*
     * Rate limited because each call reads from Whop. The buyer's dashboard
     * calls it once on return, and the client falls back to polling, so a
     * generous limit is still plenty while bounding a client that loops.
     */
    enforceRateLimit(
      "billing-verify",
      rateLimitIdentifier(decoded.uid, request),
      RATE_LIMITS.verify,
    );

    const result = await claimSubscription(decoded.uid, decoded.email ?? null);

    return NextResponse.json(result, {
      // Live billing state: never cached.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "billing/verify");
  }
}
