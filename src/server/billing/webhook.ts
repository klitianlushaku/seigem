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

/**
 * Derives the signing key `standardwebhooks` needs from Whop's secret.
 *
 * THIS IS THE WHOLE TRICK, and getting it wrong silently breaks every webhook.
 *
 * Whop's backend signs with the LITERAL BYTES of the secret it issued
 * (`ws_<hex>`), but `standardwebhooks`' `Webhook` class base64-DECODES whatever
 * it is handed to derive its key. Passing the secret through unchanged therefore
 * derives the wrong key.
 *
 * Worse, a Whop secret does not even fail as a verification error: `_` is
 * outside the base64 alphabet, so the `Webhook` constructor throws
 *
 *   Base64Coder: incorrect characters for decoding
 *
 * before any request is examined. The endpoint then answers 500 and the customer
 * pays without ever being granted their plan.
 *
 * Base64-encoding the secret here cancels out the library's decode, leaving
 * exactly the bytes Whop signed with. The prefix is included, because Whop never
 * strips one. This mirrors `hmacKey` in Whop's own SDK (`@whop/sdk/helpers`)
 * verbatim, including the use of TextEncoder/btoa rather than Buffer.
 *
 * @param key The raw `ws_...` secret from the Whop dashboard.
 */
function hmacKey(key: string): string {
  const bytes = new TextEncoder().encode(key);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // `btoa` is available in Node 18+ and in edge runtimes alike.
  return btoa(binary);
}

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
    // The secret MUST go through `hmacKey` — see the note on that function.
    verifier = new Webhook(hmacKey(serverEnv.whopWebhookSecret));
  } catch (error) {
    // Reaching here means the secret is empty or otherwise unusable. A Whop
    // `ws_...` secret is valid input now that it is encoded, so this is a real
    // configuration fault rather than the base64 error it used to be.
    console.error(
      "[billing] WHOP_WEBHOOK_SECRET is missing or unusable. " +
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
 * — including `hmacKey` — so the test exercises the real code path rather than a
 * look-alike.
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
  const signer = new Webhook(hmacKey(serverEnv.whopWebhookSecret));
  return signer.sign(messageId, timestamp, payload);
}
