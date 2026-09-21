/**
 * Sends a REAL, correctly-signed Whop webhook to a deployment — no payment.
 *
 * Run with:
 *   node tools/simulate-whop-webhook.mjs activate plus
 *   node tools/simulate-whop-webhook.mjs deactivate
 *   node tools/simulate-whop-webhook.mjs activate pro --user <uid>
 *   node tools/simulate-whop-webhook.mjs activate plus --url http://localhost:3000
 *
 * WHY THIS EXISTS
 * ---------------
 * A payment is the slowest and most expensive way to test whether a webhook
 * grants a plan. This signs a `membership.activated` event exactly the way
 * Whop's backend does and posts it to the real endpoint, so the ENTIRE server
 * path is exercised for free:
 *
 *   signature verification -> account resolution -> plan mapping
 *   -> Firestore write -> entitlement
 *
 * It uses the production signing algorithm (HMAC-SHA256 over
 * `{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the literal bytes
 * of the `ws_...` secret), NOT the standardwebhooks library. That is deliberate:
 * the library's own round trip cannot detect a wrong key derivation, which is
 * exactly the bug that previously made every real webhook fail.
 *
 * WHAT IT DOES NOT TEST
 * ---------------------
 * Whop's delivery, retries, and event scheduling. Use Whop's dashboard
 * "send test event" button for that. This tests everything on our side.
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

/** Reads .env.local, so no secret has to be passed on the command line. */
function loadEnv(file = path.join(root, ".env.local")) {
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

// --- Arguments ---------------------------------------------------------------
const [action, planArg] = process.argv.slice(2);

/** Reads `--flag value` pairs. */
function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = flag("url", "https://seigem.vercel.app").replace(/\/+$/, "");
const secret = env.WHOP_WEBHOOK_SECRET;

if (action !== "activate" && action !== "deactivate") {
  console.error(
    "Usage:\n" +
      "  node tools/simulate-whop-webhook.mjs activate <plus|pro> [--user uid] [--url url]\n" +
      "  node tools/simulate-whop-webhook.mjs deactivate [--user uid] [--url url]",
  );
  process.exit(1);
}

if (!secret) {
  console.error("WHOP_WEBHOOK_SECRET is not set in .env.local");
  process.exit(1);
}

// --- Pick a user and read their plan before the event ------------------------
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

/** Resolves the uid: explicit flag, else the first user with a profile. */
async function resolveUid() {
  const explicit = flag("user", null);
  if (explicit) return explicit;

  const snapshot = await db.collection("users").limit(1).get();
  const first = snapshot.docs[0];
  if (!first) {
    console.error("No users found in the project.");
    process.exit(1);
  }
  return first.id;
}

const uid = await resolveUid();

/** Reads the current plan so the change can be verified. */
async function readPlan() {
  const snapshot = await db.collection("users").doc(uid).get();
  const data = snapshot.data() ?? {};
  return {
    plan: data.plan ?? "(none)",
    expires: data.planExpiresAt?.toDate?.()?.toISOString?.() ?? null,
    subscription: data.whopSubscriptionId ?? null,
  };
}

const before = await readPlan();

// --- Build the payload the way Whop does ------------------------------------
const MESSAGE_ID = `msg_sim_${Date.now()}`;
const timestamp = Math.floor(Date.now() / 1000);

const productId =
  action === "deactivate"
    ? flag("product", env.WHOP_PLUS_PRODUCT_ID)
    : planArg === "pro"
      ? env.WHOP_PRO_PRODUCT_ID
      : env.WHOP_PLUS_PRODUCT_ID;

/** A payload matching Whop's documented Membership webhook shape. */
const payload = {
  id: MESSAGE_ID,
  api_version: "v1",
  api_version_date: "2026-07-20",
  timestamp: new Date().toISOString(),
  type: action === "deactivate" ? "membership.deactivated" : "membership.activated",
  data: {
    id: `mem_sim_${uid.slice(0, 8)}`,
    status: action === "deactivate" ? "deactivated" : "active",
    product: { id: productId, title: "Simulated", metadata: null },
    plan: { id: "plan_sim", metadata: null },
    // Where the checkout metadata lands; this is how the account is identified.
    metadata: { seigem_uid: uid },
    cancel_at_period_end: false,
    renewal_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
  },
};

const rawBody = JSON.stringify(payload);

// --- Sign it exactly as Whop's backend does ---------------------------------
const signature = createHmac("sha256", secret)
  .update(`${MESSAGE_ID}.${timestamp}.${rawBody}`)
  .digest("base64");

console.log(`Target   : ${baseUrl}`);
console.log(`User     : ${uid}`);
console.log(`Event    : ${payload.type}`);
console.log(`Product  : ${productId}`);
console.log(`Plan now : ${before.plan}`);
console.log("");

// --- Deliver ----------------------------------------------------------------
const response = await fetch(`${baseUrl}/api/billing/webhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "webhook-id": MESSAGE_ID,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  },
  body: rawBody,
});

const text = await response.text();
console.log(`HTTP ${response.status}  ${text}`);

if (response.status !== 200) {
  console.log("");
  if (response.status === 401) {
    console.log(
      "SIGNATURE REJECTED. Either the secret in .env.local differs from the one\n" +
        "deployed, or signature verification is broken.",
    );
  } else if (response.status === 500) {
    console.log(
      "SERVER ERROR. Check the deployment logs; the payload was accepted but\n" +
        "applying it failed.",
    );
  }
  process.exit(1);
}

// --- Verify the plan actually changed ---------------------------------------
const after = await readPlan();
console.log("");
console.log(`Plan after : ${after.plan}   expires=${after.expires}`);
console.log(`Subscription: ${after.subscription}`);

const expected =
  action === "deactivate"
    ? "free"
    : planArg === "pro"
      ? "pro"
      : "plus";

if (after.plan === expected) {
  console.log(`\nOK — plan is "${expected}" as expected.`);
} else {
  console.log(
    `\nMISMATCH — expected "${expected}" but the stored plan is "${after.plan}".\n` +
      "Check the deployment logs for '[billing] PAID EVENT NOT APPLIED'.",
  );
  process.exit(1);
}

/**
 * Reminders, printed because both are easy to forget when testing by hand.
 */
console.log("");
if (action === "activate") {
  console.log(
    "To undo: node tools/simulate-whop-webhook.mjs deactivate --user " + uid,
  );
}
