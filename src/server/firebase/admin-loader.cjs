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
 * `require` rooted at a RUNTIME path, never at `__filename`.
 *
 * `__filename` must not be used here. The bundler inlines this file and
 * replaces `__filename` with a BUILD-TIME literal — Turbopack emits
 * `createRequire("/ROOT/src/server/firebase/admin-loader.cjs")`, and `/ROOT`
 * does not exist on the deployed host. `require.resolve("firebase-admin")` then
 * throws, `getAdminAuth()` fails, and every authenticated request returns 500
 * with "the service is not configured correctly".
 *
 * That is exactly why the bug did not reproduce locally: on the build machine
 * the literal resolves to a real directory, so the failure only appeared in
 * production.
 *
 * `process.cwd()` is evaluated at runtime instead. On Vercel the function's
 * working directory is the deployment root (`/var/task`), which contains
 * `node_modules`. The upward walk in `resolveAdminMain` covers any layout where
 * it does not.
 */
const nodeRequire = createRequire(path.join(process.cwd(), "noop.js"));

/**
 * Loads one firebase-admin product, trying every viable strategy.
 *
 * Order matters:
 *
 *   1. ABSOLUTE FILE PATH. Resolves the package root, then requires
 *      `lib/<product>/index.js` directly. This bypasses the package's `exports`
 *      map, whose `import` condition points at an ESM wrapper Node cannot load.
 *      When it works, this is the most reliable option because no condition
 *      resolution is involved.
 *
 *   2. THE BARE SUBPATH, through CommonJS `require`. Node's `require` honours
 *      the `require` condition, which is the working CommonJS build. This is a
 *      genuinely different code path from the ESM `import()` that the bundler
 *      emitted and that produced ERR_REQUIRE_ESM. It only fails if the package
 *      is missing entirely.
 *
 * Both are attempted because the file layout differs between local development,
 * a Next.js build, and a Vercel function bundle, and a working deployment
 * matters more than using one specific mechanism.
 *
 * @param {string} product Directory under `firebase-admin/lib`, e.g. "auth".
 * @returns {any} The loaded product module.
 */
function loadProduct(product) {
  const mainEntry = resolveAdminMain();

  if (mainEntry) {
    const packageRoot = path.dirname(path.dirname(mainEntry));
    const entry = path.join(packageRoot, "lib", product, "index.js");
    if (fs.existsSync(entry)) return nodeRequire(entry);
  }

  // Fall back to the bare specifier. `require` selects the CommonJS condition,
  // so this does not reproduce the ESM failure.
  try {
    return nodeRequire(`firebase-admin/${product}`);
  } catch (error) {
    const detail = describeResolution();
    throw new Error(
      `firebase-admin could not be loaded (product: ${product}). ` +
        `cwd=${detail.cwd} ` +
        `existingModuleDirs=${JSON.stringify(detail.dirsThatExist)} ` +
        `Cause: ${error && error.message}`,
    );
  }
}

/**
 * Relative path from a `node_modules` directory to the Admin SDK entry file.
 * Every candidate directory below is checked against this.
 */
const ADMIN_ENTRY_SUFFIX = "/firebase-admin/lib/index.js";

/**
 * Every directory that could contain an installed firebase-admin.
 *
 * Collects candidates from several sources, because no single one is reliable
 * across local development, a Next.js build, and a Vercel serverless function:
 *
 *   1. `require.resolve.paths()` — Node's OWN search path list for this
 *      module. This is the authoritative answer and works whenever the package
 *      is resolvable at all.
 *   2. An upward walk from `process.cwd()` — on Vercel the function runs with
 *      the deployment root as its working directory (`/var/task`), which holds
 *      `node_modules`.
 *   3. A small set of known deployment layouts, as a last resort.
 *
 * `__dirname` and `__filename` are deliberately NEVER used: the bundler rewrites
 * them to build-time literals (`/ROOT/...`) that do not exist on the deployed
 * host, which is what broke the previous attempt.
 *
 * @returns {string[]} Candidate directories that may contain `firebase-admin`.
 */
