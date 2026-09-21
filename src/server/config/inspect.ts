/**
 * Deployment configuration inspection (server-only).
 *
 * Lives under `src/server/` deliberately. Reading server secret variables
 * anywhere outside `src/server/` and `src/lib/env/server.ts` is forbidden by
 * `tests/security.test.ts`, because a route module is one refactor away from
 * being pulled into a client bundle. Keeping every secret read behind this
 * boundary means the guard stays meaningful.
 *
 * SECURITY: everything returned here is a BOOLEAN or a fixed description. No
 * secret value, fragment, length, or project id ever crosses this boundary, so
 * the result is safe to serve from an unauthenticated endpoint.
 */
import "server-only";

import { whopConfigurationProblems } from "@/lib/env/server";
import { describeResolution } from "@/server/firebase/admin-loader.cjs";

/** True when a value is present and not an obvious placeholder. */
function isSet(value: string | undefined): boolean {
  if (!value) return false;
  return !value.includes("REPLACE_ME") && !value.includes("your-project-id");
}

/** Reads a raw variable without throwing when it is absent. */
function raw(name: string): string | undefined {
  return process.env[name];
}

/** Presence of each piece of configuration, as booleans only. */
export interface ConfigurationReport {
  apiReady: boolean;
  firebaseAdmin: {
    ok: boolean;
    projectId: boolean;
    clientEmail: boolean;
    privateKey: boolean;
  };
  firebaseWeb: { ok: boolean };
  deepSeek: { ok: boolean };
  whop: { ok: boolean; problems: string[] };
  /**
   * Whether the Admin SDK package is physically present in this deployment.
   *
   * Separate from `firebaseAdmin` above, which only reports that the
   * environment VARIABLES are set. A deployment can have perfect credentials
   * and still fail because the firebase-admin files were not bundled — that
   * produced "Cannot find module /var/task/node_modules/firebase-admin/..."
   * and a generic 500 on every authenticated route.
   */
  adminSdk: {
    ok: boolean;
    resolved: string | null;
    cwd: string;
    moduleDirsFound: string[];
    packageRoot: string | null;
    rootEntries: string[] | null;
    libEntries: string[] | null;
    products: Record<
      string,
      {
        entryPath: string;
        entryExists: boolean;
        loaded: boolean;
        error: string | null;
      }
    >;
  };
}

/**
 * Reports which configuration the running deployment actually has.
 *
 * This exists because a missing server variable on the host makes EVERY API
 * route fail at once with an opaque 500, which is indistinguishable in the
 * browser console from an application bug.
 */
export function inspectConfiguration(): ConfigurationReport {
  const projectId = isSet(raw("FIREBASE_PROJECT_ID"));
  const clientEmail = isSet(raw("FIREBASE_CLIENT_EMAIL"));

  // The private key must survive the host's environment editor intact. A key
  // that lost its "-----BEGIN PRIVATE KEY-----" line (a common paste accident)
  // is reported as absent rather than as a confusing credential error later.
  const privateKeyMaterial = raw("FIREBASE_PRIVATE_KEY") ?? "";
  const privateKey =
    isSet(privateKeyMaterial) && privateKeyMaterial.includes("BEGIN PRIVATE KEY");

  const firebaseAdmin = {
    ok: projectId && clientEmail && privateKey,
    projectId,
    clientEmail,
    privateKey,
  };

  const firebaseWeb = {
    ok:
      isSet(raw("NEXT_PUBLIC_FIREBASE_API_KEY")) &&
      isSet(raw("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN")) &&
      isSet(raw("NEXT_PUBLIC_FIREBASE_PROJECT_ID")) &&
      isSet(raw("NEXT_PUBLIC_FIREBASE_APP_ID")),
  };

  const deepSeek = { ok: isSet(raw("DEEPSEEK_API_KEY")) };

  const problems = whopConfigurationProblems();
  const whop = {
    ok: isSet(raw("WHOP_API_KEY")) && problems.length === 0,
    problems,
  };

  // Ask the loader where it thinks the Admin SDK is. This never throws, and it
  // reports both the resolution outcome and any load error per product, so a
  // deployment problem is visible here instead of only as a generic 500.
  const resolution = describeResolution();
  const adminSdk = {
    ok: resolution.adminPresent && resolution.products.auth?.loaded === true,
    resolved: resolution.resolved,
    cwd: resolution.cwd,
    // Only the directories that actually exist, to keep the response small.
    moduleDirsFound: resolution.dirsThatExist,
    packageRoot: resolution.packageRoot,
    rootEntries: resolution.rootEntries,
    libEntries: resolution.libEntries,
    products: resolution.products,
  };

  return {
    // The headline signal: when false, every protected route returns 500.
    // Both halves must hold: credentials present AND the SDK actually shipped.
    apiReady: firebaseAdmin.ok && deepSeek.ok && adminSdk.ok,
    firebaseAdmin,
    firebaseWeb,
    deepSeek,
    whop,
    adminSdk,
  };
}
