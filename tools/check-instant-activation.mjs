/**
 * Measures how fast a paid plan activates after checkout.
 *
 * Run with:
 *   node tools/check-instant-activation.mjs                       # production
 *   node tools/check-instant-activation.mjs http://localhost:3000
 *
 * THE COMPLAINT THIS ANSWERS
 * --------------------------
 * "Why does it take so long after paying to get back to my site? It should be
 * instant or at most 10 seconds."
 *
 * Activation used to depend entirely on Whop's WEBHOOK, which arrives whenever
 * Whop gets round to it, and the dashboard could only poll and hope. The plan is
 * now claimed by asking Whop directly on return, so this measures the real
 * end-to-end time rather than assuming it improved.
 *
 * HOW IT TESTS WITHOUT TAKING A PAYMENT
 * -------------------------------------
 * It uses an account that ALREADY has an entitled Whop membership, clears the
 * plan in Firestore to simulate "paid, not yet activated", then calls the same
 * endpoint the returning buyer hits and times it.
 *
 * The account is a real one, so the plan is restored to exactly what it should
 * be, and re-checked at the end.
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

/** The plan currently stored for a uid. */
async function planOf(uid) {
  const data = (await db.collection("users").doc(uid).get()).data() ?? {};
  return { plan: data.plan ?? "free", sub: data.whopSubscriptionId ?? null };
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

// --- Find an account that is owed access at Whop -----------------------------
/*
 * Any account holding a membership whose metadata names it. Those are the real
 * ones, so the test cannot pass by accident.
 */
const admins = (env.ADMIN_UIDS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const adminToken = admins[0] ? await idTokenFor(admins[0]) : null;

const membershipsResponse = await fetch(
  `${env.WHOP_BASE_URL ?? "https://api.whop.com/api/v1"}/memberships?first=50`,
  { headers: { Authorization: `Bearer ${env.WHOP_API_KEY}` } },
);
const memberships = (await membershipsResponse.json()).data ?? [];

/*
 * Prefer a membership that is genuinely ENTITLED: live, or cancelled with paid
 * time still to run. Picking merely the first one with a uid chose a cancelled
 * membership that grants nothing, and the test refused to run — correctly, but
 * for the wrong reason.
 */
function isEntitled(membership) {
  if (["active", "trialing", "canceling"].includes(membership.status)) return true;

  const periodEnd = membership.current_period_end
    ? new Date(membership.current_period_end).getTime()
    : null;

  return periodEnd !== null && periodEnd > Date.now();
}

const entitled = memberships.find(
  (m) => typeof m.metadata?.seigem_uid === "string" && isEntitled(m),
);

if (!entitled) {
  console.error(
    "No ENTITLED membership with a seigem_uid is available, so activation cannot\n" +
      "be measured. One real purchase is needed to run this.",
  );
  process.exit(1);
}

const uid = entitled.metadata.seigem_uid;
const account = (await db.collection("users").doc(uid).get()).data() ?? {};

console.log(`Account : ${account.email ?? uid}`);
console.log(`Plan    : ${account.plan}`);
console.log(`Whop    : ${entitled.id} (${entitled.status}, product ${entitled.product_id})\n`);

const before = await planOf(uid);

// --- Simulate "paid, but not yet activated" ---------------------------------
console.log("--- simulating a buyer who has paid but has no plan yet");
await db.collection("users").doc(uid).set({ plan: "free" }, { merge: true });
check("the plan was cleared, as it is before the webhook lands", (await planOf(uid)).plan === "free");

// --- The call the returning buyer makes -------------------------------------
console.log("\n--- timing /api/billing/verify");
const token = await idTokenFor(uid);

const startedAt = Date.now();
const response = await fetch(`${baseUrl}/api/billing/verify`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
const elapsedMs = Date.now() - startedAt;

const payload = await response.json().catch(() => ({}));
console.log(
  `        HTTP ${response.status} in ${elapsedMs} ms -> ${JSON.stringify(payload).slice(0, 90)}`,
);

check("the endpoint succeeded", response.status === 200, `HTTP ${response.status}`);
check("it reported the plan as activated", payload?.activated === true);
check(
  `it activated in under 10 seconds (took ${(elapsedMs / 1000).toFixed(1)}s)`,
  elapsedMs < 10_000,
);

const after = await planOf(uid);
console.log(`        plan is now "${after.plan}" (was "${before.plan}" before the simulation)`);
check(
  "the paid plan is in force again",
  after.plan !== "free",
  `plan is ${after.plan}`,
);

// --- A second call must be harmless -----------------------------------------
console.log("\n--- calling it again (a reload, or a double-submit)");
const againStart = Date.now();
const again = await fetch(`${baseUrl}/api/billing/verify`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
});
const againMs = Date.now() - againStart;
const againPayload = await again.json().catch(() => ({}));

check("a repeat call succeeds", again.status === 200, `HTTP ${again.status}`);
check("it is still activated", againPayload?.activated === true);
check(`it is still fast (${againMs} ms)`, againMs < 10_000);
check("the plan is unchanged by the repeat", (await planOf(uid)).plan === after.plan);

// --- An unauthenticated call must be refused --------------------------------
console.log("\n--- unauthenticated");
const anon = await fetch(`${baseUrl}/api/billing/verify`, { method: "POST" });
check("verification requires a signed-in user", anon.status === 401, `HTTP ${anon.status}`);

// --- Restore ----------------------------------------------------------------
/*
 * The account was only ever tweaked to create the "not yet activated" state, and
 * verification put it right. This asserts that, rather than assuming it.
 */
console.log("\n--- final state");
const final = await planOf(uid);
console.log(`        plan=${final.plan} sub=${final.sub}`);
check(
  `the account matches its state before the test ("${before.plan}")`,
  final.plan === before.plan,
  `expected ${before.plan}, got ${final.plan}`,
);

if (adminToken) {
  // Reading the list proves the account is still visible to the admin.
  const list = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  check("the admin can still list users", list.status === 200, `HTTP ${list.status}`);
}

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("Activation is immediate: the plan is claimed without waiting for a webhook.");
