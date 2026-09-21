/**
 * Runtime loader for firebase-admin (server-only, NOT bundled).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AS PLAIN JAVASCRIPT
 * ---------------------------------------------------------------------------
 * Every route that touched Firestore or Auth returned HTTP 500 with an EMPTY
 * body in production, with this runtime error from Vercel:
 *
 *   Error: Failed to load external module
 *          firebase-admin-a14c8a5423a75469/auth:
 *          Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported
 *
 * `firebase-admin` is a CommonJS package, but its `exports` map declares BOTH
 * conditions and the ESM target is unusable:
 *
 *   "./auth": { "require": "./lib/auth/index.js",       <- works
 *               "import":  "./lib/esm/auth/index.js" }  <- broken
 *
 * The `lib/esm/*` files use real `import`/`export` syntax while living in a
 * package with no `"type": "module"`, so Node classifies them as CommonJS and
 * refuses to load them as ESM. The serverless loader resolves the bare subpath
 * through that `import` condition no matter which syntax the source uses.
 *
 * Four approaches were tried and all failed:
 *
 *   1. `serverExternalPackages` — this INTRODUCED the ERR_REQUIRE_ESM error.
 *   2. Deep specifiers (`firebase-admin/lib/auth/index.js`) — rejected with
 *      ERR_PACKAGE_PATH_NOT_EXPORTED, because `./lib/*` is not in `exports`.
 *   3. `require("firebase-admin/auth")` via `createRequire` — the loader still
 *      resolved the broken `import` condition.
 *   4. Building an absolute path at runtime — Turbopack rewrites every
 *      statically analysable reference, so it either failed the build with
 *      "Module not found" or replaced the resolved path with a numeric module
 *      id ("TypeError: 50700.lastIndexOf is not a function").
 *
 * This file is declared external (see `serverExternalPackages` in
 * next.config.ts), so it is copied rather than bundled and the `require` calls
 * below are executed by Node itself. Node's `require` honours the `require`
 * condition, so the working CommonJS build is loaded.
 *
 * The file uses `.cjs` so Node always treats it as CommonJS regardless of any
 * `"type"` field, and it is plain JavaScript with no build step.
 */

"use strict";

/*
 * CommonJS `require` is the entire point of this file: it runs in Node, not the
 * bundler, so the package's `require` condition is honoured and the broken ESM
 * wrapper is never selected. The lint rules below are disabled for that reason.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createRequire } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");

/**
 * `require` rooted at this file, so package resolution starts from the
 * application directory rather than from an internal bundler helper.
 */
const nodeRequire = createRequire(__filename);

/**
 * Resolves the absolute path of a firebase-admin product entry point.
 *
 * Uses `path.join` on the directory found by `require.resolve` for the package
 * itself. Because the resolved path is a plain filesystem path, the subsequent
 * `require` bypasses the package's `exports` map — which is the whole point,
 * since that map's `import` condition points at an ESM wrapper Node cannot load.
 *
 * @param {string} product Directory under `firebase-admin/lib`, e.g. "auth".
 * @returns {string} Absolute path to `<package>/lib/<product>/index.js`.
 */
function entryFor(product) {
  const mainEntry = resolveAdminMain();
  if (!mainEntry) {
    throw new Error(
      "firebase-admin is not installed, so the Admin SDK cannot be loaded. " +
        "It must be listed in `dependencies` (not `devDependencies`) so it is " +
        "present in the deployed environment.",
    );
  }
  const packageRoot = path.dirname(path.dirname(mainEntry));
  return path.join(packageRoot, "lib", product, "index.js");
}

/**
 * Resolves the firebase-admin main file.
 *
 * Tolerates the BUILD-TIME environment. Next.js evaluates route modules while
 * collecting page data, and that sandbox runs from a virtual `/ROOT/` where
 * `node_modules` is not reachable from the module's own path — so resolution
 * must not be attempted, let alone required to succeed, during a build.
 *
 * @returns {string | null} Absolute path to firebase-admin's main entry, or
 *   null when no installed copy can be found (a build sandbox).
 */
function resolveAdminMain() {
  try {
    return nodeRequire.resolve("firebase-admin");
  } catch {
    // Fall back to a filesystem walk, which also covers sandboxes where
    // `require.resolve` paths are restricted but the files are present.
    let dir = __dirname;
    for (let depth = 0; depth < 8; depth += 1) {
      const candidate = path.join(dir, "node_modules", "firebase-admin", "lib", "index.js");
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        // Keep walking up.
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    // Nothing found: assume a build sandbox and defer to runtime.
    return null;
  }
}

/**
 * Cached firebase-admin modules.
 *
 * Loading is DEFERRED until first real use. That is essential: Next.js
 * evaluates route modules while collecting page data at build time, and this
 * file's `require` calls cannot run in that sandbox. Deferring means the build
 * never touches the SDK, and the cost is paid once on the first request.
 *
 * @type {{ app: any, auth: any, firestore: any } | null}
 */
let modules = null;

/** Loads and caches the three product entry points. */
function load() {
  if (modules) return modules;

  modules = {
    app: nodeRequire(entryFor("app")),
    auth: nodeRequire(entryFor("auth")),
    firestore: nodeRequire(entryFor("firestore")),
  };

  return modules;
}

/** @type {any} */
let cachedApp = null;

/**
 * Returns the singleton Firebase Admin app, creating it on first use.
 *
 * @param {{ projectId: string, clientEmail: string, privateKey: string }} credentials
 * @returns {any} The initialized Admin app.
 */
function getAdminApp(credentials) {
  if (cachedApp) return cachedApp;

  const adminApp = load().app;

  const existing = adminApp.getApps();
  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }

  cachedApp = adminApp.initializeApp({
    credential: adminApp.cert({
      projectId: credentials.projectId,
      clientEmail: credentials.clientEmail,
      privateKey: credentials.privateKey,
    }),
  });

  return cachedApp;
}

/** @returns {any} Firebase Admin Auth, bound to the singleton app. */
function getAdminAuth() {
  return load().auth.getAuth(getAdminApp());
}

/** @returns {any} Firebase Admin Firestore, bound to the singleton app. */
function getAdminDb() {
  return load().firestore.getFirestore(getAdminApp());
}

module.exports = {
  getAdminApp,
  getAdminAuth,
  getAdminDb,
  Timestamp: () => load().firestore.Timestamp,
  FieldValue: () => load().firestore.FieldValue,
};
