"use client";

/**
 * Client-side authentication context.
 *
 * Wraps Firebase Auth and exposes the signed-in user plus sign-in/sign-out
 * actions. On first sign-in it calls /api/auth/profile so the server can
 * create the Firestore profile.
 *
 * The Firebase ID token is refreshed by the SDK automatically. We fetch a
 * fresh token whenever the server needs to authenticate a request.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

import { getFirebaseAuth } from "@/lib/firebase/client";

/** Error messages shown to the user, in Albanian, keyed by Firebase error code. */
const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  "auth/popup-closed-by-user": "Dritarja e hyrjes u mbyll para përfundimit.",
  "auth/popup-blocked":
    "Shfletuesi bllokoi dritaren e hyrjes. Lejo dritaret pop-up dhe provo përsëri.",
  "auth/cancelled-popup-request": "Kërkesa e hyrjes u anulua. Provo përsëri.",
  "auth/network-request-failed":
    "Problem me lidhjen e internetit. Kontrollo rrjetin dhe provo përsëri.",
  "auth/too-many-requests": "Shumë përpjekje. Provo përsëri pas pak.",
  "auth/unauthorized-domain":
    "Ky domen nuk është i autorizuar në Firebase Authentication.",
  "auth/operation-not-allowed":
    "Hyrja me Google nuk është aktivizuar në Firebase Authentication.",
  "auth/internal-error": "Ndodhi një gabim i brendshëm. Provo përsëri.",
};

/** Maps a Firebase error to a safe Albanian message. */
export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  return (
    AUTH_ERROR_MESSAGES[code] ??
    "Hyrja dështoi. Provo përsëri."
  );
}

interface AuthContextValue {
  /** The signed-in Firebase user, or null. */
  user: User | null;
  /** True until the initial auth state resolves. */
  loading: boolean;
  /** True while a sign-in or sign-out call is in flight. */
  pending: boolean;
  /** Last authentication error message, in Albanian. */
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Returns a fresh ID token for authenticated API calls. */
  getIdToken: () => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Registers the user profile with the server after sign-in.
 * Failures are logged but do not block the user from reaching the dashboard;
 * the dashboard re-attempts registration if the profile is still missing.
 */
async function registerProfile(user: User): Promise<void> {
  const token = await user.getIdToken();
  const response = await fetch("/api/auth/profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    // Deliberately not surfaced to the user: a transient failure here must not
    // block login. The next dashboard load retries.
    console.error("[auth] profile registration failed:", response.status);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setLoading(false);

        if (nextUser) {
          void registerProfile(nextUser);
        }
      },
      (authError) => {
        console.error("[auth] state observer error:", authError);
        setError("Ndodhi një gabim gjatë kontrollit të sesionit.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setPending(true);
    setError(null);

    const provider = new GoogleAuthProvider();
    // Always let the user choose an account instead of silently reusing one.
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      await signInWithPopup(getFirebaseAuth(), provider);
      // Redirect is handled by the login page once `user` becomes non-null.
    } catch (signInError) {
      setError(authErrorMessage(signInError));
    } finally {
      setPending(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setPending(true);
    setError(null);

    try {
      await firebaseSignOut(getFirebaseAuth());
    } catch (signOutError) {
      console.error("[auth] sign-out failed:", signOutError);
      setError("Shkëputja dështoi. Provo përsëri.");
    } finally {
      setPending(false);
    }
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch (tokenError) {
      console.error("[auth] failed to read ID token:", tokenError);
      return null;
    }
  }, [user]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      pending,
      error,
      signInWithGoogle,
      signOut,
      getIdToken,
      clearError,
    }),
    [
      user,
      loading,
      pending,
      error,
      signInWithGoogle,
      signOut,
      getIdToken,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the auth context. Throws when used outside `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }
  return context;
}
