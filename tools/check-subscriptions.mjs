/**
 * Reports which of your Whop subscriptions will CHARGE you again.
 *
 * Run with: node tools/check-subscriptions.mjs
 *
 * A membership only stops billing if it is cancelled. "Cancelled" is ambiguous
 * in Whop's data:
 *
 *   status=canceling + cancel_at_period_end=true   -> will NOT renew (scheduled)
 *   status=active    + cancel_at_period_end=false  -> WILL renew
 *   status=canceled / expired                      -> already ended, no charge
 *
 * So this lists every membership with the two fields that decide it, and names
 * the ones that will bill you again.
 */
/* eslint-disable no-console -- a CLI tool; printed output is the deliverable */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const response = await fetch(`${API}/memberships?first=50`, { headers: auth });
if (!response.ok) {
  console.error(`HTTP ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const memberships = (await response.json()).data ?? [];

/** Which Seigem plan a product maps to, for readable output. */
const PLAN_FOR_PRODUCT = {
  [env.WHOP_PLUS_PRODUCT_ID]: "Plus",
  [env.WHOP_PRO_PRODUCT_ID]: "Pro",
};

/** Memberships that will bill again at the end of the current period. */
const willRenew = [];

console.log("=== every membership on this account ===\n");

for (const membership of memberships) {
  const willCharge =
    ["active", "trialing"].includes(membership.status) &&
    membership.cancel_at_period_end !== true;

  const product = PLAN_FOR_PRODUCT[membership.product_id] ?? membership.product_id;
  const uid = membership.metadata?.seigem_uid ?? "(no metadata)";

  console.log(
    `${willCharge ? "WILL CHARGE" : "safe       "}  ${membership.id}\n` +
      `    product            : ${product}\n` +
      `    status             : ${membership.status}\n` +
      `    cancel_at_period_end: ${membership.cancel_at_period_end}\n` +
      `    period ends         : ${membership.current_period_end ?? "(none)"}\n` +
      `    account             : ${uid}\n`,
  );

  if (willCharge) {
    willRenew.push({ membership, product, uid });
  }
}

console.log("=== summary ===");
if (willRenew.length === 0) {
  console.log("  Nothing will renew. No further charges are due.");
} else {
  console.log(`  ${willRenew.length} membership(s) WILL charge again:`);
  for (const { membership, product, uid } of willRenew) {
    console.log(
      `    - ${product}  ${membership.id}  ends ${membership.current_period_end}  (${uid})`,
    );
  }
  console.log(
    "\n  Cancel them at https://whop.com/dashboard -> Memberships, or with\n" +
      "  the API. Cancelling at period end keeps access until the date above.",
  );
}
