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
   * Keep the Admin loader out of the bundle so NODE performs its `require`
   * calls at runtime.
   *
   * This is the fix for the production failure where every route touching
   * Firestore or Auth returned HTTP 500 with an EMPTY body:
   *
   *   Error: Failed to load external module
   *          firebase-admin-a14c8a5423a75469/auth:
   *          Error [ERR_REQUIRE_ESM]: require() of ES Module ... not supported
   *
   * `firebase-admin` declares both a `require` and an `import` condition in its
   * `exports` map, and the `import` target (`lib/esm/*`) is real ESM inside a
   * package with no `"type": "module"`, so Node refuses to load it. The
   * serverless loader picks that broken condition whenever the package is
   * externalized or its specifier is rewritten by the bundler — which is why
   * `serverExternalPackages`, deep specifiers, `createRequire`, and runtime
   * path building all failed.
   *
   * `admin-loader.cjs` is copied verbatim, so its `require` runs in Node and
   * resolves the CommonJS build. Only the loader is listed here;
   * `firebase-admin` itself must NOT be, since externalizing it is what
   * produced the ERR_REQUIRE_ESM error in the first place.
   */
  serverExternalPackages: ["./admin-loader.cjs"],
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
