/**
 * Verifies the admin panel's security boundary.
 *
 * Run with:
 *   node tools/check-admin.mjs                      # against production
 *   node tools/check-admin.mjs http://localhost:3000
 *
 * WHY THIS IS THE MOST IMPORTANT TOOL HERE
 * ----------------------------------------
 * The admin panel can grant paid plans for free and cancel customers'
 * subscriptions. A mistake in its guard is worse than any bug found so far: no
 * test failure, no error, no symptom — just anyone with an account able to give
 * themselves Pro.
 *
 * So this attacks the endpoints rather than trusting them:
 *
 *   1. No token at all
 *   2. A valid token from a NON-admin account
 *   3. A valid token from the admin account
 *
 * and after every refusal it re-reads Firestore to prove nothing changed. A 404
 * that still mutated the plan would pass a naive check.
 *
 * The admin uid comes from ADMIN_UIDS; the non-admin is any other account. It
 * changes the plan of a FREE sandbox account and restores it afterwards, so no
 * paying customer is touched.
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

/** Calls an admin endpoint. */
async function call(pathname, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
  };
}

/** Reads a uid's stored plan. */
async function planOf(uid) {
  const data = (await db.collection("users").doc(uid).get()).data() ?? {};
  return data.plan ?? "(none)";
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

// --- Identify the accounts --------------------------------------------------
const configuredAdmins = (env.ADMIN_UIDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (configuredAdmins.length === 0) {
  console.error(
    "ADMIN_UIDS is empty in .env.local, so there is no admin to test with.\n" +
      "Note: the DEPLOYED value is what matters — check Vercel as well.",
  );
  process.exit(1);
}

const adminUid = configuredAdmins[0];

/*
 * A THROWAWAY account, created and deleted by this tool.
 *
 * Earlier versions looked for an existing free account to use as a sandbox. That
 * is not safe enough: an account can sit on the free plan while still holding a
 * paid subscription (a cancelled-but-paid-up customer), and temporarily
 * changing its plan would take away access they are owed.
 *
 * Creating a dedicated account means ZERO risk to real customers, and it doubles
 * as the non-admin used to test the refusal path.
 */
const throwaway = await auth.createUser({
  email: `admin-audit-${Date.now()}@example.invalid`,
  displayName: "Admin audit",
  emailVerified: false,
});

const sandbox = { uid: throwaway.uid };
const nonAdmin = { uid: throwaway.uid, email: throwaway.email };

await db.collection("users").doc(throwaway.uid).set(
  {
    email: throwaway.email,
    displayName: "Admin audit",
    plan: "free",
    planExpiresAt: null,
    whopSubscriptionId: null,
    cancelAtPeriodEnd: false,
    createdAt: adminFirestore.FieldValue.serverTimestamp(),
    updatedAt: adminFirestore.FieldValue.serverTimestamp(),
  },
  { merge: true },
);

console.log(`admin     : ${adminUid}`);
console.log(`throwaway : ${throwaway.uid}  (created for this run, deleted at the end)\n`);

const adminToken = await idTokenFor(adminUid);
const nonAdminToken = await idTokenFor(throwaway.uid);

// --- 1. No credentials ------------------------------------------------------
console.log("--- 1. anonymous access");
let result = await call("/api/admin/users");
check("anonymous list is refused (401)", result.status === 401, `got ${result.status}`);

result = await call(`/api/admin/users/${sandbox.uid}`, {
  method: "POST",
  body: { action: "set_plan", plan: "pro", days: 30 },
});
check("anonymous mutation is refused (401)", result.status === 401, `got ${result.status}`);
check("...and the plan was NOT changed", (await planOf(sandbox.uid)) === "free");

// --- 2. A signed-in NON-admin ----------------------------------------------
console.log("\n--- 2. a signed-in non-admin (the case that matters)");
result = await call("/api/admin/users", { token: nonAdminToken });
check(
  "non-admin cannot list users (404, not 403)",
  result.status === 404,
  `got ${result.status} — a 403 would confirm the endpoint exists`,
);

result = await call(`/api/admin/users/${sandbox.uid}`, {
  token: nonAdminToken,
  method: "POST",
  body: { action: "set_plan", plan: "pro", days: 365 },
});
check("non-admin cannot grant themselves Pro", result.status === 404, `got ${result.status}`);
check(
  "...and the target plan was NOT changed",
  (await planOf(sandbox.uid)) === "free",
  `plan is now ${await planOf(sandbox.uid)}`,
);

result = await call(`/api/admin/users/${nonAdmin.uid}`, {
  token: nonAdminToken,
  method: "POST",
  body: { action: "set_plan", plan: "pro", days: 365 },
});
check(
  "non-admin cannot grant themselves Pro on their OWN uid",
  result.status === 404 && (await planOf(nonAdmin.uid)) === "free",
  `status ${result.status}, plan ${await planOf(nonAdmin.uid)}`,
);

result = await call("/api/admin/session", { token: nonAdminToken });
check("session reports isAdmin=false", result.body?.isAdmin === false);

// --- 3. The admin -----------------------------------------------------------
console.log("\n--- 3. the admin");
result = await call("/api/admin/users", { token: adminToken });
check("admin can list users", result.status === 200, `got ${result.status}`);
check(
  "the list is non-empty and well formed",
  Array.isArray(result.body?.users) &&
    result.body.users.length > 0 &&
    typeof result.body.users[0]?.plan === "string",
  `got ${result.body?.users?.length ?? 0} rows`,
);
check(
  "the throwaway account appears in the list",
  (result.body?.users ?? []).some((u) => u.uid === throwaway.uid),
);

result = await call("/api/admin/session", { token: adminToken });
check("session reports isAdmin=true", result.body?.isAdmin === true);

// --- 4. Admin actions actually work ----------------------------------------
console.log("\n--- 4. admin actions");
result = await call(`/api/admin/users/${sandbox.uid}`, {
  token: adminToken,
  method: "POST",
  body: { action: "set_plan", plan: "pro", days: 30 },
});
check("admin can grant Pro", result.status === 200, JSON.stringify(result.body).slice(0, 90));

let stored = (await db.collection("users").doc(sandbox.uid).get()).data() ?? {};
check("...the plan is stored as pro", stored.plan === "pro");
check(
  "...and an expiry was set (30 days), not left open",
  stored.planExpiresAt instanceof adminFirestore.Timestamp,
);

// A permanent grant must be explicit, never a side effect of a missing value.
result = await call(`/api/admin/users/${sandbox.uid}`, {
  token: adminToken,
  method: "POST",
  body: { action: "set_plan", plan: "free", days: null },
});
stored = (await db.collection("users").doc(sandbox.uid).get()).data() ?? {};
check("admin can return an account to free", stored.plan === "free");
check("...and the expiry is cleared", !stored.planExpiresAt);

// --- 5. Bad input is rejected ----------------------------------------------
console.log("\n--- 5. invalid input");
result = await call(`/api/admin/users/${sandbox.uid}`, {
  token: adminToken,
  method: "POST",
  body: { action: "set_plan", plan: "enterprise", days: 30 },
});
check("an unknown plan is rejected", result.status === 400, `got ${result.status}`);
check("...and the plan is unchanged", (await planOf(sandbox.uid)) === "free");

result = await call(`/api/admin/users/${sandbox.uid}`, {
  token: adminToken,
  method: "POST",
  body: { action: "set_plan", plan: "pro", days: 999999 },
});
check("an absurd duration is rejected", result.status === 400, `got ${result.status}`);

result = await call("/api/admin/users/../../../etc/passwd", {
  token: adminToken,
  method: "POST",
  body: { action: "set_plan", plan: "pro", days: 30 },
});
check(
  "a path-traversal uid is rejected",
  result.status === 400 || result.status === 404,
  `got ${result.status}`,
);

result = await call(`/api/admin/users/${sandbox.uid}`, {
  token: adminToken,
  method: "POST",
  body: { action: "delete_everything" },
});
check("an unknown action is rejected", result.status === 400, `got ${result.status}`);

// --- 6. Cancellation --------------------------------------------------------
console.log("\n--- 6. cancellation");
result = await call(`/api/admin/users/${sandbox.uid}`, {
  token: adminToken,
  method: "POST",
  body: { action: "cancel_subscription" },
});
check(
  "cancelling an account with no subscription fails clearly",
  result.status === 400 &&
    typeof result.body?.error?.message === "string" &&
    result.body.error.message.length > 10,
  `status ${result.status}: ${JSON.stringify(result.body).slice(0, 110)}`,
);
check("...and the account is untouched", (await planOf(sandbox.uid)) === "free");

// --- Restore ----------------------------------------------------------------
/*
 * The throwaway account is DELETED, not merely reset: leaving test accounts in
 * the user list would pollute the very admin panel this tool checks, and a stray
 * account is a stray surface.
 */
console.log("\n--- removing the throwaway account");
await db.collection("users").doc(throwaway.uid).delete();
await auth.deleteUser(throwaway.uid).catch(() => undefined);

const gone = await db.collection("users").doc(throwaway.uid).get();
check("the throwaway account is deleted", !gone.exists);

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) FAILED — the admin boundary is not sound.`);
  process.exit(1);
}
console.log("The admin boundary is sound: only admins can administer.");
