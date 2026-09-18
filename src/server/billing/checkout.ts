/**
 * Whop checkout configuration creation (server-only).
 *
 * Why this exists rather than a plain `whop.com/checkout/?product=...` link:
 *
 * A bare product link cannot carry any data about WHO is buying. The webhook
 * that grants the plan only ever sees a membership, so with a bare link there
 * is nothing tying that membership back to a Seigem account — the customer pays
 * and receives nothing.
 *
 * Whop's checkout configurations solve exactly this: their API documents that
 * "payments and memberships created from a checkout session inherit its
 * metadata". So the account id is attached here, travels through the purchase,
 * and comes back on every membership event, where `resolveWebhookUid` reads it.
 *
 * Reference: https://docs.whop.com/api-reference/checkout-configurations/create-checkout-configuration
 */
import "server-only";

import {
  absoluteCheckoutUrl,
  buildCheckoutConfigurationBody,
} from "@/lib/billing";
import { serverEnv } from "@/lib/env/server";
import { ApiError } from "@/server/http/errors";

/** Request timeout. A payment hand-off must not hang the user's click. */
const REQUEST_TIMEOUT_MS = 15_000;

/** A created checkout, ready to hand to the browser. */
export interface CreatedCheckout {
  /** Whop checkout configuration id (`ch_...`), for logging and support. */
  id: string;
  /** Absolute URL to send the buyer to. */
  url: string;
}

/**
 * Creates a Whop checkout configuration carrying the buyer's account id.
 *
 * @throws {ApiError} `internal_error` when Whop is unreachable, rejects the
 *   request, or returns a configuration that did not retain the metadata. In
 *   every one of those cases the checkout is ABANDONED rather than handed over,
 *   because proceeding would take the customer's money with no way to grant the
 *   plan afterwards.
 */
export async function createCheckoutConfiguration(input: {
  planId: string;
  uid: string;
  redirectUrl: string | null;
}): Promise<CreatedCheckout> {
  const endpoint = `${serverEnv.whopBaseUrl.replace(/\/+$/, "")}/checkout_configurations`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.whopApiKey}`,
      },
      body: JSON.stringify(buildCheckoutConfigurationBody(input)),
      signal: controller.signal,
    });
  } catch (error) {
    console.error("[billing] checkout configuration request failed:", error);
    throw new ApiError(
      "internal_error",
      "Nuk mund të nisim pagesën. Provo përsëri më vonë.",
    );
  } finally {
    clearTimeout(timeout);
  }

  // Never log the response body wholesale: it can echo request content and the
  // Authorization header must never reach a log.
  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    console.error(
      `[billing] checkout configuration rejected with HTTP ${response.status}`,
    );
    throw new ApiError(
      "internal_error",
      "Nuk mund të nisim pagesën. Provo përsëri më vonë.",
    );
  }

  const id = typeof payload?.id === "string" ? payload.id : null;
  const url = absoluteCheckoutUrl(
    typeof payload?.purchase_url === "string" ? payload.purchase_url : null,
  );

  if (!id || !url) {
    console.error(
      "[billing] checkout configuration response had no id/purchase_url",
    );
    throw new ApiError(
      "internal_error",
      "Nuk mund të nisim pagesën. Provo përsëri më vonë.",
    );
  }

  // Verify the metadata actually came back before trusting the checkout. If
  // Whop dropped it, the resulting membership would be unattributable, so it is
  // better to refuse the sale than to take money we cannot act on.
  const metadata =
    typeof payload?.metadata === "object" && payload.metadata !== null
      ? (payload.metadata as Record<string, unknown>)
      : null;

  if (metadata?.seigem_uid !== input.uid) {
    console.error(
      `[billing] checkout configuration ${id} did not retain seigem_uid; ` +
        "refusing to hand back an unattributable checkout",
    );
    throw new ApiError(
      "internal_error",
      "Nuk mund të nisim pagesën. Provo përsëri më vonë.",
    );
  }

  console.info(
    `[billing] created checkout configuration ${id} for plan ${input.planId}`,
  );

  return { id, url };
}
