/**
 * GET /api/admin/session
 *
 * Reports whether the caller is an admin, so the sidebar can show the link.
 *
 * Deliberately tiny and side-effect free. It reveals only the caller's own
 * status — never the admin list — so it is safe for any signed-in user to call.
 *
 * The UI check is a convenience, NOT the security boundary: every admin endpoint
 * independently calls `requireAdmin`, so hiding the link is cosmetic and the
 * server refuses regardless.
 */
import { NextResponse, type NextRequest } from "next/server";

import { isAdminUid } from "@/lib/env/server";
import { requireUser } from "@/server/http/auth-guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);
    return NextResponse.json(
      { isAdmin: isAdminUid(decoded.uid) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Signed out is simply "not an admin" here; there is nothing to protect.
    return NextResponse.json(
      { isAdmin: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
