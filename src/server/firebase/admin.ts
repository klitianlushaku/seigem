/**
 * Firebase Admin SDK initialization (server-only).
 *
 * The Admin SDK bypasses Firestore Security Rules, so this module must only
 * ever be imported from server code. `import "server-only"` turns an accidental
 * client import into a build error.
 */
import "server-only";

import { serverEnv } from "@/lib/env/server";
// Relative on purpose (not the "@/" alias) so the path can be listed in
// `serverExternalPackages`, which needs a real module specifier to match.
// See the header of the loader for why it must stay out of the bundle.
import {
  getAdminApp as loadAdminApp,
  getAdminAuth as loadAdminAuth,
  getAdminDb as loadAdminDb,
} from "./admin-loader.cjs";

/**
 * Firestore `Timestamp` and `FieldValue`, re-exported from the loader.
 *
 * The loader owns them so the lazy-resolution and Proxy invariants live in one
 * testable CommonJS module. A live re-export keeps them lazy: nothing is
 * evaluated until a caller actually touches `Timestamp` or `FieldValue`, which
 * is what keeps the SDK out of the build-time module graph.
 */
export { FieldValue, Timestamp } from "./admin-loader.cjs";

/** The Admin app type, taken from the loader so it stays in sync. */
type AdminApp = ReturnType<typeof loadAdminApp>;
type AdminAuth = ReturnType<typeof loadAdminAuth>;
type AdminFirestore = ReturnType<typeof loadAdminDb>;

/** True when Admin credentials look like real values rather than placeholders. */
export function hasAdminCredentials(): boolean {
  const key = serverEnv.firebasePrivateKey;
  return (
    key.includes("BEGIN PRIVATE KEY") &&
    !key.includes("REPLACE_ME") &&
    !serverEnv.firebaseClientEmail.includes("REPLACE_ME") &&
    !serverEnv.firebaseProjectId.includes("REPLACE_ME")
  );
}

/**
 * Reads the Admin credentials from the validated server environment.
 *
 * Kept in one place so every entry point initialises the app identically. The
 * loader itself cannot read these: it is plain CommonJS that deliberately does
 * not import application modules, so the values are passed in.
 */
function adminCredentials() {
  return {
    projectId: serverEnv.firebaseProjectId,
    clientEmail: serverEnv.firebaseClientEmail,
    // Newlines were restored from the literal "\n" escapes by lib/env/server.
    privateKey: serverEnv.firebasePrivateKey,
  };
}

/**
 * Returns the singleton Firebase Admin app, creating it on first use.
 * Reuses an existing app so hot reloads do not re-initialize the SDK.
 */
export function getAdminApp(): AdminApp {
  return loadAdminApp(adminCredentials());
}

/**
 * Firebase Admin Auth instance. Used to verify ID tokens.
 *
 * Credentials are passed on every call, not just the first: the loader caches
 * the app internally, but it needs the values the FIRST time it is reached.
 * Omitting them here previously threw
 * `TypeError: Cannot read properties of undefined (reading 'projectId')`, which
 * auth-guard surfaced as a 500 on every authenticated request.
 */
export function getAdminAuth(): AdminAuth {
  return loadAdminAuth(adminCredentials());
}

/** Firebase Admin Firestore instance. Bypasses security rules — use carefully. */
export function getAdminDb(): AdminFirestore {
  return loadAdminDb(adminCredentials());
}
