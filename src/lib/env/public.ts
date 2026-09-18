/**
 * Public (browser-safe) environment variables.
 *
 * Every value in this file is prefixed with NEXT_PUBLIC_ and is therefore
 * embedded into the client bundle. NEVER add a secret here.
 *
 * Firebase Web API keys are not secrets in the traditional sense: they identify
 * the project and are protected by Firebase Security Rules and authorized
 * domains. Server secrets (FIREBASE_PRIVATE_KEY, DEEPSEEK_API_KEY, WHOP_API_KEY,
 * WHOP_WEBHOOK_SECRET) must be read from `serverEnv` in `./server` instead.
 */

/**
 * Reads a required public variable.
 *
 * An empty value throws, because a genuinely missing variable is a hard
 * configuration error. Placeholder values are intentionally NOT rejected here:
 * `.env.local` ships with `REPLACE_ME` so the project builds and runs before
 * any Firebase project exists. Authentication simply fails until the real
 * values are filled in, and `isPlaceholderEnv()` lets the UI say so clearly.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required public environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill it in, then restart the dev server.`,
    );
  }
  return value;
}

/** True when a config value is still the placeholder from `.env.local`. */
function isPlaceholder(value: string | undefined): boolean {
  return !value || value.includes("REPLACE_ME");
}

/**
 * True when Firebase has not been configured yet.
 *
 * The UI uses this to explain *why* sign-in cannot work, instead of letting
 * the user hit an opaque Firebase error.
 */
export function isFirebaseConfigured(): boolean {
  return !isPlaceholder(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
}

/**
 * Reads NEXT_PUBLIC_APP_URL and strips any trailing slash so string
 * concatenation with a path (e.g. `${appUrl}/api/...`) stays well-formed.
 */
function appUrl(value: string | undefined): string {
  const raw = value?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Firebase Web SDK configuration. Safe to expose to the browser. */
export const publicEnv = {
  firebaseApiKey: required(
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  ),
  firebaseAuthDomain: required(
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  ),
  firebaseProjectId: required(
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  ),

  /**
   * Cloud Storage bucket name.
   *
   * OPTIONAL — intentionally not `required()`.
   *
   * Seigem never uploads files: documents are parsed in the browser and only
   * the extracted text is sent to the server. Verified against the installed
   * SDK: `storageBucket` is read exclusively by `@firebase/storage`, the one
   * Firebase package Seigem does not import. `initializeApp` and
   * `initializeServerApp` both accept a config without it.
   *
   * It is retained here (and in .env.example) because the Firebase console's
   * generated `firebaseConfig` snippet includes it, so copying that snippet
   * verbatim must not break the build. If a future task adds Cloud Storage,
   * flip this to `required(...)`.
   */
  firebaseStorageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,

  firebaseMessagingSenderId: required(
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  firebaseAppId: required(
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  ),

  /** Base URL of this deployment, used for Whop redirects. No trailing slash. */
  appUrl: appUrl(process.env.NEXT_PUBLIC_APP_URL),
} as const;
