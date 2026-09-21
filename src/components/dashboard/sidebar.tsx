"use client";

/**
 * Dashboard sidebar.
 *
 * Follows the ChatGPT / DeepSeek pattern rather than a plain menu: a primary
 * "Material i ri" action at the top, the two main destinations, then the list
 * of recent materials with when they were last touched, then the account-level
 * links and the upgrade card.
 *
 * Recent entries refresh whenever a material is created or deleted, via the
 * shared application event — no state library involved.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { useIsAdmin } from "@/components/admin/use-is-admin";
import {
  BookIcon,
  ChevronRightIcon,
  CrownIcon,
  FolderIcon,
  HelpIcon,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { usePlan } from "@/components/billing/use-plan";
import { DEFAULT_PLAN_ID, PLANS, type PlanId } from "@/config/plans";
import { HISTORY_CHANGED, NEW_MATERIAL, emitAppEvent } from "@/lib/app-events";
import { cn } from "@/lib/utils/cn";
import { relativeAlbanianDate } from "@/lib/utils/albanian-date";
import { fetchHistory, type StudySetSummary } from "@/services/history";

/** How many recent materials the rail lists before deferring to /materialet. */
const MAX_RECENT = 6;

/** Small chip naming a paid plan beside the wordmark. */
function PlanBadge({ plan }: { plan: PlanId }) {
  const isPro = plan === "pro";

  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase leading-3 tracking-[0.08em]",
        isPro
          ? "bg-stat-orange/18 text-stat-orange"
          : "bg-accent/18 text-accent",
      )}
    >
      {PLANS[plan].name}
    </span>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, getIdToken } = useAuth();
  const { plan: currentPlan } = usePlan();
  const isAdmin = useIsAdmin();
  const pathname = usePathname();
  const router = useRouter();

  const [items, setItems] = useState<StudySetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Read from the URL rather than `useSearchParams`, which would require a
  // Suspense boundary around the whole dashboard layout.
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) {
      setLoading(false);
      return { ok: false as const, items: [] as StudySetSummary[] };
    }

    const result = await fetchHistory(token);
    if (!result.ok) return { ok: false as const, items: [] as StudySetSummary[] };
    return { ok: true as const, items: result.data.studySets };
  }, [getIdToken]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const outcome = await load();
      if (cancelled) return;
      setItems(outcome.items);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  // Refresh when a material is created or removed.
  useEffect(() => {
    const handler = () => {
      void (async () => {
        const outcome = await load();
        setItems(outcome.items);
      })();
    };

    window.addEventListener(HISTORY_CHANGED, handler);
    return () => window.removeEventListener(HISTORY_CHANGED, handler);
  }, [load]);

  // Track which material is open, for highlighting.
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveId(params.get("id"));
    };
    sync();
  }, [pathname]);

  const recent = items.slice(0, MAX_RECENT);

  // exactOptionalPropertyTypes rejects an explicit undefined handler, so the
  // click handler is spread in only when one was provided.
  const navProps = onNavigate ? { onClick: onNavigate } : {};

  /** Shared classes for a primary destination row. */
  const navRowClass = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
      active
        ? "bg-accent/15 text-accent"
        : "text-muted hover:bg-surface-2 hover:text-content",
    );

  /** The plan to show beside the wordmark; free while it is still unknown. */
  const plan: PlanId = currentPlan ?? DEFAULT_PLAN_ID;
  const hasPaidPlan = plan === "plus" || plan === "pro";

  return (
    <div className="dash-panel flex h-full flex-col border-y-0 border-l-0">
      {/* Brand: mark, wordmark with the plan, then the tagline underneath. */}
      <div className="flex items-start gap-2.5 px-3.5 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <BookIcon size={16} />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15px] font-semibold leading-5 tracking-tight">
              Seigem
            </span>
            {/*
              The plan sits with the wordmark, so a paying user can see which
              plan they are on without opening the account menu. Only shown for
              paid plans: a "Falas" badge would be noise on the free tier.
            */}
            {hasPaidPlan ? <PlanBadge plan={plan} /> : null}
          </span>
          <span className="mt-0.5 block text-[10px] leading-3.5 text-muted">
            {hasPaidPlan
              ? `${PLANS[plan].name} — ${PLANS[plan].priceLabel} ${PLANS[plan].periodLabel}`
              : "Mëso më mirë, arrij më shumë."}
          </span>
        </span>
      </div>

      {/* New material: the primary action, filled blue as in the reference. */}
      <div className="px-3">
        <button
          type="button"
          onClick={() => {
            if (!user) {
              router.push(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
              return;
            }

            // Reset the uploader wherever we are, then make sure it is visible.
            emitAppEvent(NEW_MATERIAL);
            if (onNavigate) onNavigate();
            if (pathname !== "/dashboard") {
              router.push("/dashboard#ngarko");
            } else {
              document
                .getElementById("ngarko")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-soft"
        >
          <PlusIcon size={17} />
          Material i ri
        </button>
      </div>

      {/* Primary destinations */}
      <nav aria-label="Navigimi kryesor" className="mt-3 space-y-0.5 px-2">
        <Link
          href="/dashboard"
          {...navProps}
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          className={navRowClass(pathname === "/dashboard")}
        >
          <HomeIcon size={16} />
          Kreu
        </Link>
        <Link
          href="/materialet"
          {...navProps}
          aria-current={pathname === "/materialet" ? "page" : undefined}
          className={navRowClass(pathname === "/materialet")}
        >
          <FolderIcon size={16} />
          Materialet e mia
        </Link>
      </nav>

      {/* Recent materials */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <p className="px-3.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          Materialet e fundit
        </p>

        <nav
          aria-label="Materialet e fundit"
          className="mt-1.5 min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        >
          {loading ? (
            <p className="px-2 py-2 text-xs text-muted">Duke lexuar…</p>
          ) : recent.length === 0 ? (
            /*
             * A signed-out visitor has no materials by definition, so telling
             * them "you have none yet" is noise. They get an invitation to sign
             * in instead, which is the only action available to them.
             */
            <p className="px-2 py-2 text-xs leading-5 text-muted">
              {user ? (
                "Nuk ka materiale ende. Ngarko një dokument për të filluar."
              ) : (
                <>
                  Hyr për të ruajtur materialet e tua.{" "}
                  <Link
                    href="/login?next=%2Fdashboard"
                    {...navProps}
                    className="text-accent hover:underline"
                  >
                    Fillo tani
                  </Link>
                </>
              )}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {recent.map((item) => {
                const active = activeId === item.id;
                return (
                  <li key={item.id}>
                    <Link
                      href={`/studim?id=${encodeURIComponent(item.id)}`}
                      {...navProps}
                      aria-current={active ? "page" : undefined}
                      title={item.title}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                        active
                          ? "bg-accent/15 text-accent"
                          : "text-muted hover:bg-surface-2 hover:text-content",
                      )}
                    >
                      <FolderIcon size={15} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px]">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-3.5 text-muted">
                          {relativeAlbanianDate(item.updatedAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="px-3.5 pb-2">
          <Link
            href="/materialet"
            {...navProps}
            className="block text-xs font-medium text-accent hover:underline"
          >
            Shiko të gjitha →
          </Link>
        </div>
      </div>

      {/* Account links */}
      <div className="mt-auto border-t border-line px-2 py-2.5">
        <nav aria-label="Llogaria" className="space-y-0.5">
          <Link
            href="/cmimet"
            {...navProps}
            aria-current={pathname === "/cmimet" ? "page" : undefined}
            className={navRowClass(pathname === "/cmimet")}
          >
            <CrownIcon size={16} />
            Plani im
          </Link>
          <Link
            href="/cilesimet"
            {...navProps}
            aria-current={pathname === "/cilesimet" ? "page" : undefined}
            className={navRowClass(pathname === "/cilesimet")}
          >
            <SettingsIcon size={16} />
            Cilësimet
          </Link>
          <Link
            href="/ndihme"
            {...navProps}
            aria-current={pathname === "/ndihme" ? "page" : undefined}
            className={navRowClass(pathname === "/ndihme")}
          >
            <HelpIcon size={16} />
            Ndihmë &amp; Mbështetje
          </Link>
          {/*
            Shown only to admins. Purely cosmetic — /admin and every admin API
            route re-check the allow-list on the server, so hiding this link is
            convenience, not security. Rendered only once the answer is known, to
            avoid the link appearing and then vanishing.
          */}
          {isAdmin === true ? (
            <Link
              href="/admin"
              {...navProps}
              aria-current={pathname === "/admin" ? "page" : undefined}
              className={navRowClass(pathname === "/admin")}
            >
              <ShieldIcon size={16} />
              Administrimi
            </Link>
          ) : null}
        </nav>

        {/* Upgrade card */}
        <Link
          href="/cmimet"
          {...navProps}
          className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-stat-orange/30 bg-stat-orange/10 px-2.5 py-2.5 transition-colors hover:border-stat-orange/50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stat-orange/20 text-stat-orange">
            <CrownIcon size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-content">
              Bëhu Pro
            </span>
            <span className="mt-0.5 block text-[10px] leading-3.5 text-muted">
              Zbuloje me shumë mundësi
            </span>
          </span>
          <ChevronRightIcon size={15} className="shrink-0 text-muted" />
        </Link>

        {/*
          Legal links. Required to be reachable before a purchase, and a buyer
          looking for the terms should not have to guess a URL.
        */}
        <nav
          aria-label="Informacione ligjore"
          className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--color-line)] px-1 pt-3 text-[11px]"
        >
          <Link
            href="/kushtet"
            {...navProps}
            className="text-muted transition-colors hover:text-content"
          >
            Kushtet
          </Link>
          <Link
            href="/privatesia"
            {...navProps}
            className="text-muted transition-colors hover:text-content"
          >
            Privatësia
          </Link>
        </nav>
      </div>
    </div>
  );
}
