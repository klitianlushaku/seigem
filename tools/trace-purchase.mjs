/**
 * Full trace of a recent purchase: payment -> membership -> metadata -> account.
 *
 * Run with: node tools/trace-purchase.mjs [email]
 *
 * Answers the only question that matters when a customer has paid and received
 * nothing: at WHICH step did it break?
 *
 *   1. Did the payment succeed at Whop?
 *   2. Is there a membership, and is it active?
 *   3. Does that membership carry the `seigem_uid` metadata?
 *   4. Does that uid exist as a user document in Firestore?
 *   5. What plan is recorded on it?
 *
 * Any "no" identifies the exact failure, and they need different fixes.
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

const API = "https://api.whop.com/api/v1";
const auth = { Authorization: `Bearer ${env.WHOP_API_KEY}` };
const emailWanted = (process.argv[2] ?? "").trim().toLowerCase();

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

// --- 1. Recent payments -----------------------------------------------------
const paymentsResponse = await fetch(`${API}/payments?first=6`, { headers: auth });
const payments = (await paymentsResponse.json()).data ?? [];

console.log("=== recent payments ===");
for (const payment of payments) {
  const amount = payment.total?.amount;
  console.log(
    `  ${payment.id}  ${payment.status.padEnd(8)} ` +
      `${String(amount).padStart(6)} ${payment.total?.currency?.toUpperCase() ?? ""}  ` +
      `${payment.created_at}`,
  );
}

// --- 2. Recent memberships, with metadata -----------------------------------
const membershipsResponse = await fetch(`${API}/memberships?first=8`, {
  headers: auth,
});
const memberships = (await membershipsResponse.json()).data ?? [];

console.log("\n=== recent memberships ===");
for (const membership of memberships) {
  const metadata = membership.metadata ?? {};
  console.log(
    `  ${membership.id}\n` +
      `      status=${membership.status} product=${membership.product_id} ` +
      `cancel_at_period_end=${membership.cancel_at_period_end}\n` +
      `      seigem_uid=${metadata.seigem_uid ?? "(MISSING)"}\n` +
      `      created=${membership.created_at}`,
  );
}

// --- 3. Does the uid have a plan? -------------------------------------------
const users = await db.collection("users").get();
console.log("\n=== accounts ===");
for (const doc of users.docs) {
  const data = doc.data();
  const email = String(data.email ?? "").toLowerCase();
  const match = emailWanted && email === emailWanted ? "  <-- THIS ONE" : "";
  console.log(
    `  ${doc.id}\n` +
      `      email=${data.email ?? "(none)"} plan=${data.plan} ` +
      `sub=${data.whopSubscriptionId ?? "(none)"}${match}`,
  );
}

// --- 4. The decisive answer -------------------------------------------------
console.log("\n=== diagnosis ===");

let targetUid = null;
if (emailWanted) {
  for (const doc of users.docs) {
    if (String(doc.data().email ?? "").toLowerCase() === emailWanted) {
      targetUid = doc.id;
    }
  }
  if (!targetUid) {
    console.log(
      `  NO user document exists for ${emailWanted}.\n` +
        "  If a webhook arrived, resolveWebhookUid returns null when the uid has\n" +
        "  no document, and the paid event is NOT APPLIED.",
    );
  } else {
    const data = (await db.collection("users").doc(targetUid).get()).data() ?? {};
    console.log(`  uid for ${emailWanted}: ${targetUid}`);
    console.log(`  plan=${data.plan}  sub=${data.whopSubscriptionId ?? "(none)"}`);
  }
}

const paidMemberships = memberships.filter((m) =>
  ["active", "trialing", "canceling"].includes(m.status),
);

console.log("\n  Active memberships and whether they name an account:");
for (const membership of paidMemberships) {
  const uid = membership.metadata?.seigem_uid;
  let exists = false;
  if (uid) {
    exists = (await db.collection("users").doc(uid).get()).exists;
  }
  console.log(
    `    ${membership.id}  uid=${uid ?? "(MISSING)"} ` +
      `uidDocExists=${uid ? exists : "n/a"}  status=${membership.status}`,
  );
}
