/**
 * End-to-end check of the PRODUCTION API with a real Firebase ID token.
 *
 * Run with: node tests/verify-production-auth.mjs
 *
 * It mints a genuine ID token with the Admin SDK, exchanges it through the
 * Identity Toolkit REST API (exactly as the browser SDK does), then calls the
 * deployed endpoints with it.
 *
 * Why this exists: a 401 from an unauthenticated probe proves only that auth is
 * ENFORCED. It does not prove that a signed-in user can actually use the app.
 * This distinguishes the two:
 *
 *   200 -> the authenticated path works; any remaining problem is client-side
 *          (the user is not signed in), not the API.
 *   401 -> token verification is broken server-side.
 *   500 -> the Admin SDK failed to load in the deployment.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/** Minimal .env.local reader. */
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

const env = loadEnv();
const BASE = process.argv[2] ?? "https://seigem.vercel.app";

// --- Load firebase-admin through the same CommonJS path the server uses ------
const mainEntry = require.resolve("firebase-admin");
const packageRoot = path.dirname(path.dirname(mainEntry));
const adminApp = require(path.join(packageRoot, "lib", "app", "index.js"));
const adminAuth = require(path.join(packageRoot, "lib", "auth", "index.js"));

const app = adminApp.initializeApp({
  credential: adminApp.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});

const auth = adminAuth.getAuth(app);

// --- Pick an existing user so we do not create stray accounts ----------------
const listed = await auth.listUsers(1);
const user = listed.users[0];
if (!user) {
  console.error("No users exist in the project; cannot mint a token.");
  process.exit(1);
}
console.log(`Using existing user ${user.uid}`);

/**
 * Creates a custom token, then exchanges it for an ID token.
 *
 * This mirrors what the browser does: the custom token is the server-side
 * equivalent of a completed sign-in, and the exchange returns the same kind of
 * ID token the web SDK would send.
 */
const customToken = await auth.createCustomToken(user.uid);

const exchange = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);

const exchanged = await exchange.json();
if (!exchange.ok || !exchanged.idToken) {
  console.error("Token exchange failed:", JSON.stringify(exchanged));
  process.exit(1);
}

const idToken = exchanged.idToken;
console.log(`Minted a real ID token (${idToken.length} chars)\n`);

// --- Call the deployed API as a signed-in user ------------------------------
const checks = [
  { method: "GET", path: "/api/study-sets" },
  { method: "GET", path: "/api/study-time" },
  { method: "GET", path: "/api/generate" },
];

let failures = 0;

for (const { method, path: endpoint } of checks) {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${idToken}` },
  });

  const body = await response.text();
  const ok = response.status === 200;
  if (!ok) failures += 1;

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${method} ${endpoint} -> HTTP ${response.status}`,
  );
  console.log(`      ${body.slice(0, 160)}`);
}

console.log("");
if (failures === 0) {
  console.log("The authenticated API path works in production.");
} else {
  console.log(
    `${failures} endpoint(s) failed. A 401 means verification is broken; ` +
      `a 500 means the Admin SDK did not load.`,
  );
}
process.exit(failures === 0 ? 0 : 1);
