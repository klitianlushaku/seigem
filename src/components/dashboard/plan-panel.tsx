"use client";

/**
 * Plan limits panel.
 *
 * Shows the user's plan and how much of each daily allowance remains. Values
 * come from the server (`GET /api/generate`), so the numbers reflect the real
 * counters rather than a client-side guess.
 */
import { PLANS, usePlanLimitRows, type PlanId } from "@/lib/plan-display";
import type { RemainingUsage } from "@/services/generation";
interface PlanPanelProps {
  planId: PlanId;
  remaining: RemainingUsage | null;
  /** True while the server values are still loading. */
  loading: boolean;
}

export function PlanPanel({ planId, remaining, loading }: PlanPanelProps) {
  const plan = PLANS[planId];
  const rows = usePlanLimitRows(planId, remaining);

  return (
    <section aria-labelledby="plan-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plan-heading" className="text-sm font-medium">
          Kufijtë ditorë
        </h2>
        <span className="rounded-md border border-line-strong px-2 py-0.5 text-xs">
          Plani {plan.name}
        </span>
      </div>

      <dl className="mt-3 space-y-3 text-sm">
        {rows.map((row) => {
          // A row is exhausted when the server says nothing remains.
          const exhausted = !loading && remaining !== null && row.remaining === 0;

          return (
            <div key={row.label}>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">{row.label}</dt>
                <dd className={exhausted ? "text-danger" : undefined}>
                  {loading
                    ? "…"
                    : remaining === null
                      ? `${row.limit} në ditë`
                      : `${row.remaining} nga ${row.limit}`}
                </dd>
              </div>

              {/* Simple proportional bar. No gradients, no animation. */}
              <div
                className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2"
                role="presentation"
              >
                <div
                  className={
                    exhausted
                      ? "h-full rounded-full bg-danger"
                      : "h-full rounded-full bg-accent"
                  }
                  style={{ width: `${row.percentRemaining}%` }}
                />
              </div>
            </div>
          );
        })}
      </dl>

      <p className="mt-3 text-xs text-muted">
        {loading
          ? "Duke lexuar kuotën…"
          : remaining === null
            ? "Kuota rifreskohet kur të nisë gjenerimi."
            : `Rifreskohet çdo ditë në mesnatë (UTC). Plani ${plan.name}.`}
      </p>
    </section>
  );
}
