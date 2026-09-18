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
