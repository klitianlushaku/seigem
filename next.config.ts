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
   * `firebase-admin` is a CommonJS package whose `exports` map ALSO declares an
   * ESM condition:
   *
   *   "./auth": { "require": "./lib/auth/index.js",
   *               "import":  "./lib/esm/auth/index.js" }
   *
   * The ESM files contain real `import`/`export` syntax but live in a package
   * whose package.json has no `"type": "module"`, so Node classifies them as
   * CommonJS and refuses to load them as ESM. When anything loads the package
   * through the `import` condition, every protected route dies at import time:
   *
   *   Error: Failed to load external module firebase-admin-.../auth:
   *          Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported
   *
   * That surfaced as HTTP 500 with an EMPTY body, because the route threw while
   * its imports were being evaluated and no handler ever ran.
   *
   * Keeping the package external (below) makes the serverless runtime load it
   * with `require()`, which selects the CommonJS `require` condition and works.
   * Verified: `require("firebase-admin/auth")` succeeds, while resolving the
   * ESM condition is what fails.
   */
  serverExternalPackages: ["firebase-admin"],
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
