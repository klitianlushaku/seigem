/**
 * Server-only environment variables.
 *
 * This module must never be imported from a Client Component. It reads secrets
 * from `process.env`, which is only populated on the server.
 *
 * `import "server-only"` makes an accidental client import a build-time error
 * rather than a runtime secret leak.
 */
import "server-only";

import { DEFAULT_PLAN_ID, type PlanId } from "@/config/plans";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required server environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/**
 * Firebase Admin private keys are stored in .env files with literal "\n"
 * escape sequences. Convert them back to real newlines.
 */
function normalizePrivateKey(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n");
}

/**
 * The standard DeepSeek model, used for Free and Plus plans.
 *
 * Verified against https://api-docs.deepseek.com/quick_start/pricing — the
 * current model ids are `deepseek-flash` and `deepseek-v4-pro`. The older
 * `deepseek-chat` / `deepseek-reasoner` names that Seigem originally documented
 * are no longer the current models.
 */
const DEEPSEEK_STANDARD_MODEL_DEFAULT = "deepseek-flash";

/** The stronger DeepSeek model, reserved for Pro. */
const DEEPSEEK_PRO_MODEL_DEFAULT = "deepseek-v4-pro";

export const serverEnv = {
  // --- Firebase Admin SDK ---------------------------------------------
  firebaseProjectId: required(
    "FIREBASE_PROJECT_ID",
    process.env.FIREBASE_PROJECT_ID,
  ),
  firebaseClientEmail: required(
    "FIREBASE_CLIENT_EMAIL",
    process.env.FIREBASE_CLIENT_EMAIL,
  ),
  firebasePrivateKey: required(
    "FIREBASE_PRIVATE_KEY",
    normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  ),

  // --- DeepSeek -------------------------------------------------------
  deepSeekApiKey: required("DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY),
  deepSeekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  deepSeekStandardModel:
    process.env.DEEPSEEK_STANDARD_MODEL ?? DEEPSEEK_STANDARD_MODEL_DEFAULT,
  deepSeekProModel:
    process.env.DEEPSEEK_PRO_MODEL ?? DEEPSEEK_PRO_MODEL_DEFAULT,

  // --- Whop -----------------------------------------------------------
  whopApiKey: required("WHOP_API_KEY", process.env.WHOP_API_KEY),
  whopWebhookSecret: required(
    "WHOP_WEBHOOK_SECRET",
    process.env.WHOP_WEBHOOK_SECRET,
  ),
  whopPlusProductId: required(
    "WHOP_PLUS_PRODUCT_ID",
    process.env.WHOP_PLUS_PRODUCT_ID,
  ),
  whopProProductId: required(
    "WHOP_PRO_PRODUCT_ID",
    process.env.WHOP_PRO_PRODUCT_ID,
  ),

  /**
   * Base URL of the Whop REST API.
   *
   * The `api/v1` path is part of the base URL and must be kept: the documented
   * server is `https://api.whop.com/api/v1`.
   */
  whopBaseUrl: process.env.WHOP_BASE_URL ?? "https://api.whop.com/api/v1",

  /**
   * Whop PLAN ids (`plan_...`) used to open a checkout.
   *
   * Distinct from the PRODUCT ids above: a product owns one or more plans, and
   * the checkout API takes a plan. Optional here so the app still boots without
   * them, but the checkout route refuses to start a payment until they are set
   * — sending someone to a checkout that cannot be attributed to their account
   * would take their money and grant nothing.
   */
  whopPlusPlanId: process.env.WHOP_PLUS_PLAN_ID ?? null,
  whopProPlanId: process.env.WHOP_PRO_PLAN_ID ?? null,
} as const;

/**
 * Maps a Whop product id to the Seigem plan it grants.
 * Unknown product ids resolve to the free plan rather than granting access.
 */
export function planForWhopProduct(productId: string): PlanId {
  if (productId === serverEnv.whopPlusProductId) return "plus";
  if (productId === serverEnv.whopProProductId) return "pro";
  return DEFAULT_PLAN_ID;
}
