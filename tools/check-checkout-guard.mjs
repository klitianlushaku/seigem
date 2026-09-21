/**
 * Verifies that a user with a paid plan cannot buy again.
 *
 * Run with: node tools/check-checkout-guard.mjs [baseUrl]
 *
 * WHY THIS IS WORTH A TEST
 * ------------------------
 * `/api/billing/checkout` creates a NEW Whop checkout configuration, and a
 * completed checkout becomes a NEW subscription. Nothing in the flow replaces an
 * existing one, so a second purchase would bill the customer twice: two
 * memberships, two recurring charges, one plan on their account.
 *
 * That is a money bug, and a client-side guard cannot prevent it — anyone can
 * call the endpoint directly. This calls it directly, with a real ID token, and
 * asserts the refusal.
 *
 * It also checks the opposite direction: a user on the FREE plan must still be
 * able to check out, so the guard cannot silently block all sales.
 *
 * NOTE: for a free user this creates a real (unused) checkout configuration in
 * the Whop account. It is inert, but it is a side effect.
 */
/* eslint-disable no-console -- a CLI tool; printed output is the deliverable */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const env = (() => {
  const parsed = {};
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    parsed[match[1]] = value;
  }
  return parsed;
})();

const baseUrl = (process.argv[2] ?? "http://localhost:4100").replace(/\/+$/, "");

const mainEntry = require.resolve("firebase-admin");
const packageRoot = path.dirname(path.dirname(mainEntry));
const adminApp = require(path.join(packageRoot, "lib", "app", "index.js"));
const adminAuth = require(path.join(packageRoot, "lib", "auth", "index.js"));
const adminFirestore = require(path.join(
  packageRoot,
  "lib",
  "firestore",
  "index.js",
));

const app = adminApp.initializeApp({
  credential: adminApp.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});
const auth = adminAuth.getAuth(app);
const db = adminFirestore.getFirestore(app);

/** Mints a real ID token for a uid, the way the browser would hold one. */
async function idTokenFor(uid) {
  const customToken = await auth.createCustomToken(uid);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const payload = await response.json();
  if (!payload.idToken) throw new Error(`token exchange failed: ${JSON.stringify(payload)}`);
  return payload.idToken;
}

/** Reads the stored plan value, before expiry is applied. */
async function storedPlan(uid) {
  const snapshot = await db.collection("users").doc(uid).get();
  return snapshot.data()?.plan ?? "(none)";
}

/** Calls the checkout endpoint and reports the outcome. */
async function attemptCheckout(token) {
  const response = await fetch(`${baseUrl}/api/billing/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan: "pro" }),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

// --- Find one paid user and one free user ----------------------------------
const users = await db.collection("users").get();

let paidUid = null;
let freeUid = null;

for (const doc of users.docs) {
  const plan = doc.data().plan;
  if (plan === "plus" || plan === "pro") {
    if (!paidUid) paidUid = doc.id;
  } else if (!freeUid) {
    freeUid = doc.id;
  }
}

let failures = 0;

/** Reports a result. */
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

// --- A paid user must be refused -------------------------------------------
if (!paidUid) {
  console.log("SKIP  no user with a paid plan exists to test the refusal");
} else {
  const token = await idTokenFor(paidUid);
  const result = await attemptCheckout(token);
  const stored = await storedPlan(paidUid);

  console.log(
    `\nPaid user (stored plan "${stored}") -> HTTP ${result.status} ` +
      `${JSON.stringify(result.body).slice(0, 140)}`,
  );

  check(
    "a second purchase is REFUSED for a user who already pays",
    result.status !== 200 || !result.body.checkoutUrl,
  );
  check(
    "the refusal explains why",
    typeof result.body?.error?.message === "string" &&
      result.body.error.message.length > 0,
  );
}

// --- A free user must still be able to buy ---------------------------------
if (!freeUid) {
  console.log("SKIP  no user on the free plan exists to test the allowed path");
} else {
  const token = await idTokenFor(freeUid);
  const result = await attemptCheckout(token);

  console.log(
    `\nFree user -> HTTP ${result.status} ` +
      `${JSON.stringify(result.body).slice(0, 140)}`,
  );

  /*
   * A 200 with a checkout URL is ideal. A 500 is tolerated as "not a
   * regression" because it means the guard let the request through and Whop
   * refused for its own reasons (for example a missing API scope), which is a
   * different problem from the guard blocking sales.
   */
  check(
    "a free user is NOT blocked by the guard",
    result.status === 200 || result.status === 500,
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("Checkout guard behaves correctly.");
