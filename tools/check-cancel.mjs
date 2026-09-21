/**
 * Verifies the cancellation path, WITHOUT cancelling anything real.
 *
 * Run with: node tools/check-cancel.mjs [baseUrl]
 *
 * SAFETY
 * ------
 * Cancelling a real subscription is a destructive, customer-visible action, so
 * this tool checks Whop first and SKIPS any account whose stored membership
 * actually exists. It only exercises accounts whose stored id Whop does not
 * recognise — the stale-link case — because that is the one that can be tested
 * without side effects.
 *
 * WHAT IT CHECKS
 * --------------
 * A stale subscription link used to fail with "Nuk mund ta anulojmë abonimin
 * tani. Provo përsëri më vonë." on every attempt, forever, with no way for the
 * customer to resolve it. It should now:
 *   - be reported with a specific, actionable message, and
 *   - have the stale link cleared, so the UI stops offering a button that is
 *     guaranteed to fail.
 *
 * It also asserts the plan is NOT changed: dropping a management link must never
 * revoke access someone may have paid for.
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

const baseUrl = (process.argv[2] ?? "http://localhost:4200").replace(/\/+$/, "");

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
  if (!payload.idToken) throw new Error("token exchange failed");
  return payload.idToken;
}

/** True when Whop actually knows this membership. */
async function membershipExists(membershipId) {
  const response = await fetch(
    `https://api.whop.com/api/v1/memberships/${encodeURIComponent(membershipId)}`,
    { headers: { Authorization: `Bearer ${env.WHOP_API_KEY}` } },
  );
  return response.ok;
}

// --- Find an account with a STALE subscription link -------------------------
const users = await db.collection("users").get();

let target = null;

for (const doc of users.docs) {
  const data = doc.data();
  const subscriptionId = data.whopSubscriptionId;
  if (typeof subscriptionId !== "string" || !subscriptionId) continue;

  // Never touch a subscription that really exists.
  if (await membershipExists(subscriptionId)) {
    console.log(
      `skip  ${doc.id.slice(0, 10)}... has a real membership (${subscriptionId})`,
    );
    continue;
  }

  target = { uid: doc.id, subscriptionId, planBefore: data.plan };
  break;
}

if (!target) {
  console.log(
    "\nNo account has a stale subscription link, so there is nothing to test.\n" +
      "The real cancellation path cannot be exercised without cancelling a real\n" +
      "subscription, which this tool deliberately will not do.",
  );
  process.exit(0);
}

console.log(
  `\nTesting stale link: ${target.subscriptionId} on ${target.uid.slice(0, 10)}...`,
);

const token = await idTokenFor(target.uid);

const response = await fetch(`${baseUrl}/api/billing/cancel`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
const body = await response.json().catch(() => ({}));

console.log(`HTTP ${response.status}  ${JSON.stringify(body).slice(0, 160)}`);

let failures = 0;

/** Reports a result. */
function check(label, condition) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures += 1;
  }
}

check(
  "a stale subscription link is refused with a message, not a crash",
  response.status >= 400 && typeof body?.error?.message === "string",
);

const after = (await db.collection("users").doc(target.uid).get()).data() ?? {};

check(
  "the stale link was CLEARED so the button stops being offered",
  !after.whopSubscriptionId,
);

check(
  "the plan was NOT changed (access is never revoked by unlinking)",
  after.plan === target.planBefore,
);

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("Cancellation path handles a stale link correctly.");
