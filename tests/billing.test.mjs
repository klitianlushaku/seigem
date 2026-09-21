/**
 * Whop webhook signature and billing-state tests.
 *
 * Run with:  npm run test:billing
 *
 * Signature verification is the sole gate that decides whether a user is
 * upgraded to a paid plan, so it is tested adversarially: valid signatures
 * must pass, and every tampering attempt must fail.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Webhook } from "standardwebhooks";

// The webhook module is server-only; load it with the guard neutralised.
const { loadModule } = await import("./helpers/load-server-module.mjs");
const { verifyWhopWebhook, signWhopPayload } =
  await loadModule("src/server/billing/webhook.ts");

const { createHmac } = await import("node:crypto");

/**
 * Signs exactly the way WHOP's BACKEND does.
 *
 * Whop signs `{webhook-id}.{webhook-timestamp}.{raw body}` with HMAC-SHA256,
 * using the LITERAL BYTES of the `ws_...` secret, and base64-encodes the digest.
 *
 * This is deliberately an independent implementation, written from Whop's
 * documented algorithm rather than through `standardwebhooks`. A sign/verify
 * round trip inside that library cannot detect a wrong key derivation, because
 * both sides would be wrong identically.
 *
 * @param secret    The raw `ws_...` secret.
 * @param messageId Value for the `webhook-id` header.
 * @param timestamp Unix seconds, as the header carries.
 * @param payload   The exact request body.
 */
function whopSignLikeBackend(secret, messageId, timestamp, payload) {
  const signed = `${messageId}.${timestamp}.${payload}`;
  return createHmac("sha256", secret).update(signed).digest("base64");
}

// The test secret must match what the loader injects into process.env.
//
// Whop's secret is base64-encoded (optionally `whsec_`-prefixed), and the
// verifier base64-decodes it before use. The shared signing helper must apply
// the SAME interpretation, which is why `signWhopPayload` is imported from the
// production module rather than constructing its own Webhook.
const TEST_SECRET = process.env.WHOP_WEBHOOK_SECRET;

/** Builds a validly-signed request using the production signing path. */
function signedRequest(body, options = {}) {
  const messageId = options.messageId ?? "msg_test_123";
  const timestamp = options.timestamp ?? new Date();
  const secret = options.secret ?? TEST_SECRET;

  const signature =
    secret === TEST_SECRET
      ? signWhopPayload(messageId, timestamp, body)
      : new Webhook(secret, { format: "raw" }).sign(messageId, timestamp, body);

  const headers = new Headers({
    "webhook-id": messageId,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  });

  return { headers, signature };
}

const PAYLOAD = JSON.stringify({
  action: "membership_activated",
  data: {
    id: "mem_abc",
    product_id: "prod_plus",
    status: "active",
  },
});

// ===========================================================================
// Compatibility with Whop's OWN signing algorithm
// ===========================================================================
describe("Whop backend signature algorithm", () => {
  /**
   * The failure this guards is silent and expensive.
   *
   * Whop signs with the LITERAL BYTES of its `ws_...` secret, but the
   * `standardwebhooks` library base64-DECODES whatever it is given. Passing the
   * secret through raw therefore derives a different key — and because `_` is
   * not a base64 character, the constructor throws
   * "Base64Coder: incorrect characters for decoding" before any request is
   * looked at. The endpoint answered 500 and NO webhook could ever be applied,
   * so a customer could pay and never receive their plan.
   *
   * A sign/verify round trip through the same library cannot catch that: both
   * sides would be wrong in the same way. These tests therefore compute the
   * signature with an INDEPENDENT implementation of Whop's documented
   * algorithm, using node:crypto directly.
   */
  const messageId = "msg_whop_compat";
  const timestamp = new Date();
  const unixSeconds = Math.floor(timestamp.getTime() / 1000);

  /** Builds headers carrying a raw Whop-style signature. */
  function backendSignedHeaders() {
    const signature = whopSignLikeBackend(
      TEST_SECRET,
      messageId,
      unixSeconds,
      PAYLOAD,
    );
    return new Headers({
      "webhook-id": messageId,
      "webhook-timestamp": String(unixSeconds),
      "webhook-signature": `v1,${signature}`,
    });
  }

  it("ACCEPTS a signature produced the way Whop's backend produces it", () => {
    const result = verifyWhopWebhook(PAYLOAD, backendSignedHeaders());
    assert.equal(
      result.ok,
      true,
      "a genuine Whop signature must verify; a failure here means " +
        "customers pay and never receive their plan",
    );
  });

  it("rejects that signature when the body is altered", () => {
    const result = verifyWhopWebhook(
      PAYLOAD.replace("prod_plus", "prod_pro"),
      backendSignedHeaders(),
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  });

  it("rejects a signature made with a different secret", () => {
    const signature = whopSignLikeBackend(
      "ws_0000000000000000000000000000000000000000000000000000000000000000",
      messageId,
      unixSeconds,
      PAYLOAD,
    );
    const headers = new Headers({
      "webhook-id": messageId,
      "webhook-timestamp": String(unixSeconds),
      "webhook-signature": `v1,${signature}`,
    });
    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, false);
  });

  it("the production signing helper agrees with the backend algorithm", () => {
    // Guards against the two drifting apart again.
    const ours = signWhopPayload(messageId, timestamp, PAYLOAD);
    const backend = whopSignLikeBackend(
      TEST_SECRET,
      messageId,
      unixSeconds,
      PAYLOAD,
    );
    assert.equal(ours.replace(/^v1,/, ""), backend);
  });

  it("a `ws_` prefixed secret is usable (it used to throw)", () => {
    // The library's base64 decoder rejects `_`, so this throws unless the
    // secret is encoded first.
    assert.doesNotThrow(() => {
      verifyWhopWebhook(PAYLOAD, backendSignedHeaders());
    });
  });
});

