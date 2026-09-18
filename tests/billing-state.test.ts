/**
 * Billing state tests.
 *
 * Run with:  npm run test:billing-state
 *
 * Covers the pure entitlement logic: which subscription states grant a paid
 * plan, and which remove it. These transitions are pure functions precisely so
 * cancellation, expiration, and revocation can be tested without Whop.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  absoluteCheckoutUrl,
  buildCheckoutConfigurationBody,
  classifyEvent,
  coercePlan,
  parseDate,
  readSubscription,
  resolveEntitlement,
} from "../src/lib/billing.ts";

/** Product mapping mirroring the real one, for deterministic tests. */
function planForProduct(productId: string) {
  if (productId === "prod_plus") return "plus";
  if (productId === "prod_pro") return "pro";
  return "free";
}

/** Builds a snapshot with sensible defaults. */
function snapshot(overrides = {}) {
  return {
    subscriptionId: "mem_1",
    productId: "prod_plus",
    status: "active",
    expiresAt: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

const NOW = new Date("2026-03-10T12:00:00Z");

// ===========================================================================
// Activation
// ===========================================================================

describe("subscription activation", () => {
  it("grants Plus for the Plus product", () => {
    const effect = resolveEntitlement(snapshot(), planForProduct, NOW);
    assert.deepEqual(effect, { type: "grant", plan: "plus" });
  });

  it("grants Pro for the Pro product", () => {
    const effect = resolveEntitlement(
      snapshot({ productId: "prod_pro" }),
      planForProduct,
      NOW,
    );
    assert.deepEqual(effect, { type: "grant", plan: "pro" });
  });

  it("grants access while trialing", () => {
    const effect = resolveEntitlement(
      snapshot({ status: "trialing" }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "grant");
  });

  it("does NOT grant from an unknown product", () => {
    // Unknown products map to "free", which must never be treated as paid.
    const effect = resolveEntitlement(
      snapshot({ productId: "prod_mystery" }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "ignore");
    if (effect.type === "ignore") {
      assert.match(effect.reason, /unknown product/i);
    }
  });
});

// ===========================================================================
// Cancellation, expiration, revocation
// ===========================================================================

describe("access removal", () => {
  it("revokes on cancelled status", () => {
    const effect = resolveEntitlement(
      snapshot({ status: "cancelled" }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "revoke");
  });

  it("revokes on expired status", () => {
    const effect = resolveEntitlement(
      snapshot({ status: "expired" }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "revoke");
  });

  it("revokes on past_due status", () => {
    const effect = resolveEntitlement(
      snapshot({ status: "past_due" }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "revoke");
  });

  it("revokes on disputed status", () => {
    const effect = resolveEntitlement(
      snapshot({ status: "disputed" }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "revoke");
  });

  it("revokes when the paid period has ended, even if still active", () => {
    // The safety net: a stale "active" flag must not outlive the paid period.
    const effect = resolveEntitlement(
      snapshot({
        status: "active",
        expiresAt: new Date("2026-03-09T00:00:00Z"),
      }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "revoke");
  });

  it("keeps access when the period ends in the future", () => {
    const effect = resolveEntitlement(
      snapshot({ expiresAt: new Date("2026-04-01T00:00:00Z") }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "grant");
  });

  it("keeps access when cancelling at period end (still within the period)", () => {
    // Cancelling schedules the end; access continues until then.
    const effect = resolveEntitlement(
      snapshot({
        status: "active",
        cancelAtPeriodEnd: true,
        expiresAt: new Date("2026-04-01T00:00:00Z"),
      }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "grant");
  });
});

// ===========================================================================
// Defensive handling
// ===========================================================================

describe("incomplete payloads", () => {
  it("ignores a snapshot with no status rather than guessing", () => {
    const effect = resolveEntitlement(
      snapshot({ status: null }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "ignore");
  });

  it("ignores an active subscription with no product id", () => {
    const effect = resolveEntitlement(
      snapshot({ productId: null }),
      planForProduct,
      NOW,
    );
    assert.equal(effect.type, "ignore");
  });

  it("never grants a paid plan without a recognised product", () => {
    for (const productId of [null, "", "unknown", "prod_", "prod_free"]) {
      const effect = resolveEntitlement(
        snapshot({ productId }),
        planForProduct,
        NOW,
      );
      assert.notEqual(
        effect.type === "grant" ? effect.plan : null,
        "plus",
        `productId=${productId} must not grant`,
      );
    }
  });
});

// ===========================================================================
// Event classification
// ===========================================================================

describe("event classification", () => {
  const granting = [
    "membership_activated",
    "membership.was_activated",
    "payment_succeeded",
    "membership_renewed",
  ];
  const revoking = [
    "membership_canceled",
    "membership_cancelled",
    "membership_expired",
    "membership_deactivated",
    "membership_revoked",
    "payment_failed",
  ];

  for (const event of granting) {
    it(`classifies "${event}" as granting`, () => {
      assert.equal(classifyEvent(event), "grant");
    });
  }

  for (const event of revoking) {
    it(`classifies "${event}" as revoking`, () => {
      assert.equal(classifyEvent(event), "revoke");
    });
  }

  it("returns null for unrelated events", () => {
    assert.equal(classifyEvent("user_created"), null);
    assert.equal(classifyEvent("app_installed"), null);
    assert.equal(classifyEvent(""), null);
    assert.equal(classifyEvent(null), null);
    assert.equal(classifyEvent(undefined), null);
  });

  it("is case and separator insensitive", () => {
    for (const variant of [
      "MEMBERSHIP_ACTIVATED",
      "Membership.Activated",
      "membership-activated",
      "  membership_activated  ",
    ]) {
      assert.equal(classifyEvent(variant), "grant", variant);
    }
  });

  it("REGRESSION: deactivation is not mistaken for activation", () => {
    // "membership_deactivated" CONTAINS "activated". Testing for activation
    // first classified a deactivation as a grant, handing out paid access to a
    // user whose subscription had just been revoked. Revocation is now
    // checked first.
    assert.equal(
      classifyEvent("membership_deactivated"),
      "revoke",
      "deactivation must revoke, not grant",
    );

    for (const trap of [
      "membership_deactivated",
      "membership.inactivated",
      "membership_deactivated_by_admin",
      "subscription_deactivated",
    ]) {
      assert.equal(classifyEvent(trap), "revoke", trap);
    }
  });
});

// ===========================================================================
// Payload reading
// ===========================================================================

describe("payload reading", () => {
  it("reads a nested Whop payload", () => {
    const snapshot = readSubscription({
      action: "membership_activated",
      data: {
        id: "mem_123",
        product_id: "prod_pro",
        status: "active",
        expires_at: "2026-04-01T00:00:00Z",
      },
    });

    assert.equal(snapshot.subscriptionId, "mem_123");
    assert.equal(snapshot.productId, "prod_pro");
    assert.equal(snapshot.status, "active");
    assert.equal(snapshot.expiresAt?.toISOString(), "2026-04-01T00:00:00.000Z");
  });

  it("reads alternative field spellings", () => {
    const snapshot = readSubscription({
      data: {
        membership_id: "mem_456",
        plan_id: "prod_plus",
        subscription: { status: "trialing" },
        renewal_period_end: "2026-05-01T00:00:00Z",
      },
    });

    assert.equal(snapshot.subscriptionId, "mem_456");
    assert.equal(snapshot.productId, "prod_plus");
    assert.equal(snapshot.status, "trialing");
    assert.ok(snapshot.expiresAt);
  });

  it("returns nulls for a payload with nothing usable", () => {
    const snapshot = readSubscription({ action: "membership_activated" });
    assert.equal(snapshot.subscriptionId, null);
    assert.equal(snapshot.productId, null);
    assert.equal(snapshot.status, null);
    assert.equal(snapshot.expiresAt, null);
  });

  it("does not throw on pathological input", () => {
    for (const input of [null, undefined, 42, "text", [], { data: null }]) {
      assert.doesNotThrow(() => readSubscription(input));
    }
  });
});

describe("date parsing", () => {
  it("parses ISO strings", () => {
    assert.equal(
      parseDate("2026-04-01T00:00:00Z")?.toISOString(),
      "2026-04-01T00:00:00.000Z",
    );
  });

  it("parses unix seconds", () => {
    // 1775001600 = 2026-04-01T00:00:00Z
    const parsed = parseDate(1775001600);
    assert.equal(parsed?.toISOString(), "2026-04-01T00:00:00.000Z");
  });

  it("parses unix milliseconds", () => {
    const parsed = parseDate(1775001600000);
    assert.equal(parsed?.toISOString(), "2026-04-01T00:00:00.000Z");
  });

  it("returns null for unusable values", () => {
    assert.equal(parseDate("not a date"), null);
    assert.equal(parseDate(NaN), null);
    assert.equal(parseDate({}), null);
    assert.equal(parseDate(null), null);
  });
});

describe("plan coercion", () => {
  it("accepts valid plan ids", () => {
    assert.equal(coercePlan("free"), "free");
    assert.equal(coercePlan("plus"), "plus");
    assert.equal(coercePlan("pro"), "pro");
  });

  it("falls back to free for anything else", () => {
    // A tampered Firestore plan value must never grant paid access.
    assert.equal(coercePlan("enterprise"), "free");
    assert.equal(coercePlan(undefined), "free");
    assert.equal(coercePlan({ plan: "pro" }), "free");
    assert.equal(coercePlan(999), "free");
  });
});

// ===========================================================================
// Checkout configuration
// ===========================================================================
// A bare `whop.com/checkout/?product=...` link carries NO account id, so a
// purchase made through one can never be attributed — the customer pays and
// receives nothing. The account id must travel in the checkout's metadata,
// which Whop carries onto the membership and echoes back on every webhook.

describe("checkout configuration body", () => {
  const request = {
    planId: "plan_plus123",
    uid: "user-abc",
    redirectUrl: "https://seigem.app/dashboard?checkout=return",
  };

  it("uses payment mode and the PLAN id", () => {
    const body = buildCheckoutConfigurationBody(request);
    assert.equal(body.mode, "payment");
    assert.equal(body.plan_id, "plan_plus123");
  });

  it("CARRIES the account id in metadata", () => {
    // This is the whole point of creating a configuration rather than linking.
    const body = buildCheckoutConfigurationBody(request);
    assert.deepEqual(body.metadata, { seigem_uid: "user-abc" });
  });

  it("passes the redirect through", () => {
    const body = buildCheckoutConfigurationBody(request);
    assert.equal(
      body.redirect_url,
      "https://seigem.app/dashboard?checkout=return",
    );
  });

  it("omits redirect_url when there is none", () => {
    const body = buildCheckoutConfigurationBody({
      ...request,
      redirectUrl: null,
    });
    assert.equal("redirect_url" in body, false);
  });

  it("never sends a product id in place of a plan id", () => {
    // Products own plans; the API takes a plan. Sending a product id here is a
    // configuration error that must be visible in the body, not silently sent.
    const body = buildCheckoutConfigurationBody(request);
    assert.equal("product_id" in body, false);
  });
});

describe("checkout URL", () => {
  it("makes Whop's relative purchase_url absolute", () => {
    // The API documents purchase_url as looking like "/checkout/ch_xxxx/".
    assert.equal(
      absoluteCheckoutUrl("/checkout/ch_abc123/"),
      "https://whop.com/checkout/ch_abc123/",
    );
  });

  it("adds the separating slash when Whop omits it", () => {
    assert.equal(
      absoluteCheckoutUrl("checkout/ch_abc123/"),
      "https://whop.com/checkout/ch_abc123/",
    );
  });

  it("leaves an already-absolute URL untouched", () => {
    assert.equal(
      absoluteCheckoutUrl("https://whop.com/checkout/ch_abc123/"),
      "https://whop.com/checkout/ch_abc123/",
    );
  });

  it("returns null for anything unusable", () => {
    assert.equal(absoluteCheckoutUrl(null), null);
    assert.equal(absoluteCheckoutUrl(undefined), null);
    assert.equal(absoluteCheckoutUrl(""), null);
    assert.equal(absoluteCheckoutUrl("   "), null);
    assert.equal(absoluteCheckoutUrl(42 as unknown as string), null);
  });
});

// ===========================================================================
// The checkout route must not hand over an unattributable checkout
// ===========================================================================

describe("checkout attribution guard", () => {
  it("the route refuses to start a checkout with no plan id configured", async () => {
    const { readFileSync } = await import("node:fs");
    // Strip comments: the file explains WHY a bare product link is wrong, and
    // that explanation must not be mistaken for a usage.
    const source = readFileSync("src/app/api/billing/checkout/route.ts", "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join("\n");

    assert.match(
      source,
      /whopPlusPlanId|whopProPlanId/,
      "the route must resolve a Whop plan id",
    );
    assert.match(
      source,
      /createCheckoutConfiguration\(/,
      "the route must create a checkout configuration, not a bare product link",
    );
    assert.doesNotMatch(
      source,
      /whop\.com\/checkout\/\?product=/,
      "a bare product link cannot carry the account id",
    );
  });

  it("the client verifies the metadata round-tripped before returning a URL", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/billing/checkout.ts", "utf8");

    assert.match(
      source,
      /metadata\?\.seigem_uid !== input\.uid/,
      "an unattributable checkout must be refused rather than handed back",
    );
  });
});