function candidateModuleDirs() {
  const dirs = [];

  /** Adds a path once, ignoring empties. */
  const add = (value) => {
    if (typeof value === "string" && value.length > 0 && !dirs.includes(value)) {
      dirs.push(value);
    }
  };

  // 1. Node's own search paths, resolved at runtime.
  try {
    const paths = nodeRequire.resolve.paths("firebase-admin") || [];
    for (const p of paths) add(p);
  } catch {
    // Not fatal: the walk below may still find it.
  }

  // 2. Walk up from the runtime working directory.
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    add(path.join(dir, "node_modules"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 3. Known serverless layouts.
  add("/var/task/node_modules");
  add(path.join(process.cwd(), ".next", "server", "node_modules"));

  return dirs;
}

/**
 * Locates the Admin SDK entry file on disk.
 *
 * @returns {string | null} Absolute path to `firebase-admin/lib/index.js`, or
 *   null when no installed copy exists.
 */
function resolveAdminMain() {
  // Prefer the normal resolver, which is correct at runtime.
  try {
    const resolved = nodeRequire.resolve("firebase-admin");
    if (fs.existsSync(resolved)) return resolved;
  } catch {
    // Fall through to the directory scan.
  }

  for (const dir of candidateModuleDirs()) {
    const candidate = `${dir}${ADMIN_ENTRY_SUFFIX}`;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Ignore unreadable directories and keep looking.
    }
  }

  return null;
}

/**
 * Reports what the loader can see, WITHOUT throwing.
 *
 * Exposed so `/api/health` can explain a deployment failure directly, instead
 * of the only symptom being a generic 500. It reveals file paths and booleans
 * only — never a credential.
 *
 * @returns {{
 *   resolved: string | null,
 *   cwd: string,
 *   searchedDirs: string[],
 *   dirsThatExist: string[],
 *   adminPresent: boolean,
 *   packageRoot: string | null,
 *   rootEntries: string[] | null,
 *   libEntries: string[] | null,
 *   products: Record<string, { entryPath: string, entryExists: boolean,
 *                              loaded: boolean, error: string | null }>
 * }}
 */
function describeResolution() {
  const searchedDirs = candidateModuleDirs();

  /** Directories from the candidate list that actually exist on disk. */
  const dirsThatExist = [];
  for (const dir of searchedDirs) {
    try {
      if (fs.existsSync(dir)) dirsThatExist.push(dir);
    } catch {
      // Unreadable: treat as absent.
    }
  }

  const resolved = resolveAdminMain();
  const packageRoot = resolved ? path.dirname(path.dirname(resolved)) : null;

  /**
   * Lists a directory's entries, or null when it cannot be read.
   * @param {string | null} dir
   * @returns {string[] | null}
   */
  const readEntries = (dir) => {
    if (!dir) return null;
    try {
      return fs.readdirSync(dir).slice(0, 40);
    } catch {
      return null;
    }
  };

  /**
   * Attempts to load each product, capturing the exact error rather than
   * letting it surface as an opaque 500.
   * @type {Record<string, {entryPath: string, entryExists: boolean, loaded: boolean, error: string | null}>}
   */
  const products = {};

  for (const product of ["app", "auth", "firestore"]) {
    const entryPath = packageRoot
      ? path.join(packageRoot, "lib", product, "index.js")
      : "";
    let entryExists = false;
    let loaded = false;
    let error = null;

    if (entryPath) {
      try {
        entryExists = fs.existsSync(entryPath);
      } catch {
        entryExists = false;
      }
    }

    if (entryExists) {
      try {
        nodeRequire(entryPath);
        loaded = true;
      } catch (loadError) {
        error = loadError && loadError.message ? loadError.message : String(loadError);
      }
    } else {
      error = `entry file not present: ${entryPath || "(package not resolved)"}`;
    }

    products[product] = { entryPath, entryExists, loaded, error };
  }

  return {
    resolved,
    cwd: process.cwd(),
    searchedDirs,
    dirsThatExist,
    adminPresent: resolved !== null,
    packageRoot,
    rootEntries: readEntries(packageRoot),
    libEntries: readEntries(packageRoot ? path.join(packageRoot, "lib") : null),
    products,
  };
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
    app: loadProduct("app"),
    auth: loadProduct("auth"),
    firestore: loadProduct("firestore"),
  };

  return modules;
}

/** @type {any} */
let cachedApp = null;

/**
 * Returns the singleton Firebase Admin app, creating it on first use.
 *
 * @param {{ projectId: string, clientEmail: string, privateKey: string }} credentials
 *   Required on the FIRST call. Later calls may pass them again; they are
 *   ignored once the app is cached.
 * @returns {any} The initialized Admin app.
 */
function getAdminApp(credentials) {
  if (cachedApp) return cachedApp;

  if (!credentials) {
    // Fail with an actionable message rather than the opaque
    // "Cannot read properties of undefined (reading 'projectId')".
    throw new Error(
      "getAdminApp requires credentials on first use " +
        "({ projectId, clientEmail, privateKey }).",
    );
  }

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

/**
 * Firebase Admin Auth, bound to the singleton app.
 *
 * @param {{ projectId: string, clientEmail: string, privateKey: string }} credentials
 *   Required on the first call in the process; see getAdminApp.
 * @returns {any}
 */
function getAdminAuth(credentials) {
  return load().auth.getAuth(getAdminApp(credentials));
}

/**
 * Firebase Admin Firestore, bound to the singleton app.
 *
 * @param {{ projectId: string, clientEmail: string, privateKey: string }} credentials
 *   Required on the first call in the process; see getAdminApp.
 * @returns {any}
 */
function getAdminDb(credentials) {
  return load().firestore.getFirestore(getAdminApp(credentials));
}

module.exports = {
  getAdminApp,
  getAdminAuth,
  getAdminDb,
  Timestamp: () => load().firestore.Timestamp,
  FieldValue: () => load().firestore.FieldValue,
  /**
   * Diagnostics for /api/health. Reports the resolution outcome and the
   * directories that exist, without loading the SDK or throwing. Paths and
   * booleans only, so it is safe to serve from an unauthenticated endpoint.
   */
  describeResolution,
};
