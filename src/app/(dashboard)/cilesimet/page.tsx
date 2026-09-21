"use client";

/**
 * `/cilesimet` — account settings.
 *
 * Shows the signed-in identity, the active plan, a REAL usage breakdown for
 * today (what each allowance has left, read from the server), what Seigem does
 * and does not store, and the sign-out action.
 *
 * The usage figures come from the same endpoint the generator enforces against,
 * so what is displayed here is exactly what will be allowed — not an estimate.
 * No password management is offered because authentication is delegated
 * entirely to Google via Firebase, and Seigem never stores credentials.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/components/auth/auth-provider";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast } from "@/components/ui/toast";
import { DEFAULT_PLAN_ID, getPlan, type PlanId } from "@/config/plans";
import {
  fetchRemainingUsage,
  type RemainingUsage,
  type SubscriptionStatus,
} from "@/services/generation";

export default function SettingsPage() {
  const { user, getIdToken, signOut, pending } = useAuth();
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN_ID);
  const [remaining, setRemaining] = useState<RemainingUsage | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [cancelPending, setCancelPending] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  /** Controls the in-app confirmation dialog. */
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Read the plan and today's real allowance once. State is applied in a
  // microtask rather than synchronously in the effect body, which React flags
  // as a cascading render.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await getIdToken();
      if (cancelled) return;

      if (!token) {
        setLoading(false);
        return;
      }

      const usage = await fetchRemainingUsage(token);
      if (cancelled) return;

      if (usage) {
        setPlanId(usage.plan);
        setRemaining(usage.remaining);
        setSubscription(usage.subscription ?? null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [getIdToken]);

  const plan = getPlan(planId);

  /**
   * Archives the cancellation error message for a stale subscription link.
   *
   * Kept separate from `billingError` so the UI can hide the cancel button once
   * the server reports that the stored link was cleared — otherwise the customer
   * keeps being offered an action that can never work.
   */
  const [linkCleared, setLinkCleared] = useState(false);

  const cancelSubscription = async () => {
    if (subscription?.cancelAtPeriodEnd) return;

    setConfirmOpen(false);
    setBillingError(null);
    setBillingNotice(null);
    setCancelPending(true);

    try {
      const token = await getIdToken();
      if (!token) {
        setBillingError("Sesioni ka skaduar. Hyr përsëri.");
        return;
      }

      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json()) as {
        cancelAtPeriodEnd?: boolean;
        planExpiresAt?: string | null;
        alreadyScheduled?: boolean;
        error?: { code?: string; message?: string };
      };

      if (!response.ok || !payload.cancelAtPeriodEnd) {
        setBillingError(
          payload.error?.message ??
            "Nuk mund ta anulojmë abonimin. Provo përsëri.",
        );
        // The server clears a subscription link Whop does not recognise, so the
        // account no longer has a cancellable subscription at all.
        if (payload.error?.code === "not_found") setLinkCleared(true);
        return;
      }

      /*
       * A missing end date is normal, not a failure: Whop reports
       * `current_period_end: null` for these memberships. The cancellation
       * itself succeeded, so it is reported as such.
       */
      setSubscription((current) =>
        current
          ? {
              ...current,
              cancelAtPeriodEnd: true,
              planExpiresAt: payload.planExpiresAt ?? current.planExpiresAt,
            }
          : current,
      );

      setBillingNotice(
        payload.planExpiresAt
          ? `Abonimi u anulua. Plani mbetet aktiv deri më ${formatDate(payload.planExpiresAt)}.`
          : "Abonimi u anulua dhe nuk do të rinovohet. Plani mbetet aktiv deri në fund të periudhës që ke paguar.",
      );
    } catch (unexpected) {
      console.error("[settings] cancellation failed:", unexpected);
      setBillingError("Nuk mund ta anulojmë abonimin. Provo përsëri.");
    } finally {
      setCancelPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cilësimet</h1>
        <p className="mt-1 text-sm text-muted">
          Llogaria, plani dhe privatësia.
        </p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold">Llogaria</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Emri</dt>
            <dd className="truncate">{user?.displayName ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Email</dt>
            <dd className="truncate">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Hyrja</dt>
            <dd>Google</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Fjalëkalimi nuk ruhet — vërtetimi bëhet nga Google.
        </p>
      </Card>

      {/* --- Plan and REAL usage ------------------------------------------ */}
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Plani dhe përdorimi</h2>
          <Link
            href="/cmimet"
            className="text-xs font-medium text-accent hover:underline"
          >
            Ndrysho planin
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">
            <span className="font-medium">{plan.name}</span>
            <span className="ml-2 text-muted">
              {plan.priceLabel}
              {plan.priceCents > 0 ? ` / ${plan.periodLabel}` : ""}
            </span>
          </p>
          <p className="text-xs text-muted">Rifreskohet çdo ditë</p>
        </div>

        {plan.priceCents > 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
            <p className="text-sm font-medium">
              {subscription?.cancelAtPeriodEnd
                ? "Abonimi anulohet në fund të periudhës"
                : "Menaxhimi i abonimit"}
            </p>
            {subscription?.planExpiresAt ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  Aktiv deri më {formatDate(subscription.planExpiresAt)}
                </p>
                <SubscriptionCountdown expiresAt={subscription.planExpiresAt} />
              </>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Plani yt Pro është aktiv. Afati i periudhës do të shfaqet pasi
                të konfirmohet nga Whop.
              </p>
            )}
            {subscription?.cancelAtPeriodEnd ? (
              <p className="mt-2 text-xs text-stat-orange">
                Plani yt mbetet aktiv deri në këtë datë. Nuk do të ketë rinovim tjetër.
              </p>
            ) : !subscription?.hasSubscription || linkCleared ? (
              /*
                No cancellable subscription is linked to this account: either one
                was never recorded, or the stored link was stale and the server
                cleared it. The button is hidden rather than offered, because
                there is nothing for it to act on. Retrying a stale link can
                never succeed.
              */
              <p className="mt-2 text-xs leading-5 text-muted">
                Ky abonim nuk është i lidhur me Whop, kështu që nuk mund të
                anulohet nga këtu. Shkruaj në mbështetje dhe e rregullojmë.
              </p>
            ) : (
              <Button
                variant="secondary"
                className="mt-3 border-danger/50 text-danger hover:border-danger"
                onClick={() => setConfirmOpen(true)}
                disabled={cancelPending}
              >
                {cancelPending ? "Duke anuluar…" : "Anulo abonimin"}
              </Button>
            )}
          </div>
        ) : null}

        {billingError ? <div className="mt-3"><Alert>{billingError}</Alert></div> : null}
        {billingNotice ? (
          <Toast tone="success" onDismiss={() => setBillingNotice(null)}>
            {billingNotice}
          </Toast>
        ) : null}

        <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Të mbetura sot
        </h3>

        <ul className="mt-2.5 space-y-3">
          <UsageMeter
            label="Dokumente"
            tone="blue"
            used={usedOf(plan.limits.documentsPerDay, remaining?.documents)}
            limit={plan.limits.documentsPerDay}
            loading={loading}
          />
          <UsageMeter
            label="Flashcards"
            tone="green"
            used={usedOf(plan.limits.flashcardsPerDay, remaining?.flashcards)}
            limit={plan.limits.flashcardsPerDay}
            loading={loading}
          />
          <UsageMeter
            label="Pyetje kuizi"
            tone="orange"
            used={usedOf(
              plan.limits.quizQuestionsPerDay,
              remaining?.quizQuestions,
            )}
            limit={plan.limits.quizQuestionsPerDay}
            loading={loading}
          />
        </ul>

        <p className="mt-3 text-xs text-muted">
          Kufijtë rimbushen automatikisht nesër. Përmirëso planin për më shumë
          materiale në ditë.
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold">Privatësia</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>• Skedarët e ngarkuar nuk ruhen — lexohen vetëm në browser.</li>
          <li>• Teksti i nxjerrë nga dokumenti nuk ruhet.</li>
          <li>• Ruhen vetëm titulli dhe përmbajtja e gjeneruar.</li>
          <li>• Historiku shfaq vetëm përmbajtjen e ruajtur, jo dokumentin.</li>
        </ul>
      </Card>

      {billingNotice ? (
        <Toast tone="success" onDismiss={() => setBillingNotice(null)}>
          {billingNotice}
        </Toast>
      ) : null}

      <Card>
        <h2 className="text-sm font-semibold">Sesioni</h2>
        <p className="mt-2 text-sm text-muted">
          Shkëputu nga llogaria në këtë pajisje.
        </p>
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() => void signOut()}
            disabled={pending}
          >
            {pending ? "Duke u shkëputur…" : "Shkëputu"}
          </Button>
        </div>
      </Card>

      {/*
        Confirmation for cancelling, in place of `window.confirm`. That dialog is
        browser chrome: it shows the origin, cannot be styled or translated, and
        looks borrowed. Cancelling a paid subscription deserves the app's own UI.
      */}
      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        title="Anulo abonimin?"
        confirmLabel="Anulo abonimin"
        cancelLabel="Jo, mbaje"
        onConfirm={() => void cancelSubscription()}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>
          Abonimi nuk do të rinovohet. Plani mbetet aktiv deri në fund të
          periudhës që ke paguar, dhe mund ta rifillosh në çdo moment.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("sq-AL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function SubscriptionCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <p className="mt-3 text-lg font-semibold tabular-nums text-accent">
      {days} ditë, {hours} orë, {minutes} min, {seconds} sek
    </p>
  );
}

