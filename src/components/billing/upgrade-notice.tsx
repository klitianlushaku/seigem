"use client";

/**
 * Post-checkout notice.
 *
 * Whop sends the buyer back to `/dashboard?checkout=return` immediately after
 * payment. The plan used to be granted by a WEBHOOK that arrives separately, so
 * the customer landed on the dashboard having paid and saw nothing change until
 * it landed. Waiting for that made activation feel slow — the webhook's timing
 * is Whop's, not ours.
 *
 * So the first thing this does is ASK WHOP DIRECTLY, via `/api/billing/verify`.
 * That is one round trip, so the plan is normally active before the notice even
 * paints. The webhook is still the source of truth; this closes the gap.
 *
 * Polling remains as a safety net for the case where Whop has not yet recorded
 * the membership (a card that needed 3-D Secure, say), but with a short interval
 * because the common case is now handled outright.
 *
 * It never grants anything itself: only the verified server can, so a visitor
 * who fakes the query string sees nothing but a "still activating" message.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { PLANS, isPlanId, type PlanId } from "@/config/plans";
import { PLAN_CHANGED, emitAppEvent } from "@/lib/app-events";
import { fetchRemainingUsage } from "@/services/generation";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils/cn";

/** How often to re-check the plan while waiting for the webhook. */
const POLL_INTERVAL_MS = 1500;

/**
 * How long to keep polling.
 *
 * Short, because verification has already done the work. This window only covers
 * the case where Whop has not recorded the membership yet, and after it the
 * notice stops claiming to be "activating" rather than spinning forever.
 */
const POLL_TIMEOUT_MS = 25_000;

type Phase = "idle" | "waiting" | "activated" | "delayed";

/** Reads `checkout=return` from the URL without needing a Suspense boundary. */
function hasCheckoutReturnMarker(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("checkout") === "return";
}

/** Removes the marker so a reload does not replay the notice. */
function clearCheckoutMarker(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function UpgradeNotice() {
  const { getIdToken } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<PlanId | null>(null);
  /** Latest plan seen, so a change can be detected without re-subscribing. */
  const previousPlan = useRef<PlanId | null>(null);

  /** Reads the current plan, returning null when it cannot be read. */
  const readPlan = useCallback(async (): Promise<PlanId | null> => {
    const token = await getIdToken();
    if (!token) return null;

    const usage = await fetchRemainingUsage(token);
    const value: unknown = usage?.plan;
    return isPlanId(value) ? value : null;
  }, [getIdToken]);

  /**
   * Asks the server to verify the purchase with Whop directly.
   *
   * This is what makes activation immediate: the server looks the membership up
   * and applies it, rather than us waiting for a webhook to arrive. Returns the
   * plan when it succeeded, or null when there is nothing to claim yet.
   */
  const verifyWithWhop = useCallback(async (): Promise<PlanId | null> => {
    const token = await getIdToken();
    if (!token) return null;

    try {
      const response = await fetch("/api/billing/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return null;

      const payload = (await response.json()) as {
        activated?: boolean;
        plan?: unknown;
      };

      if (payload.activated !== true) return null;
      return isPlanId(payload.plan) ? payload.plan : null;
    } catch {
      // Treated as "not yet": the poll below still runs, and the webhook
      // remains the backstop. A network blip must not report a failure.
      return null;
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!hasCheckoutReturnMarker()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    /**
     * Verifies once, then polls only if that found nothing.
     *
     * The phase is set only AFTER the first await, never synchronously in the
     * effect body: a synchronous `setState` there triggers a cascading render
     * (and React's lint rule rejects it). Deferring also means a buyer whose plan
     * is already active sees the confirmation directly, with no flash of the
     * "activating…" state first.
     */
    const poll = async (isFirstAttempt: boolean) => {
      // The first attempt goes straight to Whop, which is the whole point: it
      // resolves the common case in one round trip instead of waiting.
      const claimed = isFirstAttempt ? await verifyWithWhop() : null;
      if (cancelled) return;

      if (claimed && claimed !== "free") {
        previousPlan.current = claimed;
        setPlan(claimed);
        setPhase("activated");
        clearCheckoutMarker();
        emitAppEvent(PLAN_CHANGED);
        return;
      }

      const current = await readPlan();
      if (cancelled) return;

      // Treat any paid plan as success: the buyer may have upgraded while
      // already subscribed, in which case the tier changed but "paid" did not.
      if (current && current !== "free") {
        previousPlan.current = current;
        setPlan(current);
        setPhase("activated");
        clearCheckoutMarker();
        // The sidebar badge and the pricing page both read the plan, so they
        // are told to re-read it rather than waiting for a page reload.
        emitAppEvent(PLAN_CHANGED);
        return;
      }

      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setPhase("delayed");
        return;
      }

      setPhase("waiting");
      timer = setTimeout(() => void poll(false), POLL_INTERVAL_MS);
    };

    void poll(true);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [readPlan, verifyWithWhop]);

  if (phase === "idle") return null;

  const planName = plan ? PLANS[plan].name : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-[22px] border px-4 py-3.5",
        phase === "activated"
          ? "border-stat-green/40 bg-stat-green/10"
          : phase === "delayed"
            ? "border-stat-orange/40 bg-stat-orange/10"
            : "border-accent/40 bg-accent/10",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-semibold",
              phase === "activated"
                ? "text-stat-green"
                : phase === "delayed"
                  ? "text-stat-orange"
                  : "text-accent",
            )}
          >
            {phase === "activated"
              ? `Plani ${planName} u aktivizua!`
              : phase === "delayed"
                ? "Pagesa u pranua — aktivizimi po vonon"
                : "Pagesa u krye. Po aktivizojmë planin…"}
          </p>

          <p className="mt-1 text-xs leading-5 text-muted">
            {phase === "activated"
              ? `Tani ke kufijtë e planit ${planName}. Gëzuar studimin!`
              : phase === "delayed"
                ? "Whop e konfirmoi pagesën, por konfirmimi i abonimit nuk ka mbërritur ende. Rifresko faqen pas një minute — nuk ka nevojë të paguash përsëri."
                : "Konfirmimi i pagesës nga Whop zakonisht zgjat disa sekonda."}
          </p>
        </div>

        {phase !== "waiting" ? (
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-content"
          >
            Mbyll
          </button>
        ) : null}
      </div>
    </div>
  );
}