// ===========================================================================
// Valid signatures
// ===========================================================================

describe("valid webhook signatures", () => {
  it("accepts a correctly signed payload", () => {
    const { headers } = signedRequest(PAYLOAD);
    const result = verifyWhopWebhook(PAYLOAD, headers);

    assert.equal(result.ok, true, "a valid signature must be accepted");
    if (result.ok) {
      assert.equal(result.payload.action, "membership_activated");
    }
  });

  it("accepts the svix-* header aliases", () => {
    const timestamp = new Date();
    const messageId = "msg_alias";
    const signature = signWhopPayload(messageId, timestamp, PAYLOAD);

    const headers = new Headers({
      "svix-id": messageId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    });

    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, true);
  });

  it("handles a payload containing unicode", () => {
    const body = JSON.stringify({ note: "Përmirëso planin — çështje" });
    const { headers } = signedRequest(body);
    assert.equal(verifyWhopWebhook(body, headers).ok, true);
  });
});

// ===========================================================================
// Adversarial: tampering must be rejected
// ===========================================================================

describe("signature tampering is rejected", () => {
  it("rejects a modified body", () => {
    const { headers } = signedRequest(PAYLOAD);

    // Attacker swaps the product id to get Pro instead of Plus.
    const tampered = PAYLOAD.replace("prod_plus", "prod_pro");
    const result = verifyWhopWebhook(tampered, headers);

    assert.equal(result.ok, false, "body tampering must be rejected");
  });

  it("rejects a forged signature", () => {
    const { headers } = signedRequest(PAYLOAD);
    headers.set("webhook-signature", "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");

    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, false);
  });

  it("rejects a signature from the wrong secret", () => {
    const { headers } = signedRequest(PAYLOAD, {
      secret: "whsec_d3Jvbmctc2VjcmV0LWJhc2U2NC1lbmNvZGVkISE=",
    });
    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, false);
  });

  it("rejects a signature with the v1 version removed", () => {
    const timestamp = new Date();
    const raw = signWhopPayload("msg_test_123", timestamp, PAYLOAD);
    const bare = raw.split(",")[1];

    const headers = new Headers({
      "webhook-id": "msg_test_123",
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": bare,
    });

    assert.equal(
      verifyWhopWebhook(PAYLOAD, headers).ok,
      false,
      "the v1 prefix is part of the protocol",
    );
  });

  it("rejects an empty signature", () => {
    const { headers } = signedRequest(PAYLOAD);
    headers.set("webhook-signature", "");
    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, false);
  });

  it("rejects a signature over a different message id", () => {
    // Signature is bound to the id, so reusing one across messages fails.
    const timestamp = new Date();
    const signature = signWhopPayload("msg_other", timestamp, PAYLOAD);

    const headers = new Headers({
      "webhook-id": "msg_test_123",
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": signature,
    });

    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, false);
  });
});

// ===========================================================================
// Missing headers and replay protection
// ===========================================================================

describe("missing headers", () => {
  for (const missing of ["webhook-id", "webhook-timestamp", "webhook-signature"]) {
    it(`rejects a request missing ${missing}`, () => {
      const { headers } = signedRequest(PAYLOAD);
      headers.delete(missing);

      const result = verifyWhopWebhook(PAYLOAD, headers);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, 400);
    });
  }

  it("rejects a completely unsigned request", () => {
    const result = verifyWhopWebhook(PAYLOAD, new Headers());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });
});

describe("replay protection", () => {
  it("rejects a timestamp far in the past", () => {
    // Standard Webhooks allows 5 minutes of clock skew.
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const { headers } = signedRequest(PAYLOAD, { timestamp: old });

    const result = verifyWhopWebhook(PAYLOAD, headers);
    assert.equal(result.ok, false, "an hour-old webhook must not be accepted");
    if (!result.ok) assert.equal(result.status, 401);
  });

  it("rejects a timestamp far in the future", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const { headers } = signedRequest(PAYLOAD, { timestamp: future });
    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, false);
  });

  it("accepts a timestamp within the tolerance window", () => {
    const recent = new Date(Date.now() - 60 * 1000);
    const { headers } = signedRequest(PAYLOAD, { timestamp: recent });
    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, true);
  });

  it("rejects a non-numeric timestamp", () => {
    const { headers } = signedRequest(PAYLOAD);
    headers.set("webhook-timestamp", "not-a-number");
    assert.equal(verifyWhopWebhook(PAYLOAD, headers).ok, false);
  });
});

// ===========================================================================
// Source-level guarantees
// ===========================================================================

describe("billing security guarantees", () => {
  it("the webhook module is server-only", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/billing/webhook.ts", "utf8");
    assert.match(source, /import "server-only"/);
  });

  it("uses the official standardwebhooks library, not hand-rolled HMAC", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/billing/webhook.ts", "utf8");
    assert.match(source, /from "standardwebhooks"/);
    // Hand-rolling crypto.createHmac here would risk a non-constant-time compare.
    assert.doesNotMatch(source, /createHmac/);
  });

  it("reads the secret from serverEnv", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/billing/webhook.ts", "utf8");
    assert.match(source, /serverEnv\.whopWebhookSecret/);
    assert.doesNotMatch(source, /process\.env\.WHOP_WEBHOOK_SECRET/);
  });

  it("never exposes the secret in a returned reason", () => {
    const { headers } = signedRequest(PAYLOAD);
    headers.set("webhook-signature", "v1,bogus");
    const result = verifyWhopWebhook(PAYLOAD, headers);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.doesNotMatch(result.reason, /whsec_/);
      assert.doesNotMatch(result.reason, new RegExp(TEST_SECRET.slice(0, 12)));
    }
  });
});
