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

  return {
    // The headline signal: when false, every protected route returns 500.
    apiReady: firebaseAdmin.ok && deepSeek.ok,
    firebaseAdmin,
    firebaseWeb,
    deepSeek,
    whop,
  };
}
