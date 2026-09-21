/**
 * Reports what Seigem actually nets from a sale, from real Whop fee data.
 *
 * Run with: node tools/check-fees.mjs
 *
 * Why this exists: the fee structure has a FLAT per-transaction component plus
 * several percentage components. A small test charge is dominated by the flat
 * part, so extrapolating a single cheap payment to a real price overstates the
 * cost dramatically. This reads the itemised fees of every real payment and
 * separates the flat fees from the percentage ones, so the net for any price can
 * be stated with the rates actually being charged.
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

/** Fetches every payment, newest first. */
async function listPayments() {
  const response = await fetch(`${API}/payments?first=50`, { headers: auth });
  if (!response.ok) throw new Error(`payments: HTTP ${response.status}`);
  const body = await response.json();
  return body.data ?? [];
}

/** Fetches the itemised fees for one payment. */
async function feesFor(paymentId) {
  const response = await fetch(`${API}/payments/${paymentId}/fees`, {
    headers: auth,
  });
  if (!response.ok) return [];
  const body = await response.json();
  return body.data ?? [];
}

const payments = await listPayments();

/** Only paid rows carry fees worth analysing. */
const paid = payments.filter((p) => p.status === "paid");

console.log(`Payments: ${payments.length} total, ${paid.length} paid\n`);

/** Accumulated observations of each fee origin. */
const observations = [];

for (const payment of paid) {
  const gross = Number(payment.total?.amount ?? 0);
  const currency = payment.total?.currency ?? "?";
  const fees = await feesFor(payment.id);

  const total = fees.reduce((sum, fee) => sum + Number(fee.amount?.amount ?? 0), 0);

  console.log(`--- ${payment.id}  ${gross.toFixed(2)} ${currency.toUpperCase()}`);
  for (const fee of fees) {
    const amount = Number(fee.amount?.amount ?? 0);
    const share = gross > 0 ? ((amount / gross) * 100).toFixed(1) : "—";
    console.log(
      `      ${fee.label.padEnd(38)} ${amount.toFixed(2)}  (${share}% of gross)`,
    );
    observations.push({
      origin: fee.origin,
      label: fee.label,
      amount,
      gross,
    });
  }
  console.log(
    `      ${"TOTAL FEES".padEnd(38)} ${total.toFixed(2)}  ` +
      `-> net ${(gross - total).toFixed(2)} ` +
      `(${gross > 0 ? (((gross - total) / gross) * 100).toFixed(1) : "—"}%)`,
  );
  console.log("");
}

// --- Summarise each fee origin: flat or percentage? -------------------------
/**
 * Groups observations by origin, to tell flat fees from percentage ones.
 *
 * Classification is by ORIGIN NAME, not by comparing amounts. The first version
 * of this script inferred scaling from the data, and with a single paid sample
 * it classified `payment_processing_percentage_fee` as a FLAT cost — which
 * understated fees on every larger sale.
 */
const byOrigin = new Map();

for (const observation of observations) {
  const list = byOrigin.get(observation.origin) ?? [];
  list.push(observation);
  byOrigin.set(observation.origin, list);
}

console.log("=== fee structure observed ===");

let flatTotal = 0;
let percentageRate = 0;
const conditional = [];

/** True when the origin names a percentage fee. */
function isPercentageFee(origin) {
  return origin.includes("percentage");
}

for (const [origin, list] of byOrigin) {
  const label = list[0]?.label ?? origin;
  const amount = list[0]?.amount ?? 0;
  const gross = list[0]?.gross ?? 0;

  if (origin === "cross_border_percentage_fee" || origin === "fx_percentage_fee") {
    conditional.push({ label, rate: 0.01 });
    console.log(`  ${label.padEnd(38)} conditional (~1%, only some sales)`);
    continue;
  }

  if (isPercentageFee(origin)) {
    /*
     * Estimated from the largest sample. With a single small charge the fee is
     * rounded to the cent, so the rate can only be approximated here — Whop's
     * published rate for card processing is 2.7%.
     */
    const rate = gross > 0 ? amount / gross : 0;
    percentageRate += rate;
    console.log(
      `  ${label.padEnd(38)} ~${(rate * 100).toFixed(2)}% ` +
        `(rounded on a ${gross.toFixed(2)} sample; published rate 2.7%)`,
    );
    continue;
  }

  flatTotal += amount;
  console.log(`  ${label.padEnd(38)} ${amount.toFixed(2)} flat`);
}

console.log(`\n  flat fees per transaction : ${flatTotal.toFixed(2)}`);
console.log(
  `  percentage fees          : ~${(percentageRate * 100).toFixed(2)}% observed ` +
    "(published: 2.7%)",
);
console.log(
  `  conditional (cross-border/FX): ~${(
    conditional.reduce((sum, c) => sum + c.rate, 0) * 100
  ).toFixed(2)}% when they apply`,
);

// --- Net for the real prices ------------------------------------------------
/*
 * Computed at the PUBLISHED 2.7% rate rather than the observed one, because the
 * observed rate comes from a single charge rounded to the cent. The flat fees
 * are taken from real charged amounts, which is the part that cannot be looked
 * up.
 */
const PUBLISHED_PERCENTAGE_RATE = 0.027;
const CONDITIONAL_RATE = 0.025; // +1.5% international, +1% currency conversion

console.log("\n=== net per sale ===");
console.log("  price   | domestic EUR card  | international + FX");

const prices = [0.6, 1.0, 2.0, 3.0, 4.99, 5.99, 9.99, 12.99];

for (const price of prices) {
  const best = price - (flatTotal + price * PUBLISHED_PERCENTAGE_RATE);
  const worst =
    price - (flatTotal + price * (PUBLISHED_PERCENTAGE_RATE + CONDITIONAL_RATE));

  console.log(
    `  ${price.toFixed(2).padStart(6)}  | ` +
      `${best.toFixed(2)} (${((best / price) * 100).toFixed(0)}%)`.padEnd(21) +
      `| ${worst.toFixed(2)} (${((worst / price) * 100).toFixed(0)}%)`,
  );
}

console.log(
  "\nNOT included: payout/withdrawal fees, and 15% if a customer pays through\n" +
    "a financing partner (BNPL).",
);

