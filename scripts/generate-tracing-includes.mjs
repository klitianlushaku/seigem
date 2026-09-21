/**
 * Generates the `outputFileTracingIncludes` list for firebase-admin.
 *
 * Run with: node scripts/generate-tracing-includes.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/server/firebase/admin-loader.cjs` loads the Admin SDK by filesystem path
 * at runtime, so NOTHING in the module graph statically imports it. Next.js
 * assembles a deployed serverless function from a file trace, and an unimported
 * package is not traced — measured on this project the trace held 1
 * firebase-admin entry and zero `jose` / `jwks-rsa` files.
 *
 * On Vercel the package was therefore absent when the loader looked for it, so
 * `resolveAdminMain()` returned null and every authenticated request failed with
 * "the service is not configured correctly". It never reproduced locally,
 * because the local machine has a complete `node_modules` no matter what the
 * trace recorded.
 *
 * The list is DERIVED from package-lock.json rather than hand-written: the
 * dependency closure is 135 packages, and a hand-maintained list silently rots
 * the moment any dependency changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

/** Packages whose runtime dependencies must be traced into the bundle. */
const ROOTS = ["firebase-admin"];

const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
const packages = lock.packages ?? {};

/** Maps a top-level package name to its hoisted location in node_modules. */
const locationByName = new Map();
for (const [location, info] of Object.entries(packages)) {
  if (!location.startsWith("node_modules/")) continue;
  const name = location.slice("node_modules/".length);
  // Skip nested copies such as node_modules/a/node_modules/b.
  if (name.includes("node_modules/")) continue;
  locationByName.set(name, location);
  void info;
}

/**
 * Walks the dependency graph from the roots.
 * Includes optional and peer dependencies, since firebase-admin treats
 * @google-cloud/firestore as optional but Firestore is essential here.
 */
function dependencyClosure(roots) {
  const seen = new Set();
  const queue = [...roots];

  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);

    const location = locationByName.get(name);
    if (!location) continue;

    const info = packages[location];
    const deps = {
      ...(info.dependencies ?? {}),
      ...(info.optionalDependencies ?? {}),
      ...(info.peerDependencies ?? {}),
    };

    for (const dep of Object.keys(deps)) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }

  return [...seen].sort();
}

const closure = dependencyClosure(ROOTS);

/**
 * Builds the include patterns.
 *
 * A trailing `/**` copies the whole package directory, which is what the
 * runtime loader needs: it resolves files by path, so partial tracing would
 * still leave gaps.
 */
function includePatterns(names) {
  return names.map((name) => `./node_modules/${name}/**`);
}

const includes = includePatterns(closure);

const output = {
  generatedBy: "scripts/generate-tracing-includes.mjs",
  note:
    "Derived from package-lock.json. Regenerate with " +
    "`node scripts/generate-tracing-includes.mjs` after changing dependencies.",
  rootPackages: ROOTS,
  packageCount: closure.length,
  packages: closure,
  includes,
};

const target = path.join(root, "tracing-includes.generated.json");
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");

// eslint-disable-next-line no-console -- build-time script, output is the point
console.log(
  `Wrote ${closure.length} package include patterns to ${path.basename(target)}`,
);
