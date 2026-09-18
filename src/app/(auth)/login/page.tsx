"use client";

/**
 * Login page.
 *
 * Minimal, dark, and centred. Google Sign-In is the only method.
 * On success the user is redirected straight to /dashboard.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { isFirebaseConfigured } from "@/lib/env/public";

/** Google "G" mark, inlined so no external asset or icon library is needed. */
function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      width="18"
      height="18"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { user, loading, pending, error, signInWithGoogle } = useAuth();
  const router = useRouter();
  // Evaluated once at module scope in practice; kept here for clarity.
  const firebaseConfigured = isFirebaseConfigured();

  // Once authenticated, go straight to the dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-semibold tracking-tight">
          Seigem
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          Hyr për të kthyer materialet e tua në përmbledhje, flashcards dhe
          kuize.
        </p>

        <div className="mt-8 rounded-lg border border-line bg-surface p-6">
          {/*
            The button always renders so its label is present in the initial
            HTML. While the auth check is still running it is disabled, which
            prevents a duplicate sign-in attempt during hydration.
          */}
          <Button
            onClick={() => void signInWithGoogle()}
            disabled={loading || pending || !firebaseConfigured}
            className="w-full"
          >
            <GoogleIcon />
            {pending ? "Duke hyrë…" : "Vazhdo me Google"}
          </Button>

          {loading ? (
            <p className="mt-3 text-center text-xs text-muted">
              Duke kontrolluar sesionin…
            </p>
          ) : null}

          {!firebaseConfigured ? (
            <div className="mt-4">
              <Alert>
                Firebase nuk është konfiguruar ende. Plotëso variablat
                NEXT_PUBLIC_FIREBASE_* në skedarin .env.local dhe rinis serverin.
              </Alert>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4">
              <Alert>{error}</Alert>
            </div>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-muted">
          Duke vazhduar, pranon që materialet e ngarkuara përpunohen vetëm për
          gjenerimin e përmbajtjes dhe nuk ruhen.
        </p>
      </div>
    </main>
  );
}
