/**
 * Verifies the firebase-admin runtime loader (`admin-loader.cjs`).
 *
 * Run with: node tests/verify-admin-loader.mjs
 *
 * This guards the production failure where every route touching Firestore or
 * Auth returned HTTP 500 with an EMPTY body:
 *
 *   Error: Failed to load external module
 *          firebase-admin-a14c8a5423a75469/auth:
 *          Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported
 *
 * `firebase-admin` declares both a `require` and an `import` condition in its
 * `exports` map, and the `import` target (`lib/esm/*`) is real ESM inside a
 * package with no `"type": "module"`, so Node refuses to load it. The loader
 * resolves the package by filesystem path instead, which bypasses `exports`.
 *
 * A unit test cannot catch a regression here: it never exercises the packaged
 * module graph. This script loads the loader exactly as the server does and then
 * makes real Admin calls, so a break shows up here rather than in production.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let failures = 0;

/** Reads .env.local without adding a dependency. */
function loadEnv(file = path.join(here, "..", ".env.local")) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

// --- 1. The loader module itself must load without touching the SDK ---------
const loaderPath = path.join(here, "..", "src", "server", "firebase", "admin-loader.cjs");
let loader;
try {
  loader = require(loaderPath);
  console.log("PASS  admin-loader.cjs loads (import alone must not load the SDK)");
} catch (error) {
  console.error(`FAIL  admin-loader.cjs: ${error.message}`);
  process.exit(1);
}

for (const name of ["getAdminApp", "getAdminAuth", "getAdminDb", "Timestamp", "FieldValue"]) {
  if (typeof loader[name] !== "function") {
    console.error(`FAIL  loader does not export "${name}" as a function`);
    failures += 1;
  }
}

// --- 2. Real Admin calls, proving resolution works at runtime --------------
const env = loadEnv();
try {
  // Initializing proves the credential object is accepted; the instance itself
  // is not needed afterwards because the loader caches it internally.
  loader.getAdminApp({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  });

  const users = await loader.getAdminAuth().listUsers(1);
  console.log(`PASS  Admin Auth via loader (sampled ${users.users.length} user(s))`);

  await loader.getAdminDb().collection("users").limit(1).get();
  console.log("PASS  Firestore via loader");

  // A real write path uses these sentinels, so confirm they resolve.
  const stamp = loader.Timestamp().now();
  if (typeof stamp.toDate !== "function") throw new Error("Timestamp.now() is not a Timestamp");
  console.log("PASS  Timestamp sentinel resolves");

  if (typeof loader.FieldValue().serverTimestamp !== "function") {
    throw new Error("FieldValue.serverTimestamp is missing");
  }
  console.log("PASS  FieldValue sentinel resolves");
} catch (error) {
  failures += 1;
  console.error(`FAIL  live Admin call: ${error.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log("\nfirebase-admin loads through the runtime loader and reaches Firebase.");
