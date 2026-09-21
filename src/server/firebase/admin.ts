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

import { createRequire } from "node:module";

import { serverEnv } from "@/lib/env/server";

/**
 * Loads `firebase-admin` through CommonJS `require` instead of ESM `import`.
 *
 * WHY THIS IS NECESSARY — this caused every protected /api route to return
 * HTTP 500 with an EMPTY body on Vercel, while passing locally:
 *
 * `firebase-admin` is a CommonJS package, but its `exports` map also declares an
 * ESM condition whose target is a generated wrapper:
 *
 *   "./auth": { "require": "./lib/auth/index.js",
 *               "import":  "./lib/esm/auth/index.js" }
 *
 * Those `lib/esm/*` files contain real `import`/`export` syntax, yet they sit in
 * a package whose package.json has no `"type": "module"`. Node therefore
 * classifies them as CommonJS and refuses to load them as ESM:
 *
 *   Error: Failed to load external module firebase-admin-.../auth:
 *          Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported
 *
 * The bundler externalizes the package and emits `import("firebase-admin/auth")`
 * for a static ESM import, which selects the broken `import` condition. Routing
 * through `createRequire` emits a `require()` call instead, so Node resolves the
 * `require` condition and loads the working CommonJS build.
 *
 * `require("firebase-admin/auth")` is verified to work; resolving the ESM
 * condition is what fails. Types still come from the normal import below, which
 * is type-only and erased at build time.
 */
const nodeRequire = createRequire(import.meta.url);

type AdminAppModule = typeof import("firebase-admin/app");
type AdminAuthModule = typeof import("firebase-admin/auth");
type AdminFirestoreModule = typeof import("firebase-admin/firestore");

/** The Admin app type, taken from the package so it stays in sync. */
type AdminApp = ReturnType<AdminAppModule["initializeApp"]>;
type AdminAuth = ReturnType<AdminAuthModule["getAuth"]>;
type AdminFirestore = ReturnType<AdminFirestoreModule["getFirestore"]>;

const adminApp = nodeRequire("firebase-admin/app") as AdminAppModule;
const adminAuth = nodeRequire("firebase-admin/auth") as AdminAuthModule;
const adminFirestore = nodeRequire(
  "firebase-admin/firestore",
) as AdminFirestoreModule;

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
  const existing = adminApp.getApps();
  const app = existing[0];
  if (app) return app;

  return adminApp.initializeApp({
    credential: adminApp.cert({
      projectId: serverEnv.firebaseProjectId,
      clientEmail: serverEnv.firebaseClientEmail,
      // Newlines were restored from the literal "\n" escapes by lib/env/server.
      privateKey: serverEnv.firebasePrivateKey,
    }),
  });
}

/** Firebase Admin Auth instance. Used to verify ID tokens. */
export function getAdminAuth(): AdminAuth {
  return adminAuth.getAuth(getAdminApp());
}

/** Firebase Admin Firestore instance. Bypasses security rules — use carefully. */
export function getAdminDb(): AdminFirestore {
  return adminFirestore.getFirestore(getAdminApp());
}

/**
 * Firestore sentinel/timestamp helpers, re-exported through this module.
 *
 * Every server file that needs `Timestamp` or `FieldValue` imports them from
 * HERE rather than from `firebase-admin/firestore` directly.
 *
 * Reason: a direct `import { Timestamp } from "firebase-admin/firestore"` is a
 * runtime value import, so the bundler emits an external ESM `import()` for it.
 * That selects firebase-admin's broken ESM condition and fails on Vercel with
 * `ERR_REQUIRE_ESM`, taking the whole route down with an empty 500. Routing them
 * through this module means the package is loaded exactly once, via the
 * CommonJS `require` established above, and every other consumer reuses it.
 */
export const Timestamp = adminFirestore.Timestamp;
export const FieldValue = adminFirestore.FieldValue;
