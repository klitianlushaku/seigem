"use client";

/**
 * Post-checkout notice.
 *
 * Whop sends the buyer back to `/dashboard?checkout=return` immediately after
 * payment. The plan is granted by a WEBHOOK, however, which arrives separately
 * and a few seconds later. So at the moment of return the buyer has paid but is
 * still on the old plan.
 *
 * Without this, that gap is silent and alarming: the customer has just been
 * charged, lands on the dashboard, and nothing has changed. It looks like the
 * payment failed, and the natural reaction is to pay again or ask for a refund.
 *
 * This closes the gap by:
 *   1. recognising the `checkout=return` marker,
 *   2. polling the plan until the webhook lands,
 *   3. confirming the upgrade by name, or explaining that it is still arriving.
 *
 * It never grants anything itself. Only the verified webhook does that, so a
 * visitor who fakes the query string sees nothing but a "still activating"
 * message.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { PLANS, isPlanId, type PlanId } from "@/config/plans";
import { PLAN_CHANGED, emitAppEvent } from "@/lib/app-events";
import { fetchRemainingUsage } from "@/services/generation";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils/cn";

/** How often to re-check the plan while waiting for the webhook. */
const POLL_INTERVAL_MS = 3000;

/**
 * How long to keep polling.
 *
 * Whop retries failed deliveries, and a slow webhook can take a minute. After
 * this the notice stops claiming to be "activating" and tells the buyer the
 * charge went through, so they are never left guessing.
 */
const POLL_TIMEOUT_MS = 120_000;

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

  useEffect(() => {
    if (!hasCheckoutReturnMarker()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    /**
     * Polls until the plan changes, the timeout passes, or we unmount.
     *
     * The phase is set only AFTER the first await, never synchronously in the
     * effect body: a synchronous `setState` there triggers a cascading render
     * (and React's lint rule rejects it). Deferring also means a buyer whose
     * plan is already active sees the confirmation directly, with no flash of
     * the "activating…" state first.
     */
    const poll = async () => {
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
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [readPlan]);

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
