"use client";

/**
 * Client-side route protection.
 *
 * Renders children only for authenticated users. Unauthenticated visitors are
 * redirected to /login, and the attempted path is preserved so they can be
 * returned to it after signing in.
 *
 * This is a UX guard, not a security boundary. Real enforcement happens in
 * Firestore Security Rules and in `requireUser()` on every protected API route.
 */
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || user) return;

    const target =
      pathname && pathname !== "/dashboard"
        ? `/login?next=${encodeURIComponent(pathname)}`
        : "/login";
    router.replace(target);
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-24">
        <p className="text-sm text-muted">Duke kontrolluar sesionin…</p>
      </div>
    );
  }

  if (!user) {
    // The redirect effect is already running; render nothing in the meantime.
    return null;
  }

  return <>{children}</>;
}
