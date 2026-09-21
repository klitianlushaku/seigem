/**
 * Whop webhook integration test.
 *
 * Run with: npm run test:whop-webhook
 *
 * The other billing tests use hand-written payloads. This one uses the payload
 * shape taken from Whop's OWN OpenAPI spec (`/openapi/api-v1-stable.json`,
 * `webhooks.membership.activated`), so it fails if the handler ever drifts from
 * what Whop actually sends.
 *
 * The real shape is:
 *   {
 *     id, api_version, api_version_date, timestamp,
 *     type: "membership.activated",
 *     data: {
 *       id: "mem_...",              <- membership id
 *       status: "active",
 *       product: { id: "prod_...", title, metadata },
 *       plan:    { id: "plan_...", metadata },
 *       metadata: { seigem_uid },   <- checkout metadata lands HERE
 *       cancel_at_period_end: bool,
 *       renewal_period_end: ISO|null,
 *     }
 *   }
 *
 * A mistake in any of those field paths means a paying customer silently gets
 * nothing, so they are asserted explicitly.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyEvent,
  readSubscription,
  resolveEntitlement,
} from "../src/lib/billing.ts";
import {
  DEFAULT_PLAN_ID,
  type PlanId,
} from "../src/config/plans.ts";

const PLUS_PRODUCT = "prod_aSUHjuxgedghm";
const PRO_PRODUCT = "prod_dDTzJMfHXMVcN";

/** Maps the real product ids, as the deployed app does. */
function planForProduct(productId: string): PlanId {
  if (productId === PLUS_PRODUCT) return "plus";
  if (productId === PRO_PRODUCT) return "pro";
  return DEFAULT_PLAN_ID;
}

/** Builds a payload in Whop's documented shape. */
function whopPayload(overrides: {
  type?: string;
  status?: string;
  productId?: string;
  metadata?: Record<string, unknown> | null;
  cancelAtPeriodEnd?: boolean;
  renewalPeriodEnd?: string | null;
} = {}) {
  return {
    id: "msg_xxxxxxxxxxxxxxxxxxxxxxxx",
    api_version: "v1",
    api_version_date: "2026-07-20",
    timestamp: "2025-01-01T00:00:00.000Z",
    type: overrides.type ?? "membership.activated",
    data: {
      id: "mem_xxxxxxxxxxxxxx",
      status: overrides.status ?? "active",
      product: {
        id: overrides.productId ?? PLUS_PRODUCT,
        title: "Seigem Plus",
        metadata: null,
      },
      plan: { id: "plan_Ke0l8ewDdoOUD", metadata: null },
      metadata: overrides.metadata ?? { seigem_uid: "uid_abc123" },
      cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
      renewal_period_end: overrides.renewalPeriodEnd ?? "2099-01-01T00:00:00.000Z",
    },
  };
}

describe("Whop webhook payloads (shape verified against Whop's OpenAPI spec)", () => {
  it("reads the membership id, status and product from the real payload shape", () => {
    const snapshot = readSubscription(whopPayload());

    assert.equal(snapshot.subscriptionId, "mem_xxxxxxxxxxxxxx");
    assert.equal(snapshot.status, "active");
    // The product id arrives nested at data.product.id, NOT data.product_id.
    assert.equal(snapshot.productId, PLUS_PRODUCT);
    assert.equal(snapshot.cancelAtPeriodEnd, false);
    assert.equal(snapshot.expiresAt?.toISOString(), "2099-01-01T00:00:00.000Z");
  });

  it("grants Plus for an active Plus membership", () => {
    const entitlement = resolveEntitlement(
      readSubscription(whopPayload()),
      planForProduct,
    );
    assert.deepEqual(entitlement, { type: "grant", plan: "plus" });
  });

  it("grants Pro for an active Pro membership", () => {
    const entitlement = resolveEntitlement(
      readSubscription(whopPayload({ productId: PRO_PRODUCT })),
      planForProduct,
    );
    assert.deepEqual(entitlement, { type: "grant", plan: "pro" });
  });

  it("does NOT grant a plan for an unrecognised product", () => {
    const entitlement = resolveEntitlement(
      readSubscription(whopPayload({ productId: "prod_unknown" })),
      planForProduct,
    );
    assert.equal(entitlement.type, "ignore");
  });

  it("grants nothing when the plan_ id is wrongly used as a product id", () => {
    // This is the exact misconfiguration found in .env.local. It must never
    // grant access, and planForProduct is what makes that safe.
    const entitlement = resolveEntitlement(
      readSubscription(whopPayload({ productId: "plan_Ke0l8ewDoo0UD" })),
      planForProduct,
    );
    assert.equal(entitlement.type, "ignore");
  });

  it("revokes on membership.deactivated", () => {
    assert.equal(classifyEvent("membership.deactivated"), "revoke");
  });

  it("classifies membership.activated as a grant", () => {
    assert.equal(classifyEvent("membership.activated"), "grant");
  });

  it("does NOT revoke on a scheduled cancellation", () => {
    // The critical case: the customer clicked "cancel" but has paid through the
    // end of the period. Revoking here would cut off a paying customer.
    assert.equal(classifyEvent("membership.cancel_at_period_end_changed"), null);
  });

  it("keeps the plan when cancellation is scheduled at period end", () => {
    const snapshot = readSubscription(
      whopPayload({
        type: "membership.cancel_at_period_end_changed",
        cancelAtPeriodEnd: true,
        renewalPeriodEnd: "2099-01-01T00:00:00.000Z",
      }),
    );

    // The event carries no entitlement change...
    assert.equal(classifyEvent("membership.cancel_at_period_end_changed"), null);
    // ...and the subscription is still active, so access continues.
    assert.deepEqual(resolveEntitlement(snapshot, planForProduct), {
      type: "grant",
      plan: "plus",
    });
  });

  it("revokes once the paid period has actually ended", () => {
    const snapshot = readSubscription(
      whopPayload({
        cancelAtPeriodEnd: true,
        renewalPeriodEnd: "2020-01-01T00:00:00.000Z",
      }),
    );
    assert.deepEqual(resolveEntitlement(snapshot, planForProduct), {
      type: "revoke",
    });
  });

  it("revokes on a past_due or expired status", () => {
    for (const status of ["past_due", "expired", "canceled"]) {
      const snapshot = readSubscription(whopPayload({ status }));
      assert.deepEqual(
        resolveEntitlement(snapshot, planForProduct),
        { type: "revoke" },
        `status "${status}" should revoke`,
      );
    }
  });

  it("still grants for trialing and canceling statuses", () => {
    for (const status of ["trialing", "canceling"]) {
      const snapshot = readSubscription(
        whopPayload({ status, renewalPeriodEnd: "2099-01-01T00:00:00.000Z" }),
      );
      assert.deepEqual(
        resolveEntitlement(snapshot, planForProduct),
        { type: "grant", plan: "plus" },
        `status "${status}" should still grant`,
      );
    }
  });
});
