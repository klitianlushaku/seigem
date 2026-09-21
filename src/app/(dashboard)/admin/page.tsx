"use client";

/**
 * Admin panel: every account on the platform, with its subscription state, and
 * the controls to change a plan or cancel a subscription.
 *
 * SECURITY
 * --------
 * This page holds no authority. All of it lives on the server: `/api/admin/*`
 * calls `requireAdmin`, which verifies the caller's Firebase token AND that
 * their uid is on the `ADMIN_UIDS` allow-list, and answers 404 to anyone else.
 * So navigating here without permission simply renders "not found", and forging
 * a request from the console fails identically.
 *
 * Every action is confirmed before it runs. Changing a plan grants paid access
 * for free, and cancelling touches a customer's billing, so neither should be a
 * single mis-click away.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/components/auth/auth-provider";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast } from "@/components/ui/toast";
import { PLANS, type PlanId } from "@/config/plans";
import { cn } from "@/lib/utils/cn";

/** One account, as returned by `/api/admin/users`. */
interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  plan: PlanId;
  planExpiresAt: string | null;
  planExpired: boolean;
  whopSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string | null;
  usage: {
    dayKey: string;
    documents: number;
    flashcards: number;
    quizQuestions: number;
  };
}

/** How long a manual grant lasts. `null` means it never lapses. */
const DURATIONS: readonly { label: string; days: number | null }[] = [
  { label: "30 ditë", days: 30 },
  { label: "90 ditë", days: 90 },
  { label: "1 vit", days: 365 },
  { label: "Pa afat", days: null },
];

/** Formats an ISO timestamp as an Albanian date. */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("sq-AL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Coloured chip naming a plan. */
function PlanChip({ plan, expired }: { plan: PlanId; expired: boolean }) {
  const paid = plan !== "free";

  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
        expired
          ? "bg-danger/15 text-danger"
          : plan === "pro"
            ? "bg-stat-orange/18 text-stat-orange"
            : paid
              ? "bg-accent/18 text-accent"
              : "bg-surface-2 text-muted",
      )}
    >
      {PLANS[plan].name}
      {expired ? " (skaduar)" : ""}
    </span>
  );
}

