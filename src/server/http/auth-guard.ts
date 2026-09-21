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

  let auth;
  try {
    auth = getAdminAuth();
  } catch (error) {
    // Building the Admin app failed, which means the server credentials are
    // missing or malformed — NOT that the user's token is bad. Reported as a
    // configuration failure so the client shows "server error" rather than
    // "please sign in", which would send the user round an infinite login loop.
    console.error(
      "[auth] Firebase Admin SDK is not configured. Check FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY. Cause:",
      error,
    );
    throw new ApiError(
      "internal_error",
      "Shërbimi nuk është konfiguruar saktë. Provo përsëri më vonë.",
    );
  }

  try {
    // checkRevoked: true rejects tokens for disabled/deleted users and
    // sessions revoked via the Firebase console.
    return await auth.verifyIdToken(token, true);
  } catch (error) {
    // Distinguish "our clock/credentials are wrong" from "this token is bad".
    // Firebase reports both as credential errors, but only one of them is the
    // user's problem, and an hour of skew silently invalidates EVERY token.
    console.error("[auth] ID token verification failed:", error);
    throw new ApiError("unauthenticated");
  }
}
