/**
 * Server-side admin guard.
 *
 * THE security boundary for the admin panel. Every admin route must call
 * `requireAdmin` before doing anything else, and the panel grants paid plans for
 * free — so this is the one place that decides who may do that.
 *
 * Two independent checks, both required:
 *
 *   1. A valid Firebase ID token, verified cryptographically (`requireUser`).
 *      Proves WHO the caller is.
 *   2. The resulting uid is on the `ADMIN_UIDS` allow-list. Proves they are
 *      ALLOWED to administer.
 *
 * Neither is sufficient alone: a valid token only proves you are some user, and
 * an allow-list is meaningless without knowing who is asking.
 *
 * A non-admin receives 404, not 403. A 403 would confirm the endpoint exists,
 * which tells an attacker there is something worth attacking. A 404 is the same
 * answer they would get for a route that does not exist.
 */
import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

import { isAdminUid } from "@/lib/env/server";
import { ApiError } from "@/server/http/errors";
import { requireUser } from "@/server/http/auth-guard";

/**
 * Verifies the caller is a signed-in admin.
 *
 * @throws {ApiError} `unauthenticated` when the token is missing or invalid, and
 *   `not_found` when the caller is signed in but not an admin.
 */
export async function requireAdmin(request: NextRequest): Promise<DecodedIdToken> {
  const decoded = await requireUser(request);

  if (!isAdminUid(decoded.uid)) {
    // Logged at warn with the uid, because an unexpected caller here is worth
    // seeing: it means someone found the endpoint and is probing it.
    console.warn(
      `[admin] non-admin uid ${decoded.uid} (${decoded.email ?? "no email"}) ` +
        "attempted an admin request",
    );
    throw new ApiError("not_found");
  }

  return decoded;
}
