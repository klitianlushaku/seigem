/**
 * Whop webhook signature verification (server-only).
 *
 * Whop signs webhooks using the Standard Webhooks specification, the same
 * scheme Svix uses. The signing algorithm is:
 *
 *     signedContent = `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *     signature     = base64(HMAC_SHA256(secret, signedContent))
 *     header        = `v1,${signature}`   (space-separated when multiple)
 *
 * The secret is the `WHOP_WEBHOOK_SECRET`, base64-encoded, optionally prefixed
 * with `whsec_`.
 *
 * Verification uses the official `standardwebhooks` package rather than a
 * hand-rolled HMAC comparison. That library performs a timing-safe comparison
 * and enforces a 5-minute timestamp tolerance, both of which are easy to get
 * subtly wrong — a non-constant-time compare leaks the signature, and no
 * tolerance check allows indefinite replay of a captured request.
 *
 * The RAW request body must be passed in: re-serializing parsed JSON changes
 * the bytes and invalidates the signature.
 */
import "server-only";

import { Webhook, WebhookVerificationError } from "standardwebhooks";

import { serverEnv } from "@/lib/env/server";

/** Header names Whop sends. The `svix-*` aliases are also accepted. */
const WEBHOOK_HEADERS = {
  id: ["webhook-id", "svix-id"],
  timestamp: ["webhook-timestamp", "svix-timestamp"],
  signature: ["webhook-signature", "svix-signature"],
} as const;

/** Result of verifying an incoming webhook. */
export type VerifyResult =
  | { ok: true; payload: unknown }
  | { ok: false; status: number; reason: string };

/** Finds the first present header from a list of candidates. */
function headerFrom(
  headers: Headers,
  candidates: readonly string[],
): string | null {
  for (const name of candidates) {
    const value = headers.get(name);
    if (value) return value;
  }
  return null;
}

/**
 * Verifies a Whop webhook request.
 *
 * @param rawBody The EXACT request body bytes, before any JSON parsing.
 * @param headers The incoming request headers.
 *
 * @returns `{ ok: true, payload }` with the parsed body when the signature is
 *   valid, otherwise `{ ok: false, status, reason }` with a status suitable for
 *   the response. `reason` is for server logs only and is never returned to the
 *   caller, so a probe cannot learn why verification failed.
 */
export function verifyWhopWebhook(
  rawBody: string,
  headers: Headers,
): VerifyResult {
  const id = headerFrom(headers, WEBHOOK_HEADERS.id);
  const timestamp = headerFrom(headers, WEBHOOK_HEADERS.timestamp);
  const signature = headerFrom(headers, WEBHOOK_HEADERS.signature);

  if (!id || !timestamp || !signature) {
    return { ok: false, status: 400, reason: "missing required webhook headers" };
  }

  let verifier: Webhook;
  try {
    verifier = new Webhook(serverEnv.whopWebhookSecret);
  } catch (error) {
    // A malformed secret is a configuration error, not a client error.
    //
    // The most common cause is a placeholder left in .env.local: the secret must
    // be the base64 value Whop issues (optionally `whsec_`-prefixed), not an
    // arbitrary string. This is logged loudly because every webhook will fail
    // until it is fixed.
    console.error(
      "[billing] WHOP_WEBHOOK_SECRET is not a valid base64 secret. " +
        "Copy the exact value from the Whop dashboard. Cause:",
      error,
    );
    return { ok: false, status: 500, reason: "webhook secret misconfigured" };
  }

  try {
    const payload = verifier.verify(rawBody, {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    });
    return { ok: true, payload };
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      // Covers a bad signature, a missing match, and timestamp skew.
      console.warn("[billing] webhook signature rejected:", error.message);
      return { ok: false, status: 401, reason: error.message };
    }

    console.error("[billing] unexpected verification failure:", error);
    return { ok: false, status: 401, reason: "verification failed" };
  }
}

/**
 * Signs a payload exactly the way Whop does.
 *
 * Used only by tests, to produce genuinely valid signatures without contacting
 * Whop. It deliberately constructs the verifier the same way verification does
 * — with the default (base64-decoded) secret interpretation — so the test
 * exercises the real code path rather than a look-alike. Signing with
 * `format: "raw"` would treat the secret as raw bytes and produce a signature
 * that the verifier correctly rejects.
 *
 * @param messageId  Value for the `webhook-id` header.
 * @param timestamp  Value for the `webhook-timestamp` header.
 * @param payload    The exact request body.
 */
export function signWhopPayload(
  messageId: string,
  timestamp: Date,
  payload: string,
): string {
  const signer = new Webhook(serverEnv.whopWebhookSecret);
  return signer.sign(messageId, timestamp, payload);
}
