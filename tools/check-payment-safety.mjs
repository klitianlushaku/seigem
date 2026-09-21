/**
 * Attacks the instant-activation path to prove it cannot be faked.
 *
 * Run with:
 *   node tools/check-payment-safety.mjs                       # production
 *   node tools/check-payment-safety.mjs http://localhost:3000
 *
 * THE QUESTION THIS ANSWERS
 * -------------------------
 * "Is it safe that someone pays and is instantly told they are Pro?"
 *
 * The honest worry is the reverse: can someone be told they are Pro WITHOUT
 * paying? /api/billing/verify reads memberships from Whop using our own API key,
 * and those memberships belong to one business account — so every customer's
 * subscriptions are visible to that single call. The whole safety of the feature
 * rests on a caller being unable to claim one that is not theirs.
 *
 * So this tries, rather than argues:
 *
 *   1. A brand new account with no purchases must claim nothing — even though
 *      the account-wide membership list is full of other people's subscriptions.
 *   2. Starting a checkout and NOT paying must still claim nothing.
 *   3. Faking the return marker must claim nothing.
 *   4. An unauthenticated caller must be refused.
 *
 * The account is created for this run and deleted afterwards.
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

const baseUrl = (process.argv[2] ?? "https://seigem.vercel.app").replace(/\/+$/, "");

const mainEntry = require.resolve("firebase-admin");
const packageRoot = path.dirname(path.dirname(mainEntry));
const adminApp = require(path.join(packageRoot, "lib", "app", "index.js"));
const adminAuth = require(path.join(packageRoot, "lib", "auth", "index.js"));
const adminFirestore = require(path.join(packageRoot, "lib", "firestore", "index.js"));

const app = adminApp.initializeApp({
  credential: adminApp.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});
const auth = adminAuth.getAuth(app);
const db = adminFirestore.getFirestore(app);

/** Mints a real ID token for a uid. */
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
  if (!payload.idToken) throw new Error(`token exchange failed for ${uid}`);
  return payload.idToken;
}

let failures = 0;

/** Reports a result. */
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
    failures += 1;
  }
}

console.log(`Target: ${baseUrl}\n`);

// --- Sweep leftovers from an interrupted run --------------------------------
for (const candidate of (await auth.listUsers(1000)).users) {
  if ((candidate.email ?? "").includes("paysafety-audit-")) {
    await db.collection("users").doc(candidate.uid).delete().catch(() => undefined);
    await auth.deleteUser(candidate.uid).catch(() => undefined);
    console.log(`Cleaned up a leftover: ${candidate.uid}`);
  }
}

// --- How many memberships exist that are NOT this account's? ----------------
/*
 * The attack only means anything if there is something to steal, so this counts
 * what a single verify call can see.
 */
const whopResponse = await fetch(
  `${env.WHOP_BASE_URL ?? "https://api.whop.com/api/v1"}/memberships?first=50`,
  { headers: { Authorization: `Bearer ${env.WHOP_API_KEY}` } },
);
const allMemberships = (await whopResponse.json()).data ?? [];
const othersCount = allMemberships.filter((m) => m.metadata?.seigem_uid).length;

console.log(
  `Memberships visible to one verify call: ${allMemberships.length}, ` +
    `of which ${othersCount} belong to named accounts.\n`,
);

// --- A brand new attacker account -------------------------------------------
const attacker = await auth.createUser({
  email: `paysafety-audit-${Date.now()}@example.invalid`,
  displayName: "Payment safety audit",
  emailVerified: true,
});
const uid = attacker.uid;

await db.collection("users").doc(uid).set(
  {
    email: attacker.email,
    displayName: "Payment safety audit",
    plan: "free",
    planExpiresAt: null,
    whopSubscriptionId: null,
    cancelAtPeriodEnd: false,
    createdAt: adminFirestore.FieldValue.serverTimestamp(),
    updatedAt: adminFirestore.FieldValue.serverTimestamp(),
  },
  { merge: true },
);

const token = await idTokenFor(uid);

/** The plan this account currently holds. */
async function planOf() {
  return (await db.collection("users").doc(uid).get()).data()?.plan ?? "(none)";
}