export default function AdminPage() {
  const { getIdToken } = useAuth();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");

  /** uid currently being changed, so its row can disable its controls. */
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** The action awaiting confirmation. */
  const [confirming, setConfirming] = useState<
    | { kind: "plan"; user: AdminUser; plan: PlanId; days: number | null }
    | { kind: "cancel"; user: AdminUser }
    | null
  >(null);

  /** Per-row grant duration, defaulting to 30 days. */
  const [durations, setDurations] = useState<Record<string, number | null>>({});

  const load = useCallback(async () => {
    const token = await getIdToken();

    if (!token) {
      setLoadError("Sesioni ka skaduar. Hyr përsëri.");
      return;
    }

    /*
     * Cleared once we have a token, and before the request.
     *
     * The auth provider can hand back no token on the very first render while
     * Firebase is still initialising, and the effect re-runs when it becomes
     * available. Without this, that first miss left "Sesioni ka skaduar" on
     * screen for the rest of the visit — visible even with the accounts loaded
     * and working, which is how it was spotted.
     */
    setLoadError(null);

    try {
      const response = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      // The server answers 404 to a non-admin — the same response an unknown
      // route gives, so the endpoint's existence is not confirmed.
      if (response.status === 404) {
        setForbidden(true);
        return;
      }

      const payload = (await response.json()) as {
        users?: AdminUser[];
        error?: { message?: string };
      };

      if (!response.ok) {
        setLoadError(payload.error?.message ?? "Nuk mund t'i lexojmë llogaritë.");
        return;
      }

      setUsers(payload.users ?? []);
    } catch {
      setLoadError("Nuk mund të lidhemi me serverin.");
    }
  }, [getIdToken]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Runs an admin action and refreshes the list. */
  const run = useCallback(
    async (user: AdminUser, body: Record<string, unknown>, success: string) => {
      setPendingUid(user.uid);
      setError(null);
      setNotice(null);

      try {
        const token = await getIdToken();
        if (!token) {
          setError("Sesioni ka skaduar. Hyr përsëri.");
          return;
        }

        const response = await fetch(`/api/admin/users/${user.uid}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        const payload = (await response.json()) as {
          error?: { message?: string };
        };

        if (!response.ok) {
          setError(payload.error?.message ?? "Veprimi dështoi.");
          return;
        }

        setNotice(success);
        await load();
      } catch {
        setError("Nuk mund të lidhemi me serverin.");
      } finally {
        setPendingUid(null);
      }
    },
    [getIdToken, load],
  );

  /** Confirms and performs the pending action. */
  const confirmAction = useCallback(async () => {
    const action = confirming;
    setConfirming(null);
    if (!action) return;

    if (action.kind === "plan") {
      await run(
        action.user,
        { action: "set_plan", plan: action.plan, days: action.days },
        `${action.user.email ?? action.user.uid} → ${PLANS[action.plan].name}`,
      );
      return;
    }

    await run(
      action.user,
      { action: "cancel_subscription" },
      `Abonimi i ${action.user.email ?? action.user.uid} u anulua në fund të periudhës.`,
    );
  }, [confirming, run]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return users;

    return users.filter(
      (user) =>
        (user.email ?? "").toLowerCase().includes(needle) ||
        (user.displayName ?? "").toLowerCase().includes(needle) ||
        user.uid.toLowerCase().includes(needle),
    );
  }, [users, query]);

  const counts = useMemo(() => {
    const list = users ?? [];
    return {
      total: list.length,
      paid: list.filter((u) => u.plan !== "free" && !u.planExpired).length,
      free: list.filter((u) => u.plan === "free" || u.planExpired).length,
      sources: list.filter((u) => u.whopSubscriptionId).length,
    };
  }, [users]);

  // --- Not an admin -------------------------------------------------------
  if (forbidden) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <h1 className="text-lg font-semibold">Faqja nuk u gjet</h1>
        <p className="mt-2 text-sm text-muted">
          Kjo faqe nuk ekziston ose nuk ke akses në të.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
        >
          Kthehu në kreu →
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Administrimi</h1>
        <p className="mt-1 text-sm text-muted">
          Të gjitha llogaritë, planet dhe abonimet.
        </p>
      </div>

      {loadError ? <Alert>{loadError}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {/* Counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Llogari gjithsej", value: counts.total, tone: "text-content" },
          { label: "Me plan të paguar", value: counts.paid, tone: "text-stat-orange" },
          { label: "Falas / skaduar", value: counts.free, tone: "text-muted" },
          { label: "Me abonim në Whop", value: counts.sources, tone: "text-accent" },
        ].map((stat) => (
          <div key={stat.label} className="dash-tile rounded-2xl p-3.5">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted">
              {stat.label}
            </p>
            <p className={cn("mt-1.5 text-2xl font-semibold", stat.tone)}>
              {users === null ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div>
        <label htmlFor="admin-search" className="sr-only">
          Kërko llogari
        </label>
        <input
          id="admin-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Kërko sipas emailit, emrit ose ID-së…"
          className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-content outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
      </div>

      {/* Users */}
      {users === null ? (
        <Card>
          <p className="text-sm text-muted">Duke lexuar llogaritë…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Asnjë llogari nuk përputhet.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((user) => {
            const days = durations[user.uid] ?? 30;
            const busy = pendingUid === user.uid;

            return (
              <li key={user.uid}>
                <Card className="p-4">
                  {/* Identity */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {user.email ?? "(pa email)"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {user.displayName ? `${user.displayName} · ` : ""}
                        <span className="font-mono">{user.uid.slice(0, 12)}…</span>
                        {user.createdAt ? ` · u regjistrua ${formatDate(user.createdAt)}` : ""}
                      </p>
                    </div>
                    <PlanChip plan={user.plan} expired={user.planExpired} />
                  </div>

                  {/* Subscription state */}
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-muted">Skadon</dt>
                      <dd className="mt-0.5 text-content">
                        {user.plan === "free" ? "—" : formatDate(user.planExpiresAt)}
                        {user.plan !== "free" && user.planExpiresAt === null ? (
                          <span className="text-stat-orange"> pa afat</span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Abonimi</dt>
                      <dd className="mt-0.5 truncate font-mono text-content">
                        {user.whopSubscriptionId ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Rinovohet</dt>
                      <dd className="mt-0.5 text-content">
                        {user.whopSubscriptionId
                          ? user.cancelAtPeriodEnd
                            ? "Jo, anuluar"
                            : "Po"
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Sot</dt>
                      <dd className="mt-0.5 text-content">
                        {user.usage.documents} dok · {user.usage.flashcards} kart ·{" "}
                        {user.usage.quizQuestions} kui
                      </dd>
                    </div>
                  </dl>

                  {/* Controls */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
                    <label
                      htmlFor={`duration-${user.uid}`}
                      className="text-xs text-muted"
                    >
                      Kohëzgjatja
                    </label>
                    <select
                      id={`duration-${user.uid}`}
                      value={days === null ? "none" : String(days)}
                      disabled={busy}
                      onChange={(event) =>
                        setDurations((current) => ({
                          ...current,
                          [user.uid]:
                            event.target.value === "none"
                              ? null
                              : Number(event.target.value),
                        }))
                      }
                      className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content outline-none focus:border-accent"
                    >
                      {DURATIONS.map((option) => (
                        <option
                          key={option.label}
                          value={option.days === null ? "none" : String(option.days)}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <span className="mx-1 hidden h-4 w-px bg-[var(--color-line)] sm:block" />

                    {(["free", "plus", "pro"] as const).map((plan) => {
                      const isCurrent = user.plan === plan && !user.planExpired;
                      return (
                        <Button
                          key={plan}
                          variant={isCurrent ? "primary" : "secondary"}
                          disabled={busy || isCurrent}
                          onClick={() =>
                            setConfirming({
                              kind: "plan",
                              user,
                              plan,
                              // Free has no duration; only paid grants expire.
                              days: plan === "free" ? null : days,
                            })
                          }
                          className="px-3 py-1.5 text-xs"
                        >
                          {PLANS[plan].name}
                        </Button>
                      );
                    })}

                    {user.whopSubscriptionId ? (
                      <Button
                        variant="secondary"
                        disabled={busy || user.cancelAtPeriodEnd}
                        onClick={() => setConfirming({ kind: "cancel", user })}
                        className="ml-auto border-danger/50 px-3 py-1.5 text-xs text-danger hover:border-danger"
                      >
                        {user.cancelAtPeriodEnd ? "Anuluar" : "Anulo abonimin"}
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {notice ? (
        <Toast tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Toast>
      ) : null}

      {/* Confirmation for the action in flight */}
      <ConfirmDialog
        open={confirming !== null}
        tone={confirming?.kind === "cancel" || confirming?.plan === "free" ? "danger" : "primary"}
        title={
          confirming?.kind === "cancel"
            ? "Anulo abonimin?"
            : `Ndrysho planin në ${confirming ? PLANS[confirming.plan].name : ""}?`
        }
        confirmLabel={confirming?.kind === "cancel" ? "Anulo abonimin" : "Ndrysho planin"}
        onConfirm={() => void confirmAction()}
        onCancel={() => setConfirming(null)}
      >
        {confirming?.kind === "cancel" ? (
          <p>
            Abonimi i {confirming.user.email ?? confirming.user.uid} nuk do të
            rinovohet. Llogaria e mban planin deri në fund të periudhës së paguar.
          </p>
        ) : confirming ? (
          <p>
            {confirming.user.email ?? confirming.user.uid} do të kalojë në{" "}
            <strong>{PLANS[confirming.plan].name}</strong>
            {confirming.plan === "free"
              ? ", duke hequr menjëherë aksesin e paguar."
              : confirming.days === null
                ? " pa afat — plani nuk do të skadojë kurrë."
                : ` për ${confirming.days} ditë.`}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
