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

/**
 * Memberships that will bill again at the end of the current period.
 */
const willRenew = [];

/**
 * Active memberships that cannot renew, so they are NOT a billing risk.
 *
 * A ONE-TIME purchase is reported by the API with `status: active` and
 * `cancel_at_period_end: false` — identical to a live subscription — but with NO
 * billing period at all (`current_period_end` and `renewal_period_end` both
 * null). There is nothing to renew and nothing to cancel, which is why Whop's
 * dashboard shows those rows as "One-time" and offers no cancel action.
 *
 * The first version of this tool did not check for a period, so it reported a
 * one-time purchase as "WILL CHARGE" and sent the owner looking for a cancel
 * button that does not exist. A false alarm about money is worse than no tool.
 */
const notRecurring = [];

console.log("=== every membership on this account ===\n");

for (const membership of memberships) {
  const livesNow = ["active", "trialing"].includes(membership.status);

  /** A recurring membership always carries a billing period. */
  const billingPeriod =
    membership.current_period_end ?? membership.renewal_period_end ?? null;
  const hasBillingPeriod = Boolean(billingPeriod);

  const willCharge =
    livesNow && membership.cancel_at_period_end !== true && hasBillingPeriod;

  const product = PLAN_FOR_PRODUCT[membership.product_id] ?? membership.product_id;
  const uid = membership.metadata?.seigem_uid ?? "(no metadata)";

  const verdict = willCharge
    ? "WILL CHARGE"
    : livesNow
      ? "one-time   "
      : "safe       ";

  console.log(
    `${verdict}  ${membership.id}\n` +
      `    product            : ${product}\n` +
      `    status             : ${membership.status}\n` +
      `    cancel_at_period_end: ${membership.cancel_at_period_end}\n` +
      `    period ends         : ${billingPeriod ?? "(none — one-time purchase)"}\n` +
      `    account             : ${uid}\n`,
  );

  if (willCharge) {
    willRenew.push({ membership, product, uid });
  } else if (livesNow) {
    notRecurring.push({ membership, product, uid });
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
    "\n  Cancel them at https://whop.com/@me/settings/orders/, or with\n" +
      "  the API. Cancelling at period end keeps access until the date above.",
  );
}

if (notRecurring.length > 0) {
  console.log(
    `\n  ${notRecurring.length} membership(s) are ACTIVE but NOT RECURRING\n` +
      "  (one-time purchases). They cannot renew and cannot be cancelled —\n" +
      "  there is no subscription behind them:",
  );
  for (const { membership, product, uid } of notRecurring) {
    console.log(`    - ${product}  ${membership.id}  (${uid})`);
  }
}