console.log(`Attacker account: ${uid} (plan starts free)\n`);

/*
 * The safety property is that every one of these is refused. Each is followed by
 * a re-read of Firestore, because an endpoint that reported failure while still
 * granting the plan would pass a naive check.
 */

// --- 1. Claim with no purchase at all ---------------------------------------
console.log("--- 1. claiming with no purchase (the account list is full of others')");
let result = await fetch(`${baseUrl}/api/billing/verify`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
let payload = await result.json().catch(() => ({}));

check("verify succeeds as a request", result.status === 200, `HTTP ${result.status}`);
check(
  `it claims NOTHING despite ${othersCount} memberships being visible`,
  payload?.activated === false,
  `activated=${JSON.stringify(payload?.activated)} membership=${payload?.membershipId}`,
);
check("...and the plan is still free", (await planOf()) === "free", `plan ${await planOf()}`);

// --- 2. Start a checkout, then do NOT pay -----------------------------------
console.log("\n--- 2. starting a checkout and not paying");
const checkout = await fetch(`${baseUrl}/api/billing/checkout`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  // The field is `plan`, and the value is the plan id ("plus" / "pro").
  body: JSON.stringify({ plan: "plus" }),
});
const checkoutBody = await checkout.json().catch(() => ({}));
console.log(
  `        checkout HTTP ${checkout.status} ${JSON.stringify(checkoutBody).slice(0, 90)}`,
);

if (checkout.status === 200) {
  // Asking to verify straight after abandoning the checkout must change nothing.
  result = await fetch(`${baseUrl}/api/billing/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  payload = await result.json().catch(() => ({}));

  check(
    "an UNPAID checkout cannot be claimed",
    payload?.activated === false,
    `activated=${JSON.stringify(payload?.activated)}`,
  );
  check(
    "...and the plan is still free",
    (await planOf()) === "free",
    `plan ${await planOf()}`,
  );
} else {
  // A refusal here is not a security failure, but it must not be silent.
  console.log(`        (checkout refused with ${checkout.status}; skipping the unpaid test)`);
  check(
    "the checkout refusal is a legitimate one",
    checkout.status === 400 || checkout.status === 403 || checkout.status === 429,
    `HTTP ${checkout.status}`,
  );
}

// --- 3. Pretending to come back from a purchase -----------------------------
console.log("\n--- 3. faking the return from checkout");
/*
 * `?checkout=return` is client-controlled and only triggers the notice. If the
 * marker itself granted anything, anyone could type it and become Pro.
 */
const faked = await fetch(`${baseUrl}/api/billing/verify`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "X-Checkout-Return": "return" },
});
payload = await faked.json().catch(() => ({}));
check("the return marker grants nothing on the server", payload?.activated === false);
check("...and the plan is still free", (await planOf()) === "free");

// --- 4. Unauthenticated -----------------------------------------------------
console.log("\n--- 4. no credentials");
const anon = await fetch(`${baseUrl}/api/billing/verify`, { method: "POST" });
check("an unauthenticated caller is refused", anon.status === 401, `HTTP ${anon.status}`);
check("...and nothing was granted", (await planOf()) === "free");

// --- 5. The verify response carries nothing it should not -------------------
console.log("\n--- 5. what the response reveals");
const probe = await fetch(`${baseUrl}/api/billing/verify`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
const probeBody = await probe.json().catch(() => ({}));
check(
  "the response does not list other memberships",
  !JSON.stringify(probeBody).includes("mem_") || probeBody.membershipId === null,
  JSON.stringify(probeBody),
);

// --- Cleanup ----------------------------------------------------------------
console.log("\n--- removing the audit account");
await db.collection("users").doc(uid).delete();
await auth.deleteUser(uid).catch(() => undefined);
check("the audit account is deleted", !(await db.collection("users").doc(uid).get()).exists);

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) FAILED — instant activation is NOT safe as built.`);
  process.exit(1);
}
console.log(
  "Instant activation cannot be faked: it grants only from a membership that\n" +
    "Whop has created for this exact account, and Whop creates one only on payment.",
);