/**
 * How much of an allowance has been spent.
 *
 * Derived from the remaining figure rather than tracked separately, so the two
 * can never disagree. When usage is unknown (not loaded yet) nothing is
 * reported as used, which avoids flashing a misleading full bar.
 */
function usedOf(limit: number, remaining: number | undefined): number | null {
  if (remaining === undefined) return null;
  if (!Number.isFinite(remaining)) return null;
  return Math.min(limit, Math.max(0, limit - remaining));
}

/** One allowance row: label, "used / limit", a bar and what is left. */
function UsageMeter({
  label,
  tone,
  used,
  limit,
  loading,
}: {
  label: string;
  tone: "blue" | "green" | "orange";
  used: number | null;
  limit: number;
  loading: boolean;
}) {
  const spent = used ?? 0;
  const left = used === null ? limit : Math.max(0, limit - spent);
  const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
  const exhausted = !loading && used !== null && left === 0;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">
          {loading || used === null ? "…" : `${spent} / ${limit}`}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <span
            className={`block h-full rounded-full ${BAR_TONES[tone]}`}
            style={{ width: `${loading ? 0 : percent}%` }}
          />
        </span>
        <span
          className={
            exhausted
              ? "shrink-0 text-[10px] tabular-nums text-danger"
              : "shrink-0 text-[10px] tabular-nums text-muted"
          }
        >
          {loading || used === null
            ? ""
            : exhausted
              ? "0 të mbetura"
              : `${left} të mbetura`}
        </span>
      </div>
    </li>
  );
}

const BAR_TONES = {
  blue: "bg-stat-blue",
  green: "bg-stat-green",
  orange: "bg-stat-orange",
} as const;
