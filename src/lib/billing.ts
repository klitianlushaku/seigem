/**
 * Billing state logic.
 *
 * Pure functions that decide what a user's plan should be given a Whop
 * subscription event. Kept free of `server-only` and of Firebase so every
 * transition can be unit-tested directly.
 *
 * Guiding rule from the master prompt: a VERIFIED webhook is the only source of
 * truth for subscription activation. A frontend redirect back from checkout
 * proves nothing, so nothing here reads from a redirect.
 *
 * The plan table in `@/config/plans` owns plan ids and prices; this module owns
 * the mapping from subscription state to plan.
 */
import { DEFAULT_PLAN_ID, isPlanId, type PlanId } from "@/config/plans";

/**
 * Whop subscription statuses that grant paid access.
 * Everything else means the user is entitled to the free plan.
 */
const ACTIVE_STATUSES: readonly string[] = ["active", "trialing", "canceling"];

/**
 * Whop webhook event names that concern Seigem.
 *
 * VERIFIED against Whop's OpenAPI spec (`/openapi/api-v1-stable.json`), which
 * defines exactly these membership and payment hooks:
 *
 *   membership.activated
 *   membership.deactivated
 *   membership.cancel_at_period_end_changed
 *   membership.trial_ending_soon
 *   payment.authorized / created / pending / succeeded / failed / canceled
 *   payment.requires_action
 *
 * NOTE: there is NO `membership.canceled`, `membership.expired` or
 * `membership.updated` hook. Whop reports cancellation through
 * `membership.cancel_at_period_end_changed` (a SCHEDULED cancellation, which
 * must NOT revoke access immediately) and revocation through
 * `membership.deactivated`. The lists below are kept deliberately permissive so
 * that a future Whop event name is still handled rather than silently dropped.
 */
export const BILLING_EVENT_KINDS = [
  "membership_activated",
  "membership_updated",
  "membership_canceled",
  "membership_cancelled",
  "membership_expired",
  "membership_deactivated",
  "membership_cancel_at_period_end_changed",
  "payment_succeeded",
  "payment_failed",
] as const;

/** What a webhook event means for the user's entitlement. */
export type EntitlementEffect =
  /** Grant a paid plan. */
  | { type: "grant"; plan: PlanId }
  /** Move the user to a specific plan (used when a plan changes). */
  | { type: "change"; plan: PlanId }
  /** Remove paid access and fall back to free. */
  | { type: "revoke" }
  /** Nothing to change; acknowledge and ignore. */
  | { type: "ignore"; reason: string };

/** A normalized view of the subscription data inside a webhook payload. */
export interface SubscriptionSnapshot {
  /** Whop's subscription/membership id. */
  subscriptionId: string | null;
  /** Whop's product/plan id, which decides which Seigem plan is granted. */
  productId: string | null;
  /** Raw status string from Whop. */
  status: string | null;
  /** End of the current paid period, when provided. */
  expiresAt: Date | null;
  /** True when the subscription is set to end at the period end. */
  cancelAtPeriodEnd: boolean;
}

