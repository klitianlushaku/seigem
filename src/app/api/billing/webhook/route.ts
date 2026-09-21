/**
 * POST /api/billing/webhook
 *
 * Receives Whop subscription events. This endpoint is the ONLY place a user's
 * plan is granted or revoked.
 *
 * Security model:
 *   - The raw request body is read BEFORE parsing, because the signature is
 *     computed over the exact bytes. Re-serializing parsed JSON would change
 *     the payload and invalidate the signature.
 *   - Every request must carry a valid Standard Webhooks signature. An
 *     unsigned or tampered request is rejected with 401.
 *   - The response never explains WHY verification failed, so a probe cannot
 *     learn whether a secret or a header was wrong.
 *
 * Idempotency: Whop retries deliveries. Re-applying an event is harmless
 * because the handler sets absolute state (plan, expiry) rather than
 * incrementing anything, so a duplicate delivery converges to the same result.
 */
import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_PLAN_ID } from "@/config/plans";
import {
  classifyEvent,
  readSubscription,
  resolveEntitlement,
} from "@/lib/billing";
import { planForWhopProduct, warnOnWhopMisconfiguration } from "@/lib/env/server";
import { verifyWhopWebhook } from "@/server/billing/webhook";
import {
  applySubscriptionUpdate,
  resolveWebhookUid,
  revokeSubscription,
} from "@/server/billing/subscriptions";

/** Reads a uid from the checkout metadata, when present. */
function metadataUidFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const root = payload as Record<string, unknown>;

  const candidates = [
    (root.data as Record<string, unknown> | undefined)?.metadata,
    root.metadata,
    (root.data as Record<string, unknown> | undefined)?.checkout_configuration,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const uid = (candidate as Record<string, unknown>).seigem_uid;
    if (typeof uid === "string" && uid.trim()) return uid.trim();
  }

  return null;
}

/** Reads the event name from a payload, tolerating the known shapes. */
function eventNameFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const root = payload as Record<string, unknown>;

  const name = root.action ?? root.event ?? root.type ?? root.event_type;
  return typeof name === "string" ? name : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Surface a wrong product/plan id immediately: it otherwise shows up only as
  // "the customer paid and nothing happened".
  warnOnWhopMisconfiguration("webhook");

  // The raw text is required for signature verification.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error("[billing] failed to read webhook body:", error);
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const verification = verifyWhopWebhook(rawBody, request.headers);
  if (!verification.ok) {
    // Deliberately terse: no reason, no hint about which check failed.
    return NextResponse.json({ error: "unauthorized" }, { status: verification.status });
  }

  const payload = verification.payload;
  const eventName = eventNameFrom(payload);
  const eventKind = classifyEvent(eventName);

  if (!eventKind) {
    // Acknowledge unknown events so Whop stops retrying them.
    return NextResponse.json({ received: true, handled: false }, { status: 200 });
  }

  const subscription = readSubscription(payload);
  const metadataUid = metadataUidFrom(payload);

  // Everything past signature verification touches Firestore. A failure here is
  // an operational problem on our side, so it is logged and answered with a
  // JSON 500 — never an unhandled exception, and never a detail the caller
  // could use to probe our configuration.
  try {
    const uid = await resolveWebhookUid(subscription.subscriptionId, metadataUid);
    if (!uid) {
      // Verified, but we cannot tell which account it belongs to.
      //
      // This is logged at ERROR level on purpose. The usual cause is a checkout
      // that did not carry the account id through to Whop, which means the
      // customer has PAID and received nothing. Acknowledge the delivery (so
      // Whop does not retry forever) but make the money-losing case impossible
      // to miss in the logs, and name the subscription so it can be linked by
      // hand.
      console.error(
        "[billing] PAID EVENT NOT APPLIED — could not resolve account. " +
          `event="${eventName}" subscription=${subscription.subscriptionId ?? "none"} ` +
          `metadataUid=${metadataUid ?? "none"}`,
      );
      return NextResponse.json(
        { received: true, handled: false },
        { status: 200 },
      );
    }

    const entitlement = resolveEntitlement(subscription, planForWhopProduct);

    // Whop can emit a cancellation event when the customer schedules the
    // membership to end. Keep access until the recorded paid period ends.
    const scheduledCancellation = Boolean(
      subscription.cancelAtPeriodEnd &&
        subscription.expiresAt &&
        subscription.expiresAt.getTime() > Date.now(),
    );

    if (entitlement.type === "ignore") {
      console.info(`[billing] ignoring event for ${uid}: ${entitlement.reason}`);
      return NextResponse.json(
        { received: true, handled: false },
        { status: 200 },
      );
    }

    if (
      (entitlement.type === "revoke" || eventKind === "revoke") &&
      !scheduledCancellation
    ) {
      await revokeSubscription(uid, eventName ?? "revoke");
      return NextResponse.json(
        { received: true, handled: true, plan: DEFAULT_PLAN_ID },
        { status: 200 },
      );
    }

    const scheduledPlan =
      scheduledCancellation && subscription.productId
        ? planForWhopProduct(subscription.productId)
        : entitlement.type === "grant" || entitlement.type === "change"
          ? entitlement.plan
          : DEFAULT_PLAN_ID;

    if (scheduledPlan === DEFAULT_PLAN_ID) {
      console.info(`[billing] ignoring scheduled cancellation for unknown plan`);
      return NextResponse.json(
        { received: true, handled: false },
        { status: 200 },
      );
    }

    await applySubscriptionUpdate(uid, {
      plan: scheduledPlan,
      planExpiresAt: subscription.expiresAt,
      whopSubscriptionId: subscription.subscriptionId,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });

    return NextResponse.json(
      { received: true, handled: true, plan: scheduledPlan },
      { status: 200 },
    );
  } catch (error) {
    // Returning 500 asks Whop to retry, which is correct for a transient
    // failure such as a Firestore outage.
    console.error("[billing] failed to apply verified webhook:", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

/** Rejects any other method so the endpoint has a single, auditable entry. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
