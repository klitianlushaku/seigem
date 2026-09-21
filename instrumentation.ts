/**
 * Sentry instrumentation for the Next.js server and edge runtimes.
 *
 * Loaded automatically by Next.js. The import is DYNAMIC and guarded by the
 * presence of a DSN, so a deployment without `SENTRY_DSN` never pulls the SDK
 * into the server bundle — the package being installed must not change runtime
 * behaviour on its own.
 *
 * `onRequestError` is what would have caught this app's production failures: it
 * receives every unhandled error thrown while rendering a route or handling a
 * request, including the ones that previously surfaced only as a generic 500
 * with an empty body.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

/** Shared options for both runtimes. */
const SENTRY_OPTIONS = {
  // Errors only. Performance tracing and session replay would add bundle weight
  // and data volume for no benefit at this stage.
  tracesSampleRate: 0,
  // Never send request bodies: they contain the user's document text.
  sendDefaultPii: false,
} as const;

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SENTRY_ALLOW_DEV !== "true") {
    return;
  }

  const Sentry = await import("@sentry/nextjs");

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({ dsn, ...SENTRY_OPTIONS });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn, ...SENTRY_OPTIONS });
  }
}

/**
 * Forwards unhandled server errors to Sentry, with the route that failed.
 *
 * The request body and headers are deliberately NOT attached: a POST to
 * `/api/generate` carries the user's extracted document text, which must never
 * leave the server.
 */
export const onRequestError: typeof import("@sentry/nextjs").captureRequestError =
  async (...args) => {
    if (!process.env.SENTRY_DSN) return;

    const Sentry = await import("@sentry/nextjs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- signature is opaque
    return (Sentry.captureRequestError as any)(...args);
  };
