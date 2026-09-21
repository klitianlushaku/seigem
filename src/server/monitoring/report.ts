/**
 * Server-side error monitoring.
 *
 * WHY THIS EXISTS
 * ---------------
 * Debugging this app without deployed error capture was slow and expensive:
 * failures surfaced as a generic 500 in the browser, and the actual cause was
 * only visible in the host's log viewer. Several bugs took multiple round trips
 * to identify purely because the error was not reported anywhere structured.
 *
 * HOW IT BEHAVES WITHOUT CONFIGURATION
 * ------------------------------------
 * Dormant, and deliberately so. With no `SENTRY_DSN` set, nothing is imported
 * from Sentry at runtime, nothing is transmitted, and the app behaves exactly as
 * it did before. That keeps local development, tests, and preview deploys clean,
 * and means adding this package cannot break a deployment that has no DSN.
 *
 * TO ENABLE
 * ---------
 *   1. Create a project at https://sentry.io (the free tier is enough).
 *   2. Copy its DSN.
 *   3. Set `SENTRY_DSN` on the host (Vercel -> Settings -> Environment
 *      Variables) and redeploy.
 *
 * `NEXT_PUBLIC_SENTRY_ALLOW_DEV` opts local development in, for testing the
 * wiring itself. Without it, dev is silent even when a DSN is present.
 */
import "server-only";

/** True when a DSN is configured and this runtime should report. */
export function isMonitoringEnabled(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  // Report locally only when explicitly asked, so a dev machine with the
  // production DSN in `.env.local` does not spam the project.
  if (process.env.NODE_ENV !== "production") {
    return process.env.NEXT_PUBLIC_SENTRY_ALLOW_DEV === "true";
  }

  return true;
}

/**
 * Reports an error with context, or does nothing when monitoring is off.
 *
 * Safe to call from anywhere on the server: it never throws, and never delays a
 * response by more than the SDK's own batching. Callers should still log to the
 * console — the log is what you reach for when the DSN is missing or the
 * project is over quota.
 *
 * @param error   The caught value. Anything is accepted; non-Errors are wrapped.
 * @param context Short label identifying where it happened, e.g. "generate".
 * @param extra   Optional structured detail. Never include secrets or content.
 */
export async function reportError(
  error: unknown,
  context: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (!isMonitoringEnabled()) return;

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, {
      tags: { context },
      ...(extra ? { extra } : {}),
    });
  } catch (reportingFailure) {
    // Monitoring must never be the reason a request fails. If reporting itself
    // breaks, the console log from the caller is still there.
    console.error("[monitoring] failed to report an error:", reportingFailure);
  }
}
