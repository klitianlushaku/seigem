"use client";

/**
 * Pricing page.
 *
 * Displays the three plans with their prices and daily usage limits, and
 * offers an upgrade action for the paid tiers.
 *
 * Everything the customer reads is in Albanian. No gradients, no decorative
 * graphics, no marketing statistics.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MERCHANT_OF_RECORD } from "@/config/app";
import { PLAN_ORDER, getPlan, type PlanId } from "@/config/plans";

/** A single plan's usage limits, in Albanian. */
function limitRows(planId: PlanId): Array<{ label: string; value: string }> {
  const { limits } = getPlan(planId);
  return [
    { label: "Dokumente në ditë", value: String(limits.documentsPerDay) },
    { label: "Flashcards në ditë", value: String(limits.flashcardsPerDay) },
    { label: "Pyetje kuizi në ditë", value: String(limits.quizQuestionsPerDay) },
  ];
}

/** Feature notes shown under each plan's limits. */
const PLAN_NOTES: Record<PlanId, string> = {
  free: "Për të provuar Seigem pa pagesë.",
  plus: "Për përdorim të rregullt gjatë studimeve.",
  pro: "Për përdorim intensiv dhe materiale të mëdha.",
};

export default function PricingPage() {
  const { user, getIdToken } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upgrade = useCallback(
    async (plan: PlanId) => {
      setError(null);

      if (!user) {
        // Not signed in: send them to log in first, returning here after.
        router.push("/login?next=%2Fcmimet");
        return;
      }

      setPending(plan);
      try {
        const token = await getIdToken();
        if (!token) {
          setError("Sesioni ka skaduar. Hyr përsëri.");
          return;
        }

        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ plan }),
        });

        const payload = (await response.json()) as {
          checkoutUrl?: string;
          error?: { message?: string };
        };

        if (!response.ok || !payload.checkoutUrl) {
          setError(
            payload.error?.message ??
              "Nuk mund të nisim pagesën. Provo përsëri.",
          );
          return;
        }

        // Hand off to Whop's hosted checkout. This is an EXTERNAL URL, so a
        // full navigation is correct here (unlike internal Next.js routes,
        // which must use the router).
        window.location.href = payload.checkoutUrl;
      } catch (unexpected) {
        console.error("[pricing] checkout failed:", unexpected);
        setError("Ndodh një gabim i papritur. Provo përsëri.");
      } finally {
        setPending(null);
      }
    },
    [user, getIdToken, router],
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Çmimet</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Të gjitha planet përfshijnë përmbledhje, flashcards dhe kuize. Kufijtë
          rivendosen çdo ditë.
        </p>
      </header>

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = getPlan(planId);
          const isPaid = plan.priceCents > 0;

          return (
            <Card key={planId} className="flex flex-col">
              <h2 className="text-base font-medium">{plan.name}</h2>

              <p className="mt-3">
                <span className="text-3xl font-semibold tracking-tight">
                  {plan.priceLabel}
                </span>
                <span className="ml-2 text-sm text-muted">
                  {plan.periodLabel}
                </span>
              </p>

              <p className="mt-2 text-sm text-muted">{PLAN_NOTES[planId]}</p>

              <dl className="mt-5 flex-1 space-y-2 border-t border-line pt-4 text-sm">
                {limitRows(planId).map((row) => (
                  <div key={row.label} className="flex justify-between gap-4">
                    <dt className="text-muted">{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5">
                {isPaid ? (
                  <Button
                    onClick={() => void upgrade(planId)}
                    disabled={pending !== null}
                    className="w-full"
                  >
                    {pending === planId ? "Duke u hapur…" : "Përmirëso planin"}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      router.push(user ? "/dashboard" : "/login");
                    }}
                    className="w-full"
                  >
                    {user ? "Vazhdo falas" : "Fillo falas"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/*
        Merchant-of-record notice plus links to the legal pages. Both are
        expected where subscriptions are sold: the buyer has to be able to read
        the terms and the privacy policy BEFORE paying, and Whop's guidance asks
        for its name to be visible next to the price.
      */}
      <p className="text-xs leading-5 text-muted">
        Pagesat përpunohen nga {MERCHANT_OF_RECORD}, i cili vepron si tregtar i
        regjistruar (merchant of record) dhe trajton faturat, taksat dhe
        rimbursimet. Plani aktivizohet vetëm pasi pagesa konfirmohet. Mund ta
        anulosh abonimin në çdo moment; abonimi mbetet aktiv deri në fund të
        periudhës së paguar.
      </p>

      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Link href="/kushtet" className="text-muted hover:text-content hover:underline">
          Kushtet e përdorimit
        </Link>
        <Link
          href="/privatesia"
          className="text-muted hover:text-content hover:underline"
        >
          Politika e privatësisë
        </Link>
      </nav>
    </div>
  );
}
