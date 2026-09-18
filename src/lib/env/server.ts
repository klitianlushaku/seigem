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

/**
 * Server configuration is read lazily. Next.js evaluates API route modules
 * during `next build`, but secrets are only required when a request actually
 * reaches the route. This keeps deployment builds independent of runtime
 * credentials while preserving strict validation at runtime.
 */
export const serverEnv = {
  // --- Firebase Admin SDK ---------------------------------------------
  get firebaseProjectId() {
    return required("FIREBASE_PROJECT_ID", process.env.FIREBASE_PROJECT_ID);
  },
  get firebaseClientEmail() {
    return required("FIREBASE_CLIENT_EMAIL", process.env.FIREBASE_CLIENT_EMAIL);
  },
  get firebasePrivateKey() {
    return required(
      "FIREBASE_PRIVATE_KEY",
      normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    );
  },

  // --- DeepSeek -------------------------------------------------------
  get deepSeekApiKey() {
    return required("DEEPSEEK_API_KEY", process.env.DEEPSEEK_API_KEY);
  },
  get deepSeekBaseUrl() {
    return process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  },
  get deepSeekStandardModel() {
    return process.env.DEEPSEEK_STANDARD_MODEL ?? DEEPSEEK_STANDARD_MODEL_DEFAULT;
  },
  get deepSeekProModel() {
    return process.env.DEEPSEEK_PRO_MODEL ?? DEEPSEEK_PRO_MODEL_DEFAULT;
  },

  // --- Whop -----------------------------------------------------------
  get whopApiKey() {
    return required("WHOP_API_KEY", process.env.WHOP_API_KEY);
  },
  get whopWebhookSecret() {
    return required("WHOP_WEBHOOK_SECRET", process.env.WHOP_WEBHOOK_SECRET);
  },
  get whopPlusProductId() {
    return required("WHOP_PLUS_PRODUCT_ID", process.env.WHOP_PLUS_PRODUCT_ID);
  },
  get whopProProductId() {
    return required("WHOP_PRO_PRODUCT_ID", process.env.WHOP_PRO_PRODUCT_ID);
  },

  /** Base URL of the Whop REST API, including the `/api/v1` path. */
  get whopBaseUrl() {
    return process.env.WHOP_BASE_URL ?? "https://api.whop.com/api/v1";
  },

  /** Optional Whop PLAN ids used to open paid checkouts. */
  get whopPlusPlanId() {
    return process.env.WHOP_PLUS_PLAN_ID ?? null;
  },
  get whopProPlanId() {
    return process.env.WHOP_PRO_PLAN_ID ?? null;
  },
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
