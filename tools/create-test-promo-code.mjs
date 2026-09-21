/**
 * Creates a Whop promo code for testing a real purchase cheaply.
 *
 * Run with:
 *   node tools/create-test-promo-code.mjs                      # 100% off Plus
 *   node tools/create-test-promo-code.mjs --pay 1              # pay 1 EUR for Plus
 *   node tools/create-test-promo-code.mjs --plan pro --pay 1   # pay 1 USD for Pro
 *   node tools/create-test-promo-code.mjs --code SEIGEMTEST
 *
 * WHY A PROMO CODE RATHER THAN A CHEAP PLAN
 * -----------------------------------------
 * Creating a new 1 EUR product/plan in Whop does NOT work for this, and the
 * reason is easy to miss: `planForWhopProduct` maps only the two configured
 * PRODUCT ids to a Seigem plan. A new product id maps to nothing, so
 * `resolveEntitlement` returns "ignore" and NO plan is granted — the payment
 * would succeed and the account would stay on Free, which is the exact failure
 * this whole exercise is meant to rule out.
 *
 * Discounting the EXISTING plan keeps the product id that the webhook matches
 * on, so the test exercises the real mapping.
 *
 * WHAT EACH MODE TESTS
 * --------------------
 *   --pay 0 (default) : a real checkout and a real webhook, but no money moves.
 *                       Proves delivery, signature verification and the grant.
 *   --pay 1           : additionally proves a genuine CHARGE grants the plan,
 *                       and that `payment.succeeded` arrives alongside
 *                       `membership.activated`.
 *
 * RENEWAL WARNING
 * ---------------
 * Whop subscriptions renew. A one-month discount means the NEXT month bills the
 * full price. The default here is therefore 12 discounted months, so a forgotten
 * cancellation costs 1 (not the full plan price). Cancel after testing anyway:
 * Whop dashboard -> Memberships -> the member -> Cancel.
 *
 * REQUIRED API SCOPES
 * -------------------
 * `promo_code:create` and `access_pass:basic:read`. Without them Whop answers
 * 403 and this script says so. You can always create the code by hand instead:
 * dashboard -> the product -> Promo codes -> Create.
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

/**
 * Amount the buyer should actually pay, or null for "free".
 * `--pay 1` on a 5.99 plan discounts it by 4.99.
 */
const payAmount = process.argv.includes("--pay")
  ? Number(flag("pay", "0"))
  : null;

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
// What the plan bills each cycle; `initial_price` is often 0 on a renewal plan.
const listPrice =
  typeof planData?.renewal_price === "number" ? planData.renewal_price : null;

if (!currency || !accountId) {
  console.error("The plan response did not include a currency/account id.");
  process.exit(1);
}

// --- Decide the discount ----------------------------------------------------
// `amount_off` units depend on promo_type: a percent for `percentage`, and a
// CURRENCY AMOUNT for `flat_amount` (4.99, not 499).
let promoType;
let amountOff;
let discountLabel;

if (payAmount === null || payAmount <= 0) {
  promoType = "percentage";
  amountOff = 100;
  discountLabel = `100% off — pay nothing`;
} else {
  if (listPrice === null) {
    console.error("The plan did not report a renewal_price, so a partial discount cannot be computed.");
    process.exit(1);
  }
  const discount = Math.round((listPrice - payAmount) * 100) / 100;
  if (discount <= 0) {
    console.error(
      `--pay ${payAmount} is not less than the plan price ${listPrice} ${currency.toUpperCase()}. ` +
        "There is nothing to discount.",
    );
    process.exit(1);
  }
  promoType = "flat_amount";
  amountOff = discount;
  discountLabel =
    `${discount} ${currency.toUpperCase()} off — pay ${payAmount} ${currency.toUpperCase()} ` +
    `instead of ${listPrice} ${currency.toUpperCase()}`;
}

console.log(`Plan     : ${planId} (${planData?.product?.title ?? "?"})`);
console.log(`Currency : ${currency}`);
console.log(`Account  : ${accountId}`);
console.log(`Code     : ${code}`);
console.log(`Discount : ${discountLabel}`);
console.log(`Covers   : first ${months} billing month(s)`);
console.log("");

// --- Create the code --------------------------------------------------------
const body = {
  // Units follow promo_type: a percent for `percentage`, a currency amount for
  // `flat_amount`. Sending 499 here would mean 499 EUR off, not 4.99.
  amount_off: amountOff,
  promo_type: promoType,
  base_currency: currency,
  code,
  account_id: accountId,
  // Let the code be used by the person testing it, even if they already bought.
  new_users_only: false,
  // Default 12 months, so a forgotten cancellation costs the discounted amount
  // rather than the full plan price.
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
console.log("Now test a real purchase:");
console.log(`  1. Open https://seigem.vercel.app/cmimet`);
console.log(`  2. Click "${plan === "pro" ? "Pro" : "Plus"}"`);
console.log(`  3. On the Whop checkout, enter the code: ${created.code ?? code}`);
console.log(
  payAmount && payAmount > 0
    ? `  4. The total should become ${payAmount} ${currency.toUpperCase()} — pay with a real card`
    : "  4. The total should become 0 — complete the purchase",
);
console.log("");
console.log("Then confirm the plan flipped on /cilesimet within a few seconds.");
console.log("");
console.log(
  "IMPORTANT — CANCEL AFTERWARDS. This creates a real subscription.\n" +
    `The discounted price applies for ${months} month(s); cancel in the Whop\n` +
    "dashboard (Memberships -> the member -> Cancel) once you have confirmed\n" +
    "the grant, so nothing renews.",
);
