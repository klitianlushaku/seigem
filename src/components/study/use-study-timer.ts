"use client";

/**
 * Active study-time timer.
 *
 * Accumulates the seconds a user actually spends studying and flushes them to
 * the server periodically.
 *
 * Only VISIBLE time counts: a tab left open in the background would otherwise
 * report hours of "study" the user never did.
 */
import { useEffect, useRef } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { reportStudyTime } from "@/services/study-time";

/** How often accumulated time is sent to the server. */
const FLUSH_INTERVAL_MS = 30_000;

/** How often the clock is sampled. */
const TICK_INTERVAL_MS = 5_000;

/**
 * Longest gap counted as activity. A bigger gap means the machine slept or the
 * tab was frozen, and that time should not be credited.
 */
const MAX_CREDITED_GAP_SECONDS = 90;

/**
 * Starts tracking while `enabled` is true.
 *
 * Tracking is best-effort: failures are logged and ignored, never surfaced, so
 * a network problem cannot interrupt studying.
 */
export function useStudyTimer(enabled: boolean): void {
  const { getIdToken } = useAuth();
  const pendingRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    /** Adds the elapsed time since the previous sample to the pending total. */
    const tick = () => {
      const now = Date.now();
      const previous = lastTickRef.current;
      lastTickRef.current = now;

      if (previous === null) return;

      const elapsed = Math.floor((now - previous) / 1000);
      if (elapsed > 0 && elapsed <= MAX_CREDITED_GAP_SECONDS) {
        pendingRef.current += elapsed;
      }
    };

    /** Sends whatever has accumulated. */
    const flush = async () => {
      const seconds = pendingRef.current;
      if (seconds < 1) return;

      pendingRef.current = 0;

      const token = await getIdToken();
      if (!token || cancelled) {
        // Put the time back so it is not lost on a transient failure.
        pendingRef.current += seconds;
        return;
      }

      await reportStudyTime(token, seconds);
    };

    lastTickRef.current = Date.now();
    const tickId = window.setInterval(tick, TICK_INTERVAL_MS);
    const flushId = window.setInterval(() => {
      tick();
      void flush();
    }, FLUSH_INTERVAL_MS);

    // Pause the clock when the tab is hidden, and flush on the way out.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        lastTickRef.current = Date.now();
      } else {
        tick();
        void flush();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(tickId);
      window.clearInterval(flushId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, getIdToken]);
}
