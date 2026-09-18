/**
 * Server-side authentication guard.
 *
 * Every protected API route must call `requireUser` before doing any work.
 * The client is never trusted: we verify the Firebase ID token cryptographically
 * via the Admin SDK on every request.
 */
import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

import { ApiError } from "@/server/http/errors";
import { getAdminAuth } from "@/server/firebase/admin";

/** Extracts a bearer token from the Authorization header. */
function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;

  return token.trim() || null;
}

/**
 * Verifies the request's Firebase ID token and returns the decoded token.
 *
 * @throws {ApiError} `unauthenticated` when the token is missing, malformed,
 *   expired, or revoked. The message is safe to show to the user.
 */
export async function requireUser(request: NextRequest): Promise<DecodedIdToken> {
  const token = bearerToken(request);
  if (!token) {
    throw new ApiError("unauthenticated");
  }

  try {
    // checkRevoked: true rejects tokens for disabled/deleted users and
    // sessions revoked via the Firebase console.
    return await getAdminAuth().verifyIdToken(token, true);
  } catch (error) {
    // Log the real reason server-side; never surface it to the client.
    console.error("[auth] ID token verification failed:", error);
    throw new ApiError("unauthenticated");
  }
}
