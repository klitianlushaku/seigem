"use client";

/**
 * Reads the signed-in user's current plan.
 *
 * The plan lives on the server (`users/{uid}.plan`), and several independent
 * parts of the shell need it: the sidebar shows it beside the logo, and the
 * pricing page uses it to stop someone buying what they already have. Reading it
 * separately in each place would mean duplicate requests and, worse, two
 * components disagreeing about the answer.
 *
 * So there is ONE subscription per page, shared by every caller through a module
 * level store. The first caller triggers the fetch; later callers attach to it.
 *
 * The plan is also re-read when `PLAN_CHANGED` fires, which is how the sidebar
 * badge updates itself after a checkout without a page reload.
 *
 * State is deliberately NOT cached across navigations: a user who upgrades in
 * another tab, or whose subscription lapses, should see the truth on the next
 * page load rather than a stale cached value.
 */
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { isPlanId, type PlanId } from "@/config/plans";
import { PLAN_CHANGED } from "@/lib/app-events";
import { fetchRemainingUsage } from "@/services/generation";

/** Result of reading the plan. `null` means "not known yet". */
type PlanState = PlanId | null;

/** Subscribers currently mounted, notified when the plan changes. */
const listeners = new Set<(plan: PlanState) => void>();

/** In-flight or completed read, shared so one page issues one request. */
let inFlight: Promise<PlanState> | null = null;

/** Publishes a new value to every mounted subscriber. */
function publish(plan: PlanState): void {
  for (const listener of listeners) listener(plan);
}

/**
 * Reads the plan once and shares the result.
 *
 * @param getIdToken Fresh-token getter from the auth context.
 */
async function loadPlan(
  getIdToken: () => Promise<string | null>,
): Promise<PlanState> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const token = await getIdToken();
      if (!token) return null;

      const usage = await fetchRemainingUsage(token);
      const value: unknown = usage?.plan;
      return isPlanId(value) ? value : null;
    } catch (error) {
      console.error("[plan] failed to read the current plan:", error);
      return null;
    } finally {
      // Allow a later refresh to fetch again.
      inFlight = null;
    }
  })();

  return inFlight;
}

/** The user's current plan, or null while unknown / signed out. */
export function usePlan(): {
  /** null while loading or signed out. */
  plan: PlanId | null;
  /** True until the first read settles. */
  loading: boolean;
  /** Re-reads the plan from the server. */
  refresh: () => void;
} {
  const { user, getIdToken } = useAuth();
  const [plan, setPlan] = useState<PlanState>(null);
  const [loading, setLoading] = useState(true);

  /** Reads the plan and republishes it to everyone. */
  const refresh = useCallback(() => {
    setLoading(true);
    void loadPlan(getIdToken).then((value) => {
      publish(value);
      setLoading(false);
    });
  }, [getIdToken]);

  useEffect(() => {
    // Signed out: there is no plan to read. The returned values are derived from
    // `user` below rather than written to state here — a synchronous setState in
    // an effect triggers a cascading render, and the React lint rule rejects it.
    if (!user) return;

    let cancelled = false;

    /** Attaches this component to the shared value. */
    const listener = (value: PlanState) => {
      if (!cancelled) {
        setPlan(value);
        setLoading(false);
      }
    };
    listeners.add(listener);

    void loadPlan(getIdToken).then((value) => {
      if (cancelled) return;
      publish(value);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, [user, getIdToken]);

  // Re-read after a checkout, so the badge and the pricing page both update.
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(PLAN_CHANGED, handler);
    return () => window.removeEventListener(PLAN_CHANGED, handler);
  }, [refresh]);

  // A signed-out visitor has no plan, whatever a previous session left behind.
  return user
    ? { plan, loading, refresh }
    : { plan: null, loading: false, refresh };
}
