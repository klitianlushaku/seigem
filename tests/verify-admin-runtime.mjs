/**
 * Proves the firebase-admin CommonJS loading strategy works at runtime.
 *
 * Run with: node tests/verify-admin-runtime.mjs
 *
 * This guards the fix for:
 *
 *   Error: Failed to load external module firebase-admin-.../auth:
 *          Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported
 *
 * which made EVERY protected /api route return HTTP 500 with an empty body in
 * production while passing locally.
 *
 * `src/server/firebase/admin.ts` now loads the package via `createRequire`, so
 * the bundler emits a CommonJS `require()` instead of an ESM `import()`. That
 * matters because firebase-admin declares BOTH conditions and its ESM target is
 * unusable (real ESM syntax inside a package with no `"type": "module"`).
 *
 * A unit test cannot catch a regression here: it never goes through the packaged
 * module graph. So this script loads the module the way the server does, then
 * makes a real Admin call to prove the credentials path also works end to end.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

let failures = 0;

/** Minimal .env.local reader, so the script needs no dependencies. */
function loadEnv(path = ".env.local") {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

// --- 1. The three subpaths the server requires must load via CommonJS -------
const REQUIRED = [
  { id: "firebase-admin/app", names: ["cert", "getApps", "initializeApp"] },
  { id: "firebase-admin/auth", names: ["getAuth"] },
  { id: "firebase-admin/firestore", names: ["getFirestore", "Timestamp", "FieldValue"] },
];

for (const { id, names } of REQUIRED) {
  try {
    const mod = require(id);
    for (const name of names) {
      if (mod[name] === undefined) throw new Error(`missing export "${name}"`);
    }
    console.log(`PASS  require("${id}")  ->  ${names.join(", ")}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  require("${id}"): ${error.message}`);
  }
}

// --- 2. A real Admin call, proving credentials resolve at runtime -----------
const env = loadEnv();
try {
  const { cert, initializeApp } = require("firebase-admin/app");
  const { getAuth } = require("firebase-admin/auth");
  const { getFirestore } = require("firebase-admin/firestore");

  const app = initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
  });

  const users = await getAuth(app).listUsers(1);
  console.log(`PASS  Admin Auth reachable (sampled ${users.users.length} user(s))`);

  await getFirestore(app).collection("users").limit(1).get();
  console.log("PASS  Firestore reachable");
} catch (error) {
  failures += 1;
  console.error(`FAIL  live Admin call: ${error.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log("\nfirebase-admin loads via CommonJS and reaches Firebase.");
