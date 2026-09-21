/**
 * Creates a 100%-off Whop promo code, for testing a real purchase for free.
 *
 * Run with:
 *   node tools/create-test-promo-code.mjs
 *   node tools/create-test-promo-code.mjs --code SEIGEMTEST --plan plus
 *   node tools/create-test-promo-code.mjs --plan pro --code PROTEST
 *
 * WHY A 100% OFF CODE
 * -------------------
 * It makes the REAL purchase path run at zero cost: a genuine Whop checkout,
 * a genuine membership, and a genuine webhook delivered by Whop to the deployed
 * endpoint. That last part is what the local simulator cannot cover, and it is
 * where the interesting failures live (a delivery that never arrives, or arrives
 * with a payload whose shape we misread).
 *
 * REQUIRED API SCOPES
 * -------------------
 * Creating a code through the API needs `promo_code:create` and
 * `access_pass:basic:read`. If the key lacks them Whop answers 403 and this
 * script says so.
 *
 * You do NOT need those scopes: creating the code by hand in the Whop dashboard
 * (Product -> Promo codes -> Create) achieves the same thing. This script just
 * makes it repeatable.
 *
 * CURRENCY NOTE
 * -------------
 * `base_currency` is required, and the two Seigem plans are priced in DIFFERENT
 * currencies (Plus in EUR, Pro in USD), so each needs its own code. The plan is
 * looked up to pick the right currency automatically.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

/** Reads .env.local. */
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

/** Reads `--flag value`. */
function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const plan = flag("plan", "plus");
const code = flag("code", `SEIGEMTEST${plan.toUpperCase()}`);
const months = Number(flag("months", "12"));

const baseUrl = (env.WHOP_BASE_URL || "https://api.whop.com/api/v1").replace(/\/+$/, "");
const apiKey = env.WHOP_API_KEY;

if (!apiKey) {
  console.error("WHOP_API_KEY is not set in .env.local");
  process.exit(1);
}

const planId = plan === "pro" ? env.WHOP_PRO_PLAN_ID : env.WHOP_PLUS_PLAN_ID;
if (!planId) {
  console.error(`No Whop PLAN id configured for "${plan}".`);
  process.exit(1);
}

// --- Look the plan up, to learn its currency and owning product -------------
const planResponse = await fetch(`${baseUrl}/plans/${encodeURIComponent(planId)}`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});

if (!planResponse.ok) {
  console.error(`Could not read plan ${planId}: HTTP ${planResponse.status}`);
  console.error(await planResponse.text());
  process.exit(1);
}

const planData = await planResponse.json();
const currency = planData?.currency ?? null;
const productId = planData?.product?.id ?? null;
const accountId = planData?.account?.id ?? null;

if (!currency || !accountId) {
  console.error("The plan response did not include a currency/account id.");
  process.exit(1);
}

console.log(`Plan     : ${planId} (${planData?.product?.title ?? "?"})`);
console.log(`Currency : ${currency}`);
console.log(`Account  : ${accountId}`);
console.log(`Code     : ${code}`);
console.log(`Discount : 100% off, first ${months} billing month(s)`);
console.log("");

// --- Create the code --------------------------------------------------------
const body = {
  // 100% off. `percentage` reads this as a percent.
  amount_off: 100,
  promo_type: "percentage",
  base_currency: currency,
  code,
  account_id: accountId,
  // Let the code be used by the person testing it, even if they already bought.
  new_users_only: false,
  // Cover a full year, so a renewal test does not suddenly charge.
  promo_duration_months: months,
  // Scoped to this plan so it cannot be used on the other one by accident.
  plan_ids: [planId],
  ...(productId ? { product_id: productId } : {}),
  unlimited_stock: false,
  stock: 25,
};

const response = await fetch(`${baseUrl}/promo_codes`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await response.text();

if (!response.ok) {
  console.error(`HTTP ${response.status}  ${text.slice(0, 400)}`);
  console.log("");
  if (response.status === 403) {
    console.log(
      "The API key cannot create promo codes. Either:\n" +
        "  - add the `promo_code:create` and `access_pass:basic:read` scopes in\n" +
        "    Whop dashboard -> Developer -> API keys, then rerun this; or\n" +
        "  - create the code by hand: dashboard -> the product -> Promo codes ->\n" +
        "    Create, with 100% off for at least 1 billing month.",
    );
  }
  process.exit(1);
}

const created = JSON.parse(text);
console.log(`Created promo code: ${created.code ?? code}`);
console.log(`  id      : ${created.id ?? "(none)"}`);
console.log(`  uses    : ${created.stock ?? "?"} max`);
console.log("");
console.log("Now test a real purchase, at zero cost:");
console.log(`  1. Open https://seigem.vercel.app/cmimet`);
console.log(`  2. Click "${plan === "pro" ? "Pro" : "Plus"}"`);
console.log(`  3. On the Whop checkout, enter the code: ${created.code ?? code}`);
console.log("  4. The total should become 0 — complete the purchase");
console.log("");
console.log("Then watch the deployment logs for the webhook. The plan should");
console.log("change on /cilesimet within a few seconds.");
console.log("");
console.log(
  "NOTE: Whop may still ask for a card so it can bill a later renewal.\n" +
    "Nothing is charged while the discount applies.",
);