/** Reads a value from a nested object path, tolerating missing levels. */
function pick(source: unknown, ...path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Parses a date that may arrive as an ISO string or a Unix timestamp. */
export function parseDate(value: unknown): Date | null {
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: values below 1e12 are seconds, above are milliseconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Extracts the subscription snapshot from a webhook payload.
 *
 * Whop's payloads nest the subscription under `data`, and the exact shape has
 * varied between API versions, so several plausible locations are checked and
 * anything missing becomes null rather than throwing. The caller decides what
 * to do with an incomplete snapshot.
 */
export function readSubscription(payload: unknown): SubscriptionSnapshot {
  const data = pick(payload, "data") ?? payload;

  const subscriptionId =
    asString(pick(data, "id")) ??
    asString(pick(data, "membership_id")) ??
    asString(pick(data, "subscription_id")) ??
    asString(pick(payload, "id"));

  const productId =
    asString(pick(data, "product_id")) ??
    asString(pick(data, "plan_id")) ??
    asString(pick(data, "product", "id")) ??
    asString(pick(data, "plan", "id")) ??
    asString(pick(data, "renewal", "product_id"));

  const status =
    asString(pick(data, "status")) ??
    asString(pick(data, "membership", "status")) ??
    asString(pick(data, "subscription", "status"));

  const expiresAt =
    parseDate(pick(data, "expires_at")) ??
    parseDate(pick(data, "expiration_date")) ??
    parseDate(pick(data, "current_period_end")) ??
    parseDate(pick(data, "renewal_period_end")) ??
    parseDate(pick(data, "valid_until"));

  const cancelAtPeriodEnd =
    pick(data, "cancel_at_period_end") === true ||
    pick(data, "cancel_at_period_end") === "true";

  return { subscriptionId, productId, status, expiresAt, cancelAtPeriodEnd };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Decides what a subscription state means for a user's entitlement.
 *
 * @param snapshot   Subscription data from the verified payload.
 * @param planForProduct Maps a Whop product id to a Seigem plan.
 * @param now        Injectable clock, so expiry can be tested deterministically.
 */
export function resolveEntitlement(
  snapshot: SubscriptionSnapshot,
  planForProduct: (productId: string) => PlanId,
  now: Date = new Date(),
): EntitlementEffect {
  const expiresAtMs = snapshot.expiresAt?.getTime() ?? null;
  const status = snapshot.status?.toLowerCase() ?? null;

  /*
   * PAID TIME REMAINING IS DECISIVE — but only for statuses that mean "still
   * entitled".
   *
   * A running paid period must keep access for an ACTIVE subscription, and
   * equally for a CANCELLED one. Whop reports a cancelled subscription as
   * `status: "canceled"` with `cancel_at_period_end: false` and a FUTURE
   * `current_period_end`. Checking status first revoked the customer on the spot:
   * they cancelled and immediately lost the weeks they had already paid for.
   * Cancelling stops the RENEWAL; it neither refunds nor shortens the period
   * already bought.
   *
   * Deliberately NOT applied to statuses that signal a problem rather than an
   * ending — `past_due`, `expired`, `disputed` — which must still revoke even if
   * a period end is recorded. Nor to a payload with no status at all, which
   * remains "ignore" rather than a guess.
   */
  const STATUSES_THAT_KEEP_ACCESS_WHILE_PAID: readonly string[] = [
    ...ACTIVE_STATUSES,
    "canceled",
    "cancelled",
  ];

  if (
    expiresAtMs !== null &&
    expiresAtMs > now.getTime() &&
    status !== null &&
    STATUSES_THAT_KEEP_ACCESS_WHILE_PAID.includes(status)
  ) {
    if (!snapshot.productId) {
      return { type: "ignore", reason: "paid period remaining but no product id" };
    }

    const plan = planForProduct(snapshot.productId);
    if (plan === DEFAULT_PLAN_ID) {
      return { type: "ignore", reason: "unknown product id" };
    }

    return { type: "grant", plan };
  }

  // A period end in the past means access has lapsed, regardless of status.
  if (expiresAtMs !== null && expiresAtMs <= now.getTime()) {
    return { type: "revoke" };
  }

  // No usable status: leave entitlement untouched.
  if (!status) {
    return { type: "ignore", reason: "missing subscription status" };
  }

  if (!ACTIVE_STATUSES.includes(status)) {
    // past_due / expired / disputed / deactivated, and cancelled with nothing
    // paid remaining, all mean no paid access.
    return { type: "revoke" };
  }

  // Active, but we cannot know which plan without a product id.
  if (!snapshot.productId) {
    return { type: "ignore", reason: "active subscription without a product id" };
  }

  const plan = planForProduct(snapshot.productId);

  // An unknown product must never silently grant something. The mapper returns
  // the free plan for unrecognised ids, which means "no paid entitlement".
  if (plan === DEFAULT_PLAN_ID) {
    return { type: "ignore", reason: "unknown product id" };
  }

  return { type: "grant", plan };
}

/** Normalizes an event name for comparison. */
function normalizeEventName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s.-]+/g, "_");
}

/**
 * Classifies a webhook event name.
 *
 * @returns "grant" for activation-like events, "revoke" for termination-like
 *   events, or null when the event is not billing-related.
 *
 * ORDER MATTERS, in two ways:
 *
 *  1. "cancel_at_period_end_changed" is handled FIRST and returns null. Whop
 *     sends it when a customer merely SCHEDULES a cancellation — they have paid
 *     through the end of the period and must keep access until then. The name
 *     contains "cancel", so letting it reach the revocation branch would cut a
 *     paying customer off the moment they clicked "cancel", which is both wrong
 *     and a refund magnet. The handler keeps the current plan and records the
 *     end date instead.
 *
 *  2. Revocation is checked BEFORE activation. "membership_deactivated"
 *     contains the substring "activated", so testing for activation first would
 *     classify a deactivation as a grant — accidentally giving away paid
 *     access. The same trap applies to "deactivated" and "inactivated".
 */
