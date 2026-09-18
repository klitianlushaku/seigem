/**
 * Firebase Admin SDK initialization (server-only).
 *
 * The Admin SDK bypasses Firestore Security Rules, so this module must only
 * ever be imported from server code. `import "server-only"` turns an accidental
 * client import into a build error.
 *
 * Uses the modular `firebase-admin/app` + `firebase-admin/firestore` entry
 * points so the bundler can tree-shake unused Admin products.
 */
import "server-only";

import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { serverEnv } from "@/lib/env/server";

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
export function getAdminApp(): App {
  const existing = getApps();
  const app = existing[0];
  if (app) return app;

  return initializeApp({
    credential: cert({
      projectId: serverEnv.firebaseProjectId,
      clientEmail: serverEnv.firebaseClientEmail,
      // Newlines were restored from the literal "\n" escapes by lib/env/server.
      privateKey: serverEnv.firebasePrivateKey,
    }),
  });
}

/** Firebase Admin Auth instance. Used to verify ID tokens. */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/** Firebase Admin Firestore instance. Bypasses security rules — use carefully. */
export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}
