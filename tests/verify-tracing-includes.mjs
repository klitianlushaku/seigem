/**
 * Guards the firebase-admin file tracing that the runtime loader depends on.
 *
 * Run with: node tests/verify-tracing-includes.mjs
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * `src/server/firebase/admin-loader.cjs` loads the Admin SDK by filesystem path
 * at runtime, so nothing in the module graph statically imports it. Next.js
 * assembles the deployed serverless function from a FILE TRACE, and an
 * unimported package is not traced.
 *
 * The deployed error was:
 *
 *   Cannot find module '/var/task/node_modules/firebase-admin/lib/app/index.js'
 *
 * The path was correct — the file simply was not in the bundle. Nothing in the
 * unit suite could catch that, because the tests run against a complete local
 * `node_modules`. This test inspects the BUILD OUTPUT instead, so a regression
 * fails here rather than in production.
 *
 * Requires `npm run build` to have run first.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

let failures = 0;

/** Reports one assertion. */
function check(condition, message) {
  if (condition) {
    console.log(`PASS  ${message}`);
  } else {
    console.error(`FAIL  ${message}`);
    failures += 1;
  }
}

// --- 1. The generated include list must exist and cover the Admin SDK --------
const generatedPath = path.join(root, "tracing-includes.generated.json");
if (!existsSync(generatedPath)) {
  console.error(
    "FAIL  tracing-includes.generated.json is missing. " +
      "Run: node scripts/generate-tracing-includes.mjs",
  );
  process.exit(1);
}

const generated = JSON.parse(readFileSync(generatedPath, "utf8"));
const includes = generated.includes ?? [];

check(includes.length > 0, `include list is non-empty (${includes.length} patterns)`);

/** Packages that must be traced for the loader to work on Vercel. */
const REQUIRED_PACKAGES = [
  "firebase-admin",
  "jwks-rsa",
  "jose",
  "@google-cloud/firestore",
  "google-auth-library",
  "jsonwebtoken",
];

for (const name of REQUIRED_PACKAGES) {
  check(
    includes.includes(`./node_modules/${name}/**`),
    `include list covers ${name}`,
  );
}

// --- 2. The build trace must actually contain the module files --------------
const tracePath = path.join(
  root,
  ".next",
  "server",
  "app",
  "api",
  "study-time",
  "route.js.nft.json",
);

if (!existsSync(tracePath)) {
  console.error(
    "FAIL  build trace not found at .next/server/app/api/study-time/route.js.nft.json. " +
      "Run `npm run build` first.",
  );
  process.exit(1);
}

const trace = JSON.parse(readFileSync(tracePath, "utf8"));
const files = trace.files ?? [];

/**
 * The exact path Vercel reported as missing. If this is absent from the trace,
 * the deployed function will throw MODULE_NOT_FOUND on every authenticated
 * request.
 */
check(
  files.some((f) => f.includes("firebase-admin/lib/app/index.js")),
  "trace contains firebase-admin/lib/app/index.js (the path that went missing)",
);

check(
  files.some((f) => f.includes("firebase-admin/lib/auth/index.js")),
  "trace contains firebase-admin/lib/auth/index.js",
);

check(
  files.some((f) => f.includes("firebase-admin/lib/firestore/index.js")),
  "trace contains firebase-admin/lib/firestore/index.js",
);

// jose is required by jwks-rsa at runtime; it was absent before the fix.
check(
  files.some((f) => f.includes("/jose/")),
  "trace contains the jose package (required by jwks-rsa)",
);

check(
  files.filter((f) => f.includes("firebase-admin")).length > 100,
  `trace contains the full firebase-admin package ` +
    `(${files.filter((f) => f.includes("firebase-admin")).length} files)`,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log("\nfirebase-admin is fully traced into the serverless bundle.");