export function classifyEvent(
  eventName: string | null | undefined,
): "grant" | "revoke" | null {
  if (!eventName) return null;
  const name = normalizeEventName(eventName);

  // --- Scheduled cancellation: neither grant nor revoke -----------------
  // Must precede the revocation block below, which matches "cancel".
  if (name.includes("cancel_at_period_end")) {
    return null;
  }

  // --- Revocation (see ORDER MATTERS above) ----------------------------
  if (
    name.includes("deactivated") ||
    name.includes("inactivated") ||
    name.includes("canceled") ||
    name.includes("cancelled") ||
    name.includes("expired") ||
    name.includes("revoked") ||
    name.includes("payment_failed") ||
    name.includes("past_due")
  ) {
    return "revoke";
  }

  // --- Granting --------------------------------------------------------
  if (
    name.includes("activated") ||
    name.includes("payment_succeeded") ||
    name.includes("renewed")
  ) {
    return "grant";
  }

  // updated / created / etc. carry state; the snapshot decides what to do.
  if (name.includes("membership") || name.includes("subscription")) {
    return "grant";
  }

  return null;
}

/** Validates that a value is a plan id, for defensive reads from Firestore. */
export function coercePlan(value: unknown): PlanId {
  return isPlanId(value) ? value : DEFAULT_PLAN_ID;
}

// ===========================================================================
// Checkout configuration
// ===========================================================================

/** What a checkout configuration needs to be created for. */
export interface CheckoutConfigurationRequest {
  /** Whop PLAN id (`plan_...`), not a product id. */
  planId: string;
  /** The Seigem user the resulting membership belongs to. */
  uid: string;
  /** Where Whop sends the buyer afterwards, or null to use its default. */
  redirectUrl: string | null;
}

/**
 * Builds the body for `POST /checkout_configurations`.
 *
 * The `seigem_uid` metadata is the whole point: Whop attaches it to the
 * checkout configuration, and "payments and memberships created from a checkout
 * session inherit its metadata". That is how the webhook — which sees only the
 * membership — learns WHICH Seigem account just paid. A bare
 * `whop.com/checkout/?product=...` link cannot carry it, so a purchase made
 * through one can never be attributed, and the customer pays for nothing.
 */
export function buildCheckoutConfigurationBody(
  request: CheckoutConfigurationRequest,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    mode: "payment",
    plan_id: request.planId,
    metadata: { seigem_uid: request.uid },
  };

  if (request.redirectUrl) body.redirect_url = request.redirectUrl;

  return body;
}

/**
 * Turns a checkout configuration's `purchase_url` into an absolute URL.
 *
 * Whop returns a relative path such as `/checkout/ch_xxxxxxxxxxxxxxx/`, which
 * cannot be used for a navigation on its own. An already-absolute URL is
 * returned unchanged, so this stays correct if Whop starts sending one.
 */
export function absoluteCheckoutUrl(
  purchaseUrl: string | null | undefined,
): string | null {
  if (typeof purchaseUrl !== "string") return null;

  const trimmed = purchaseUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return `https://whop.com${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

/**
 * Validates a post-purchase redirect URL, or returns null to omit it.
 *
 * Whop rejects the whole request with HTTP 400 when `redirect_url` is not a
 * valid https URL:
 *
 *   "The redirect URL must be a valid URL, starting with https://"
 *
 * That happened in production because `NEXT_PUBLIC_APP_URL` fell back to
 * `http://localhost:3000`, so every checkout attempt failed — even though the
 * payment itself was perfectly configured.
 *
 * Returning null when the URL cannot be used is deliberate: Whop then falls
 * back to its own post-purchase page, which still lets the customer pay and
 * still delivers the webhook that grants the plan. Blocking the sale over a
 * cosmetic redirect would be far worse than landing the buyer on Whop's page.
 *
 * Only `https:` is accepted. Whop requires it, and a plaintext URL would leak
 * the session in transit on the way back.
 *
 * @param value Candidate absolute URL, e.g. "https://example.com/dashboard".
 */
export function safeRedirectUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Tolerate a host without a scheme ("example.com/x") by assuming https, which
  // is what a production deployment always wants.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;

  return parsed.toString();
}
