/** Whop membership management calls made only from authenticated server routes. */
import "server-only";

import { parseDate } from "@/lib/billing";
import { serverEnv } from "@/lib/env/server";
import { ApiError } from "@/server/http/errors";

const REQUEST_TIMEOUT_MS = 15_000;

export interface ScheduledCancellation {
  expiresAt: Date | null;
}

/** Cancels at period end, never immediately. */
export async function cancelMembershipAtPeriodEnd(
  membershipId: string,
): Promise<ScheduledCancellation> {
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
    throw new ApiError(
      "internal_error",
      "Nuk mund ta anulojmë abonimin tani. Provo përsëri më vonë.",
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    console.error(
      `[billing] membership cancellation rejected with HTTP ${response.status}`,
    );
    throw new ApiError(
      "internal_error",
      "Nuk mund ta anulojmë abonimin tani. Provo përsëri më vonë.",
    );
  }

  return {
    expiresAt:
      parseDate(payload?.renewal_period_end) ??
      parseDate(payload?.current_period_end) ??
      parseDate(payload?.expires_at),
  };
}