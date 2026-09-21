/**
 * Sentry instrumentation for the browser.
 *
 * Loaded automatically by Next.js in client components. Guarded by the presence
 * of a DSN so the SDK is not initialised — and no requests are made — when
 * monitoring is unconfigured.
 *
 * What this catches that the server instrumentation cannot: errors thrown in
 * the browser after a page has loaded. The `Timestamp` proxy bug, for example,
 * presented as an unhandled promise rejection alongside a failed request; this
 * would have captured the client half of it with a stack trace pointing at the
 * real component.
 *
 * No session replay and no performance tracing: both would send far more data
 * than is useful here, and replay risks capturing the user's document text.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,
    });
  });
}
