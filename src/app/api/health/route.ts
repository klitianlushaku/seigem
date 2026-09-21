/**
 * GET /api/health
 *
 * Deployment configuration check.
 *
 * Every protected route in Seigem runs on Firebase Admin credentials. When one
 * of those variables is missing on the host — the usual cause is a variable that
 * exists in `.env.local` but was never added to Vercel — EVERY API route fails
 * at once with an opaque 500. That is nearly impossible to diagnose from the
 * browser console, because it looks identical to an application bug.
 *
 * This endpoint reports exactly which pieces of configuration are present, so
 * the situation is one request to diagnose.
 *
 * SECURITY: unauthenticated, so it returns only booleans and fixed problem
 * descriptions. All secret reads happen inside `src/server/config/inspect`,
 * which never returns a value.
 */
import { NextResponse } from "next/server";

import { inspectConfiguration } from "@/server/config/inspect";

export async function GET(): Promise<NextResponse> {
  const report = inspectConfiguration();

  return NextResponse.json(
    {
      ok: report.apiReady && report.firebaseWeb.ok,
      ...report,
      environment: process.env.VERCEL_ENV ?? "unknown",
    },
    {
      // Never cache: this must reflect the running deployment's real config.
      headers: { "Cache-Control": "no-store" },
      // 503 rather than 500 so uptime checks see a clear unhealthy signal and
      // monitoring can tell "misconfigured" apart from "crashed".
      status: report.apiReady ? 200 : 503,
    },
  );
}
