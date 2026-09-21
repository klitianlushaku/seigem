"use client";

/**
 * Reports whether the signed-in user is an admin.
 *
 * Used only to decide whether to SHOW the admin link. It is not a security
 * control: every admin endpoint independently verifies the caller with
 * `requireAdmin`, so hiding the link is cosmetic and the server refuses
 * regardless of what this returns.
 *
 * `null` means "not known yet", which lets the UI avoid rendering the link and
 * then removing it.
 */
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";

export function useIsAdmin(): boolean | null {
  const { user, getIdToken } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      /*
       * Everything happens after an `await`, so no state is set synchronously
       * during the effect — which the React Compiler rejects, and which would
       * also flag a state update for a component that may already have unmounted.
       */
      const token = user ? await getIdToken() : null;
      if (cancelled) return;

      if (!token) {
        setIsAdmin(false);
        return;
      }

      try {
        const response = await fetch("/api/admin/session", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as { isAdmin?: boolean };
        if (!cancelled) setIsAdmin(payload.isAdmin === true);
      } catch {
        // A network failure must not advertise a link the server would refuse.
        if (!cancelled) setIsAdmin(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, getIdToken]);

  return isAdmin;
}
