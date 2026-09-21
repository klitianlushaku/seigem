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
  Timestamp as getTimestamp,
  FieldValue as getFieldValue,
} from "./admin-loader.cjs";

/**
 * Firestore `Timestamp` class.
 *
 * Resolved through a getter rather than re-exported directly, because reading it
 * at MODULE LOAD time would force the Admin SDK to load while Next.js collects
 * page data during the build. That build sandbox resolves packages differently
 * from the deployed runtime and fails with "Cannot find module 'firebase-admin'"
 * — and a build that never queries Firestore should not need the SDK at all.
 *
 * Callers use it as `Timestamp.now()` / `Timestamp.fromDate(...)`, so exposing
 * the class itself keeps existing call sites unchanged.
 */
export const Timestamp = new Proxy(
  class {},
  {
    construct: (_target, args: unknown[]) => {
      const Real = getTimestamp() as unknown as new (...a: unknown[]) => object;
      return new Real(...args);
    },
    get: (_target, property) => {
      const Real = getTimestamp() as unknown as Record<string | symbol, unknown>;
      return Real[property];
    },
  },
) as unknown as typeof import("firebase-admin/firestore").Timestamp;

/** Firestore `FieldValue` sentinel, lazily resolved for the same reason. */
export const FieldValue = new Proxy(
  {},
  {
    get: (_target, property) => {
      const Real = getFieldValue() as unknown as Record<string | symbol, unknown>;
      return Real[property];
    },
  },
) as unknown as typeof import("firebase-admin/firestore").FieldValue;

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
 * Returns the singleton Firebase Admin app, creating it on first use.
 * Reuses an existing app so hot reloads do not re-initialize the SDK.
 */
export function getAdminApp(): AdminApp {
  return loadAdminApp({
    projectId: serverEnv.firebaseProjectId,
    clientEmail: serverEnv.firebaseClientEmail,
    // Newlines were restored from the literal "\n" escapes by lib/env/server.
    privateKey: serverEnv.firebasePrivateKey,
  });
}

/** Firebase Admin Auth instance. Used to verify ID tokens. */
export function getAdminAuth(): AdminAuth {
  return loadAdminAuth();
}

/** Firebase Admin Firestore instance. Bypasses security rules — use carefully. */
export function getAdminDb(): AdminFirestore {
  return loadAdminDb();
}
