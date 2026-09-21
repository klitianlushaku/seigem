/**
 * Generates the `outputFileTracingIncludes` list for firebase-admin.
 *
 * Run with: node scripts/generate-tracing-includes.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/server/firebase/admin-loader.cjs` loads the Admin SDK by filesystem path
 * at runtime, so nothing in the module graph statically imports it. Next.js
 * assembles a deployed serverless function from a FILE TRACE, and an unimported
 * package is not traced.
 *
 * The deployed failure that motivated this was, from /api/health:
 *
 *   products.firestore.loaded = false
 *   products.firestore.error  = Cannot find module '@js-sdsl/ordered-map'
 *     - /var/task/node_modules/@google-cloud/firestore-api/node_modules/
 *       @grpc/grpc-js/build/src/channelz.js
 *
 * `app` and `auth` loaded fine; only `firestore` failed. The missing module is
 * required by a NESTED copy of `@grpc/grpc-js`, and an earlier version of this
 * script only walked TOP-LEVEL packages, so the nested tree and its
 * dependencies were never included.
 *
 * This version resolves dependencies the way Node does: from a package's own
 * directory outward, checking each enclosing `node_modules` before falling back
 * to the hoisted top-level copy. Every resolved location is emitted, so nested
 * copies are traced too.
 *
 * The list is derived from package-lock.json rather than hand-written: the
 * closure runs to ~140 packages and a manual list rots as soon as a dependency
 * changes. Including all of `node_modules` is not an option — it is 884 MB,
 * well past the serverless bundle limit.
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

/** Every package location in the tree, hoisted and nested alike. */
const locations = new Set(
  Object.keys(packages).filter(
    (location) =>
      location.startsWith("node_modules/") && packages[location] !== undefined,
  ),
);

/** A package location is a directory holding a package.json. */
const isLocation = (candidate) => locations.has(candidate);

/**
 * Strips the last package name from a location path.
 *
 * Handles scoped names: `node_modules/@scope/name` loses both segments.
 *
 * @param {string} location e.g. "node_modules/a/node_modules/@scope/b"
 * @returns {string} e.g. "node_modules/a"
 */
function stripLastPackage(location) {
  const parts = location.split("/");
  // Drop the final segment (the package's own name).
  parts.pop();
  // If that leaves a scope segment, drop it too.
  const last = parts[parts.length - 1];
  if (typeof last === "string" && last.startsWith("@")) parts.pop();
  return parts.join("/");
}

/**
 * Resolves a dependency name from a package location, mirroring Node.
 *
 * Checks the package's own `node_modules` first, then each enclosing directory,
 * and finally the hoisted top-level copy.
 *
 * @param {string} fromLocation Location of the depending package.
 * @param {string} depName      Dependency package name.
 * @returns {string | null} The location that provides it, or null.
 */
function resolveDependency(fromLocation, depName) {
  let current = fromLocation;

  // Walk outward through every enclosing directory.
  for (;;) {
    const candidate = `${current}/node_modules/${depName}`;
    if (isLocation(candidate)) return candidate;

    const parent = stripLastPackage(current);
    // Stop once we step above the outermost node_modules.
    if (parent === "" || parent === "node_modules") break;
    current = parent;
  }

  const hoisted = `node_modules/${depName}`;
  return isLocation(hoisted) ? hoisted : null;
}

/**
 * Walks the dependency graph from the roots, following nested resolution.
 *
 * Optional and peer dependencies are included: firebase-admin treats
 * `@google-cloud/firestore` as optional, but Firestore is essential here.
 *
 * @param {string[]} roots Top-level package names to start from.
 * @returns {string[]} Sorted list of package LOCATIONS to trace.
 */
function dependencyClosureLocations(roots) {
  const seen = new Set();
  const queue = [];

  for (const name of roots) {
    const location = `node_modules/${name}`;
    if (isLocation(location)) queue.push(location);
  }

  while (queue.length > 0) {
    const location = queue.pop();
    if (seen.has(location)) continue;
    seen.add(location);

    const info = packages[location] ?? {};
    const deps = {
      ...(info.dependencies ?? {}),
      ...(info.optionalDependencies ?? {}),
      ...(info.peerDependencies ?? {}),
    };

    for (const depName of Object.keys(deps)) {
      if (depName.startsWith("node:")) continue;
      const resolved = resolveDependency(location, depName);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return [...seen].sort();
}

const closure = dependencyClosureLocations(ROOTS);

/**
 * Builds the include patterns.
 *
 * A trailing `/**` copies the whole package directory, which the runtime loader
 * needs: it resolves files by path, so partial tracing would leave gaps.
 */
const includes = closure.map((location) => `./${location}/**`);

const output = {
  generatedBy: "scripts/generate-tracing-includes.mjs",
  note:
    "Derived from package-lock.json with Node-style nested resolution. " +
    "Regenerate with `node scripts/generate-tracing-includes.mjs` after " +
    "changing dependencies.",
  rootPackages: ROOTS,
  locationCount: closure.length,
  locations: closure,
  includes,
};

const target = path.join(root, "tracing-includes.generated.json");
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");

// eslint-disable-next-line no-console -- build-time script, output is the point
console.log(
  `Wrote ${closure.length} include patterns to ${path.basename(target)} ` +
    `(${closure.filter((l) => l.includes("/node_modules/")).length} nested)`,
);
