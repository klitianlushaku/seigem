/**
 * Adversarial audit of the billing webhook logic.
 *
 * Run with:
 *   node tools/audit-billing.mjs                  # against production
 *   node tools/audit-billing.mjs http://localhost:3000
 *
 * WHY THIS EXISTS
 * ---------------
 * A bug shipped that silently ate real payments: `resolveWebhookUid` refused the
 * checkout metadata whenever an account already had a different subscription id
 * stored, so any RETURNING customer paid and received nothing. The existing tests
 * all used fresh accounts, so every one of them passed.
 *
 * This tests the cases a returning customer actually produces. It drives the
 * DEPLOYED webhook endpoint with correctly-signed events, because that is the
 * only way to exercise signature verification, account resolution, entitlement
 * and persistence together.
 *
 * It runs against a single sandbox account, uses synthetic membership ids, and
 * restores that account to free at the end.
 */
/* eslint-disable no-console -- a CLI tool; printed output is the deliverable */
import { createHmac } from "node:crypto";
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
const adminFirestore = require(path.join(packageRoot, "lib", "firestore", "index.js"));

const app = adminApp.initializeApp({
  credential: adminApp.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});
const db = adminFirestore.getFirestore(app);

/** Delivers a signed event, exactly as Whop's backend would. */
async function deliver(type, data) {
  const messageId = `msg_audit_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const payload = {
    id: messageId,
    api_version: "v1",
    api_version_date: "2026-07-20",
    timestamp: new Date().toISOString(),
    type,
    data,
  };

  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", env.WHOP_WEBHOOK_SECRET)
    .update(`${messageId}.${timestamp}.${rawBody}`)
    .digest("base64");

  const response = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": messageId,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
    body: rawBody,
  });

  return { status: response.status, body: await response.json().catch(() => ({})) };
}

/** Builds membership data in the shape the webhook carries. */
function membershipData({ id, productId, status, uid, cancelAtPeriodEnd = false }) {
  return {
    id,
    status,
    product: { id: productId, title: "Audit", metadata: null },
    plan: { id: "plan_audit", metadata: null },
    metadata: { seigem_uid: uid },
    cancel_at_period_end: cancelAtPeriodEnd,
    renewal_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
  };
}

/** Reads a uid's stored plan and subscription link. */
async function stateOf(uid) {
  const data = (await db.collection("users").doc(uid).get()).data() ?? {};
  return { plan: data.plan, sub: data.whopSubscriptionId ?? null };
}

// --- Pick a sandbox account -------------------------------------------------
/*
 * The account must be on the free plan and hold no subscription, so the audit
 * cannot disturb a paying customer. Synthetic membership ids are used, and the
 * account is returned to free at the end.
 */
const users = await db.collection("users").get();
const sandbox = users.docs
  .map((doc) => ({ uid: doc.id, data: doc.data() }))
  .find((u) => u.data.plan === "free" && !u.data.whopSubscriptionId);

if (!sandbox) {
  console.error(
    "No free account without a subscription is available to use as a sandbox.\n" +
      "Refusing to run: this audit must not touch a paying customer.",
  );
  process.exit(1);
}

const uid = sandbox.uid;
console.log(`Sandbox account: ${uid} (${sandbox.data.email ?? "no email"})`);
console.log(`Target: ${baseUrl}\n`);

const MEMBERSHIP_A = "mem_audit_old_0001";
const MEMBERSHIP_B = "mem_audit_new_0002";

let failures = 0;

/** Reports a scenario result. */
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}\n` +
      `        expected plan="${expected}", got plan="${actual}"`,
  );
}

// --- Scenario 1: a first purchase grants the plan ---------------------------
console.log("--- 1. first purchase grants the plan");
let result = await deliver(
  "membership.activated",
  membershipData({
    id: MEMBERSHIP_A,
    productId: env.WHOP_PLUS_PRODUCT_ID,
    status: "active",
    uid,
  }),
);
console.log(`        HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 80)}`);
check("first activation grants Plus", (await stateOf(uid)).plan, "plus");

// --- Scenario 2: a SECOND purchase upgrades, replacing the first ------------
console.log("\n--- 2. a returning customer upgrades (the bug that ate payments)");
result = await deliver(
  "membership.activated",
  membershipData({
    id: MEMBERSHIP_B,
    productId: env.WHOP_PRO_PRODUCT_ID,
    status: "active",
    uid,
  }),
);
console.log(`        HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 80)}`);
let state = await stateOf(uid);
check("second activation upgrades to Pro", state.plan, "pro");
console.log(`        subscription link is now ${state.sub}`);

