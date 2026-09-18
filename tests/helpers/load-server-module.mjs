/**
 * Loads a server-only module in a plain Node context.
 *
 * `server-only` exists to stop a Client Component from importing server code.
 * Its `react-server` export condition resolves to a no-op, while the default
 * resolves to a module that throws. Bundlers apply that condition for Server
 * Components; Node does not, so this helper registers a resolver that maps
 * `server-only` to an empty module for the duration of a test run.
 *
 * This is ONLY for tests. It does not weaken the guarantee in the app: the
 * Next.js build still applies the real condition, and `npm run test:bundle`
 * asserts that server modules stay out of the client bundle.
 *
 * Plain JavaScript (not .ts): this file is imported before Node's
 * type-stripping is guaranteed to be active for it.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

/** Registers a resolve hook that neutralises `server-only`. */
register(
  new URL("./server-only-shim.mjs", import.meta.url),
  pathToFileURL("./"),
);

/** Environment values the server modules require at import time. */
function ensureEnv() {
  const defaults = {
    DEEPSEEK_API_KEY: "sk-test-key-not-real",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    DEEPSEEK_STANDARD_MODEL: "deepseek-flash",
    DEEPSEEK_PRO_MODEL: "deepseek-v4-pro",
    FIREBASE_PROJECT_ID: "test-project",
    FIREBASE_CLIENT_EMAIL: "test@test.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n",
    WHOP_API_KEY: "test",
    WHOP_WEBHOOK_SECRET: "test",
    WHOP_PLUS_PRODUCT_ID: "prod_plus",
    WHOP_PRO_PRODUCT_ID: "prod_pro",
  };

  for (const [key, value] of Object.entries(defaults)) {
    process.env[key] ??= value;
  }
}

/**
 * Imports a project module after neutralising `server-only`.
 *
 * @param {string} projectPath Path relative to the PROJECT ROOT,
 *   e.g. "src/server/ai/deepseek.ts"
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadModule(projectPath) {
  ensureEnv();
  // Resolve against the project root (two levels up from tests/helpers),
  // so callers can pass the same paths they see in the repo.
  const url = new URL(`../../${projectPath}`, import.meta.url).href;
  return import(url);
}
