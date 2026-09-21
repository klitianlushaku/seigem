/**
 * Verifies what happens when a NEW user signs up.
 *
 * Run with:
 *   node tools/check-new-user.mjs                       # against production
 *   node tools/check-new-user.mjs http://localhost:3000
 *
 * WHY THIS EXISTS
 * ---------------
 * The admin panel lists accounts with `orderBy(createdAt, "desc")`. Firestore
 * SILENTLY OMITS any document missing the ordered field, so an account created
 * without `createdAt` would be invisible in the panel — no error, no warning,
 * just a customer the admin cannot see or manage. That is exactly the kind of
 * failure that only shows up when someone asks "why isn't this user in the list".
 *
 * So this walks the real signup path and then checks the account is actually
 * visible and manageable:
 *
 *   1. Create a fresh account (as Firebase does on first sign-in)
 *   2. Call the profile endpoint the app calls on sign-in
 *   3. Assert the stored document: free plan, a creation date, zero usage
 *   4. Assert the account APPEARS in the admin list
 *   5. Assert an admin can manage it
 *
 * Everything is deleted afterwards.
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

const admins = (env.ADMIN_UIDS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
if (admins.length === 0) {
  console.error("ADMIN_UIDS is empty in .env.local; cannot test the admin list.");
  process.exit(1);
}

console.log(`Target: ${baseUrl}\n`);

// --- Sweep anything a killed run left behind --------------------------------
for (const candidate of (await auth.listUsers(1000)).users) {
  if ((candidate.email ?? "").includes("newuser-audit-")) {
    await db.collection("users").doc(candidate.uid).delete().catch(() => undefined);
    await auth.deleteUser(candidate.uid).catch(() => undefined);
    console.log(`Cleaned up a leftover: ${candidate.uid}`);
  }
}

// --- 1. A brand-new account, as Firebase creates on first sign-in -----------
console.log("--- 1. a brand new account");
const fresh = await auth.createUser({
  email: `newuser-audit-${Date.now()}@example.invalid`,
  displayName: "New User Audit",
  emailVerified: false,
});

const freshToken = await idTokenFor(fresh.uid);

// The document must NOT exist yet: this is the state the app sees on first login.
const before = await db.collection("users").doc(fresh.uid).get();
check("no account document exists before first sign-in", !before.exists);

// --- 2. The call the app makes on sign-in -----------------------------------
console.log("\n--- 2. the sign-in call");
const profileResponse = await fetch(`${baseUrl}/api/auth/profile`, {
  method: "POST",
  headers: { Authorization: `Bearer ${freshToken}` },
});
const profileBody = await profileResponse.json().catch(() => ({}));
/*
 * 201 for a created account and 200 when one already existed — the correct REST
 * semantics. Asserting 200 alone failed on the very first real signup.
 */
check(
  "the profile endpoint accepts a new account",
  profileResponse.status === 201 || profileResponse.status === 200,
  `HTTP ${profileResponse.status} ${JSON.stringify(profileBody).slice(0, 100)}`,
);
check("it returns 201 Created for a brand new account", profileResponse.status === 201);
check("it reports the account as newly created", profileBody?.created === true);

// Unauthenticated calls must be refused.
const anon = await fetch(`${baseUrl}/api/auth/profile`, { method: "POST" });
check("the profile endpoint refuses an unauthenticated call", anon.status === 401);

// --- 3. What was stored -----------------------------------------------------
console.log("\n--- 3. the stored account");
const stored = (await db.collection("users").doc(fresh.uid).get()).data() ?? {};

check("a document now exists", Object.keys(stored).length > 0);
check(`the plan defaults to free (got "${stored.plan}")`, stored.plan === "free");
check("no expiry is set on a free account", !stored.planExpiresAt);
check("no subscription is linked", !stored.whopSubscriptionId);
check("the cancellation flag is clear", stored.cancelAtPeriodEnd !== true);
check(
  "the email is recorded",
  stored.email === fresh.email,
  `got ${JSON.stringify(stored.email)}`,
);
check(
  "the display name is recorded",
  stored.displayName === "New User Audit",
  `got ${JSON.stringify(stored.displayName)}`,
);
check("today's usage starts at zero for documents", stored.usage?.documents === 0);
check("today's usage starts at zero for flashcards", stored.usage?.flashcards === 0);
check("today's usage starts at zero for quiz questions", stored.usage?.quizQuestions === 0);
check(
  "a usage day key is set, so quotas work immediately",
  typeof stored.usage?.dayKey === "string" && stored.usage.dayKey.length === 10,
  `got ${JSON.stringify(stored.usage?.dayKey)}`,
);

