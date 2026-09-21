/**
 * GET /api/admin/users
 *
 * Lists every account with its subscription state, for the admin panel.
 *
 * Gated by `requireAdmin`, which verifies the caller's Firebase token AND that
 * their uid is on the `ADMIN_UIDS` allow-list. A non-admin gets 404, not 403, so
 * the endpoint's existence is not confirmed to a prober.
 *
 * This is the most sensitive read in the app: it returns every customer's email
 * and subscription. It must never be reachable without the guard.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/server/http/admin-guard";
import { errorResponse } from "@/server/http/respond";
import {
  RATE_LIMITS,
  enforceRateLimit,
  rateLimitIdentifier,
} from "@/server/http/rate-limit";
import { listUsers } from "@/server/services/admin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await requireAdmin(request);

    enforceRateLimit(
      "admin",
      rateLimitIdentifier(admin.uid, request),
      RATE_LIMITS.admin,
    );

    const users = await listUsers();

    return NextResponse.json(
      { users },
      // Never cached: this is live account data behind an auth check.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "admin/users");
  }
}
