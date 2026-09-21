/**
 * Replays real, missed, paid webhook events so customers receive their plans.
 *
 * Run with:
 *   node tools/replay-missed-webhooks.mjs                      # report only
 *   node tools/replay-missed-webhooks.mjs --apply              # also deliver
 *
 * WHY THIS EXISTS
 * ---------------
 * A bug in `resolveWebhookUid` discarded paid events for any account that
 * already had a different subscription id stored — which is every returning
 * customer. The customer was charged and received nothing, and Whop considered
 * the delivery successful, so it never retried.
 *
 * Those events cannot be recovered from Whop's delivery log directly, but they
 * do not need to be: the MEMBERSHIP still exists, still carries the account id
 * in its metadata, and still states its product. This rebuilds the event Whop
 * would have sent, from that live data, and delivers it through the real
 * endpoint — so the real verification, resolution and entitlement code runs.
 *
 * SAFETY
 * ------
 *  - Only ACTIVE memberships are replayed. A cancelled or expired membership
 *    must not grant anything.
 *  - Deliveries whose account already holds the correct plan are skipped, so the
 *    command is safe to run repeatedly.
 *  - Without `--apply` nothing is delivered; it just prints what it would do.
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

const apply = process.argv.includes("--apply");
const baseUrl = (
  process.argv.find((a) => a.startsWith("http")) ?? "https://seigem.vercel.app"
).replace(/\/+$/, "");

const API = "https://api.whop.com/api/v1";
const auth = { Authorization: `Bearer ${env.WHOP_API_KEY}` };

/** Product id -> Seigem plan, from the deployed configuration. */
const PLAN_FOR_PRODUCT = {
  [env.WHOP_PLUS_PRODUCT_ID]: "plus",
  [env.WHOP_PRO_PRODUCT_ID]: "pro",
};

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

/** Ranks plans so the higher one wins when an account has several. */
const PLAN_RANK = { free: 0, plus: 1, pro: 2 };

const response = await fetch(`${API}/memberships?first=50`, { headers: auth });
if (!response.ok) {
  console.error(`Could not list memberships: HTTP ${response.status}`);
  process.exit(1);
}
const memberships = (await response.json()).data ?? [];

/** Active memberships, grouped by the account their metadata names. */
const byUid = new Map();

for (const membership of memberships) {
  if (!["active", "trialing", "canceling"].includes(membership.status)) continue;

  const uid = membership.metadata?.seigem_uid;
  if (typeof uid !== "string" || !uid) {
    console.log(
      `skip  ${membership.id}: no seigem_uid metadata (cannot be attributed)`,
    );
    continue;
  }

  const plan = PLAN_FOR_PRODUCT[membership.product_id];
  if (!plan) {
    console.log(
      `skip  ${membership.id}: product ${membership.product_id} is not mapped`,
    );
    continue;
  }

  const list = byUid.get(uid) ?? [];
  list.push({ membership, plan });
  byUid.set(uid, list);
}

let delivered = 0;
let skipped = 0;

for (const [uid, entries] of byUid) {
  // The account resolves to the highest plan it is paying for.
  const best = entries.reduce((a, b) => (PLAN_RANK[b.plan] > PLAN_RANK[a.plan] ? b : a));

  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists) {
    console.log(`skip  ${uid}: no user document (cannot be applied)`);
    skipped += 1;
    continue;
  }

  const data = snapshot.data() ?? {};
  const currentPlan = data.plan ?? "free";
  const storedSub = data.whopSubscriptionId ?? null;

  const alreadyCorrect =
    PLAN_RANK[currentPlan] >= PLAN_RANK[best.plan] &&
    storedSub === best.membership.id;

  console.log(
    `\n${uid}\n` +
      `  email      : ${data.email ?? "(none)"}\n` +
      `  plan now   : ${currentPlan}\n` +
      `  should be  : ${best.plan}  (membership ${best.membership.id})\n` +
      `  ${alreadyCorrect ? "already correct — nothing to do" : "NEEDS REPLAY"}`,
  );

  if (alreadyCorrect) {
    skipped += 1;
    continue;
  }

  if (!apply) continue;

  // --- Rebuild the event Whop would have sent -------------------------------
  const messageId = `msg_replay_${Date.now()}_${delivered}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const payload = {
    id: messageId,
    api_version: "v1",
    api_version_date: "2026-07-20",
    timestamp: new Date().toISOString(),
    type: "membership.activated",
    data: {
      id: best.membership.id,
      status: best.membership.status,
      product: {
        id: best.membership.product_id,
        title: "Replay",
        metadata: null,
      },
      plan: { id: best.membership.plan_id ?? null, metadata: null },
      metadata: { seigem_uid: uid },
      cancel_at_period_end: best.membership.cancel_at_period_end ?? false,
      renewal_period_end: best.membership.current_period_end ?? null,
    },
  };

  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", env.WHOP_WEBHOOK_SECRET)
    .update(`${messageId}.${timestamp}.${rawBody}`)
    .digest("base64");

  const delivered_response = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": messageId,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
    body: rawBody,
  });

  const body = await delivered_response.text();
  console.log(`  -> HTTP ${delivered_response.status}  ${body.slice(0, 120)}`);

  const after = (await db.collection("users").doc(uid).get()).data() ?? {};
  console.log(`  plan after : ${after.plan}  sub=${after.whopSubscriptionId}`);

  delivered += 1;
}

console.log(
  `\n${apply ? `Replayed ${delivered}` : "Would replay (dry run)"}, skipped ${skipped}.`,
);
if (!apply) {
  console.log("Add --apply to deliver the events.");
}