/*
 * THE ONE THAT MATTERS FOR THE ADMIN PANEL.
 *
 * The panel orders by createdAt. Firestore omits documents missing an ordered
 * field from the result entirely, so a missing createdAt means a customer the
 * admin can never see.
 */
check(
  "createdAt is set (without it the account is INVISIBLE to the admin panel)",
  stored.createdAt instanceof adminFirestore.Timestamp,
  `got ${typeof stored.createdAt}`,
);

// --- 4. Does the admin actually SEE them? -----------------------------------
console.log("\n--- 4. is the new account visible in the admin panel?");
const adminToken = await idTokenFor(admins[0]);
const listResponse = await fetch(`${baseUrl}/api/admin/users`, {
  headers: { Authorization: `Bearer ${adminToken}` },
});
const listBody = await listResponse.json().catch(() => ({}));

check("the admin can list users", listResponse.status === 200, `HTTP ${listResponse.status}`);

const row = (listBody.users ?? []).find((u) => u.uid === fresh.uid);
check("the new account appears in the admin list", Boolean(row));

if (row) {
  check("...with the free plan", row.plan === "free");
  check("...with a readable creation date", typeof row.createdAt === "string");
  check("...and today's usage", row.usage?.documents === 0);
}

// --- 5. Can the admin manage them? ------------------------------------------
console.log("\n--- 5. can the admin manage the new account?");
const grantResponse = await fetch(`${baseUrl}/api/admin/users/${fresh.uid}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  },
  body: JSON.stringify({ action: "set_plan", plan: "plus", days: 30 }),
});
check(
  "the admin can grant Plus to a brand new account",
  grantResponse.status === 200,
  `HTTP ${grantResponse.status}`,
);

const afterGrant = (await db.collection("users").doc(fresh.uid).get()).data() ?? {};
check("...and it is stored", afterGrant.plan === "plus");

// Does the account itself see the change? This is the join between the admin
// panel and what the customer experiences.
const usageResponse = await fetch(`${baseUrl}/api/generate`, {
  headers: { Authorization: `Bearer ${freshToken}` },
});
const usageBody = await usageResponse.json().catch(() => ({}));
check(
  "the new account now reports the Plus plan to itself",
  usageBody?.plan === "plus",
  `got ${JSON.stringify(usageBody?.plan)}`,
);
/*
 * The FULL Plus quota, because nothing has been used yet: `remaining` is
 * limit-minus-used, not the limit itself. An earlier assertion expected 49 and
 * failed — it had been copied from an account that had already generated one
 * document that day.
 */
check(
  "...with the full Plus quota of 50, not the free 2",
  usageBody?.remaining?.documents === 50 && usageBody?.remaining?.flashcards === 50,
  `got ${JSON.stringify(usageBody?.remaining)}`,
);

// --- 6. Signing in again must not reset anything ----------------------------
console.log("\n--- 6. signing in again is safe");
const again = await fetch(`${baseUrl}/api/auth/profile`, {
  method: "POST",
  headers: { Authorization: `Bearer ${freshToken}` },
});
const againBody = await again.json().catch(() => ({}));
check("a second sign-in succeeds", again.status === 200);
check("...and does not report the account as newly created", againBody?.created === false);

const afterAgain = (await db.collection("users").doc(fresh.uid).get()).data() ?? {};
check(
  "a second sign-in does NOT reset the plan back to free",
  afterAgain.plan === "plus",
  `plan is now ${afterAgain.plan}`,
);
check(
  "a second sign-in does not clear the expiry",
  afterAgain.planExpiresAt instanceof adminFirestore.Timestamp,
);

// --- Cleanup ----------------------------------------------------------------
console.log("\n--- removing the test account");
await db.collection("users").doc(fresh.uid).delete();
await auth.deleteUser(fresh.uid).catch(() => undefined);
check("the test account is deleted", !(await db.collection("users").doc(fresh.uid).get()).exists);

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("A new signup is created, visible to the admin, and manageable.");
