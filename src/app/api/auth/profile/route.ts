/**
 * POST /api/auth/profile
 *
 * Called by the client immediately after a successful Firebase sign-in.
 * Verifies the ID token, then creates the user profile on first login or
 * returns the existing one.
 *
 * This endpoint never accepts a uid from the request body — the uid always
 * comes from the verified token.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/server/http/auth-guard";
import { errorResponse } from "@/server/http/respond";
import { ensureUserProfile } from "@/server/services/users";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const decoded = await requireUser(request);
    const { profile, created } = await ensureUserProfile(decoded);

    return NextResponse.json(
      { profile, created },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error, "auth/profile");
  }
}