// --- Scenario 3: a late event for the OLD subscription must not downgrade ---
console.log(
  "\n--- 3. a delayed deactivation for the SUPERSEDED subscription\n" +
    "        (Whop can deliver out of order; this must not revoke a newer plan)",
);
result = await deliver(
  "membership.deactivated",
  membershipData({
    id: MEMBERSHIP_A,
    productId: env.WHOP_PLUS_PRODUCT_ID,
    status: "deactivated",
    uid,
  }),
);
console.log(`        HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 80)}`);
state = await stateOf(uid);
check("stale deactivation does NOT downgrade", state.plan, "pro");

// --- Scenario 4: a late ACTIVATION for the OLD subscription must not downgrade
console.log(
  "\n--- 4. a delayed ACTIVATION for the SUPERSEDED subscription\n" +
    "        (the mirror of scenario 3: a late Plus must not replace an active Pro)",
);
result = await deliver(
  "membership.activated",
  membershipData({
    id: MEMBERSHIP_A,
    productId: env.WHOP_PLUS_PRODUCT_ID,
    status: "active",
    uid,
  }),
);
console.log(`        HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 80)}`);
check("stale activation does NOT downgrade", (await stateOf(uid)).plan, "pro");

// --- Scenario 5: deactivating the CURRENT subscription DOES downgrade -------
console.log("\n--- 5. the current subscription ending does downgrade");
result = await deliver(
  "membership.deactivated",
  membershipData({
    id: MEMBERSHIP_B,
    productId: env.WHOP_PRO_PRODUCT_ID,
    status: "deactivated",
    uid,
  }),
);
console.log(`        HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 80)}`);
check("current deactivation downgrades to free", (await stateOf(uid)).plan, "free");

// --- Scenario 6: a NEW purchase after a revoke still works ------------------
console.log(
  "\n--- 6. re-subscribing after the previous subscription ended\n" +
    "        (the account is free, so a Plus grant must be applied)",
);
result = await deliver(
  "membership.activated",
  membershipData({
    id: MEMBERSHIP_A,
    productId: env.WHOP_PLUS_PRODUCT_ID,
    status: "active",
    uid,
  }),
);
console.log(`        HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 80)}`);
check("re-subscribing grants Plus", (await stateOf(uid)).plan, "plus");

// --- Scenario 7: duplicate delivery is harmless -----------------------------
console.log("\n--- 7. the same event delivered twice (Whop retries)");
await deliver(
  "membership.activated",
  membershipData({
    id: MEMBERSHIP_A,
    productId: env.WHOP_PLUS_PRODUCT_ID,
    status: "active",
    uid,
  }),
);
await deliver(
  "membership.activated",
  membershipData({
    id: MEMBERSHIP_A,
    productId: env.WHOP_PLUS_PRODUCT_ID,
    status: "active",
    uid,
  }),
);
check("a duplicate activation is idempotent", (await stateOf(uid)).plan, "plus");

// --- Scenario 8: a scheduled cancellation keeps access ----------------------
console.log("\n--- 8. cancelling at period end must NOT revoke access");
result = await deliver(
  "membership.cancel_at_period_end_changed",
  membershipData({
    id: MEMBERSHIP_A,
    productId: env.WHOP_PLUS_PRODUCT_ID,
    status: "canceling",
    uid,
    cancelAtPeriodEnd: true,
  }),
);
console.log(`        HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 80)}`);
check("scheduled cancellation keeps the plan", (await stateOf(uid)).plan, "plus");

// --- Restore the sandbox ----------------------------------------------------
console.log("\n--- restoring the sandbox account to free");
await deliver(
  "membership.deactivated",
  membershipData({
    id: MEMBERSHIP_A,
    productId: env.WHOP_PLUS_PRODUCT_ID,
    status: "deactivated",
    uid,
  }),
);

const finalState = await stateOf(uid);
console.log(`        plan=${finalState.plan} sub=${finalState.sub}`);

if (finalState.plan !== "free") {
  console.log(
    "        WARNING: the sandbox account was not returned to free. " +
      "Reset it manually.",
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} scenario(s) FAILED — see above.`);
  process.exit(1);
}
console.log("All billing scenarios behave correctly.");
