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

  // --- Admin ----------------------------------------------------------
  /**
   * Uids allowed into the admin panel, from a comma-separated `ADMIN_UIDS`.
   *
   * DELIBERATELY AN ENVIRONMENT VARIABLE, not a database flag. The admin panel
   * can hand out paid plans for free, so the way to BECOME an admin must not be
   * reachable from the application at all — not by a client, and not by a bug in
   * some write path. An env var can only be changed by someone who already
   * controls the deployment.
   *
   * A Firestore `isAdmin` field would make the panel's security depend on the
   * security rules being perfect. This does not.
   *
   * Empty by default, which means nobody is an admin.
   */
  get adminUids(): ReadonlySet<string> {
    const raw = process.env.ADMIN_UIDS ?? "";
    return new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
  },
} as const;

/** True when a uid is on the admin allow-list. */
export function isAdminUid(uid: string): boolean {
  return serverEnv.adminUids.has(uid);
}

/**
 * True when a Whop id carries the expected prefix.
 *
 * Whop uses two different id namespaces and mixing them up is silent and
 * expensive:
 *   - `prod_...` identifies a PRODUCT. Membership webhooks report the product,
 *     so this is what `planForWhopProduct` must match against.
 *   - `plan_...` identifies a PLAN inside a product. The checkout API takes a
 *     plan.
 *
 * Configuring a `plan_` id as a product (or vice versa) fails in ways that look
 * like unrelated bugs: checkout either refuses to start, or a customer pays and
 * the webhook silently matches no plan, so nothing is ever granted.
 */
function hasIdPrefix(value: string, prefix: string): boolean {
  return value.startsWith(prefix);
}

/**
 * Reports the Whop configuration problems that would stop Seigem from selling.
 *
 * Returns an empty array when everything is consistent. Surfaced as an explicit
 * startup warning because each of these otherwise presents to the customer as
 * "payment did nothing" or "payments are not configured", with no server error
 * to chase.
 */
export function whopConfigurationProblems(): string[] {
  const problems: string[] = [];

  const productPairs = [
    { name: "WHOP_PLUS_PRODUCT_ID", value: process.env.WHOP_PLUS_PRODUCT_ID },
    { name: "WHOP_PRO_PRODUCT_ID", value: process.env.WHOP_PRO_PRODUCT_ID },
  ] as const;

  for (const { name, value } of productPairs) {
    if (value && !hasIdPrefix(value, "prod_")) {
      problems.push(
        `${name}="${value}" is not a product id (expected a "prod_..." value). ` +
          "Membership webhooks report the PRODUCT id, so a plan_ id here means " +
          "no paid plan is ever granted.",
      );
    }
  }

  const planPairs = [
    { name: "WHOP_PLUS_PLAN_ID", value: process.env.WHOP_PLUS_PLAN_ID },
    { name: "WHOP_PRO_PLAN_ID", value: process.env.WHOP_PRO_PLAN_ID },
  ] as const;

  for (const { name, value } of planPairs) {
    if (value && !hasIdPrefix(value, "plan_")) {
      problems.push(
        `${name}="${value}" is not a plan id (expected a "plan_..." value). ` +
          "The checkout API takes a plan, so checkout cannot be started.",
      );
    }
  }

  if (!process.env.WHOP_PLUS_PLAN_ID || !process.env.WHOP_PRO_PLAN_ID) {
    problems.push(
      "WHOP_PLUS_PLAN_ID / WHOP_PRO_PLAN_ID are not set. Checkout is refused " +
        "until they are, because a checkout without them cannot be attributed " +
        "to an account.",
    );
  }

  if (process.env.WHOP_WEBHOOK_SECRET?.includes("REPLACE_ME")) {
    problems.push(
      "WHOP_WEBHOOK_SECRET is still the placeholder. Every webhook is rejected, " +
        "so no payment can upgrade an account.",
    );
  }

  return problems;
}

/**
 * Maps a Whop product id to the Seigem plan it grants.
 * Unknown product ids resolve to the free plan rather than granting access.
 */
export function planForWhopProduct(productId: string): PlanId {
  if (productId === serverEnv.whopPlusProductId) return "plus";
  if (productId === serverEnv.whopProProductId) return "pro";
  return DEFAULT_PLAN_ID;
}

/**
 * Logs the Whop configuration problems once, on the first billing operation.
 *
 * Deliberately lazy and non-throwing: a misconfigured Whop must not stop the
 * app from starting or break unrelated features. But it must be impossible to
 * miss, because every one of these problems presents to the customer as a
 * payment that silently did nothing.
 */
let whopProblemsLogged = false;

export function warnOnWhopMisconfiguration(context: string): void {
  if (whopProblemsLogged) return;

  const problems = whopConfigurationProblems();
  if (problems.length === 0) return;

  whopProblemsLogged = true;
  console.error(
    `[billing] Whop is misconfigured (detected during ${context}):\n` +
      problems.map((problem) => `  - ${problem}`).join("\n"),
  );
}
