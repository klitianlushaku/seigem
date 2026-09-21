import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the tracing/build root to this project directory. Without it, Turbopack
  // walks up to the nearest package-lock.json, which can be outside the project.
  turbopack: {
    root: path.resolve(__dirname),
  },
  /**
   * Keep these packages OUT of the server bundle and load them from
   * `node_modules` at runtime instead.
   *
   * Why this is required — it caused every /api route to return HTTP 500 with
   * an EMPTY body in production, while the identical code returned a correct
   * 401 locally:
   *
   * The bundler rewrites dynamic server imports to hashed, build-local paths —
   * e.g. `import("firebase-admin/app")` becomes
   * `await __load("firebase-admin-a14c8a5423a75469/app")`. That hashed directory
   * exists only inside the build output. On Vercel the serverless function is
   * assembled from the file trace, which records the ORIGINAL
   * `node_modules/firebase-admin/lib/...` paths, not the hashed alias. The
   * module then fails to resolve at import time, so the route throws before any
   * handler runs — which is why no JSON error body was ever produced.
   *
   * Marking them external makes the runtime `require` the real package path,
   * which IS in the trace, so the import succeeds.
   *
   * `firebase-admin` is the critical one (every protected route needs it). The
   * rest are CommonJS/dynamic-loading packages used only in server code and
   * never needed in the browser bundle, so they carry the same risk.
   */
  serverExternalPackages: [
    "firebase-admin",
    "mammoth",
    "jszip",
    "pdfjs-dist",
    "standardwebhooks",
  ],
  /**
   * Seigem has no marketing home page: the app IS the dashboard.
   *
   * `/` therefore redirects straight into it. Unauthenticated visitors are
   * bounced on to /login by the dashboard layout's auth guard, so the redirect
   * is safe to apply unconditionally.
   */
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  // Uploaded documents are parsed in the browser, so API routes only ever
  // receive structured text payloads. Keep the request body limit modest.
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
