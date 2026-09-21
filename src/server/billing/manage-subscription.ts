/** Whop membership management calls made only from authenticated server routes. */
import "server-only";

import { parseDate } from "@/lib/billing";
import { serverEnv } from "@/lib/env/server";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Why a cancellation did not happen, or null when it did.
 *
 * Machine-readable so the route can choose the right message. Previously every
 * failure collapsed into one generic "try again later", which was actively
 * misleading: a stale subscription id can never succeed on a retry.
 */
export type CancellationFailure =
  /** Whop does not know this membership — the stored link is stale. */
  | "unknown_membership"
  /** The API key lacks permission to cancel. A configuration fault. */
  | "forbidden"
  /** The membership exists but Whop refused (already ended, disputed, ...). */
  | "rejected"
  /** Whop could not be reached, or answered unexpectedly. */
  | "unreachable";

export interface CancellationResult {
  /** True when Whop confirmed the cancellation. */
  cancelled: boolean;
  /**
   * End of the paid period, when Whop reports one.
   *
   * NULLABLE ON PURPOSE. Whop returns `current_period_end: null` for these
   * memberships — verified against the live API — so requiring a date meant a
   * SUCCESSFUL cancellation was reported to the customer as a failure, and was
   * never recorded. The subscription really was cancelled at Whop while the app
   * still showed it as active, inviting the customer to cancel again.
   */
  expiresAt: Date | null;
  /** Set when `cancelled` is false. */
  failure: CancellationFailure | null;
  /** Whop's own message, for the log. Never returned to the client. */
  detail: string | null;
}

/** Reads Whop's `{ error: { message } }` shape without trusting it. */
function whopErrorMessage(payload: Record<string, unknown> | null): string | null {
  const error = payload?.error;
  if (typeof error !== "object" || error === null) return null;
  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

/** Maps an HTTP status to a failure reason. */
function failureForStatus(status: number): CancellationFailure {
  if (status === 404) return "unknown_membership";
  if (status === 401 || status === 403) return "forbidden";
  return "rejected";
}

/**
 * Cancels a Whop membership at the end of the paid period.
 *
 * Never throws: every outcome is reported in the returned value so the caller
 * decides what the customer sees. Cancelling is not immediate — the customer
 * keeps access until the period ends, which is what they paid for.
 *
 * @param membershipId Whop membership id stored against the account.
 */
export async function cancelMembershipAtPeriodEnd(
  membershipId: string,
): Promise<CancellationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(
      `${serverEnv.whopBaseUrl.replace(/\/+$/, "")}/memberships/${encodeURIComponent(membershipId)}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serverEnv.whopApiKey}`,
        },
        body: JSON.stringify({ cancellation_mode: "at_period_end" }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    console.error("[billing] membership cancellation request failed:", error);
    return {
      cancelled: false,
      expiresAt: null,
      failure: "unreachable",
      detail: error instanceof Error ? error.message : "network error",
    };
  } finally {
    clearTimeout(timeout);
  }

  // Never log the body wholesale; Whop's message is safe and is the useful part.
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    const detail = whopErrorMessage(payload);
    console.error(
      `[billing] membership cancellation rejected with HTTP ${response.status}` +
        (detail ? `: ${detail}` : ""),
    );
    return {
      cancelled: false,
      expiresAt: null,
      failure: failureForStatus(response.status),
      detail,
    };
  }

  /*
   * Whop accepted the cancellation. The period end is best-effort: several
   * field names have been used across API versions, and these memberships
   * report null, so a missing date is normal and must NOT be treated as a
   * failure.
   */
  const expiresAt =
    parseDate(payload?.renewal_period_end) ??
    parseDate(payload?.current_period_end) ??
    parseDate(payload?.expires_at);

  return { cancelled: true, expiresAt, failure: null, detail: null };
}
