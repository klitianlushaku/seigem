/**
 * Module resolve + load hook for the test runner.
 *
 * Two jobs:
 *   1. resolve: implement the `@/*` -> `src/*` path alias (bare package
 *      specifiers fall through to Node's default resolution).
 *   2. load: compile `.tsx` files. Node's `--experimental-strip-types` handles
 *      plain TypeScript but errors on JSX, so TSX is transpiled with esbuild
 *      (already present as a Next.js dependency) before Node sees it.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = path.join(PROJECT_ROOT, "src");

/** Extensions to try when the aliased path has no explicit extension. */
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

export function resolve(specifier, context, nextResolve) {
  // `next/link` only exists inside a Next.js build. Tests render components
  // with react-dom/server outside that build, so it is redirected to a minimal
  // local stand-in that renders an <a> carrying the same props.
  if (specifier === "next/link") {
    return {
      url: pathToFileURL(
        path.join(PROJECT_ROOT, "tests", "stubs", "next-link.mjs"),
      ).href,
      shortCircuit: true,
    };
  }

  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    const base = path.join(SRC_ROOT, relative);

    // Exact file first (e.g. "@/config/plans" -> src/config/plans.ts).
    for (const extension of ["", ...EXTENSIONS]) {
      const candidate = `${base}${extension}`;
      if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }

    // Then a directory index (e.g. "@/services/document" -> .../index.ts).
    for (const extension of EXTENSIONS) {
      const candidate = path.join(base, `index${extension}`);
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }

  // Relative and absolute imports of the project's own source files.
  //
  // The application is authored for a bundler, which resolves "./prompts" to
  // "./prompts.ts". Node's ESM resolver requires the extension, so it is added
  // here. Node builtins and bare package specifiers are left untouched.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !path.extname(specifier)
  ) {
    const parentPath = context.parentURL
      ? path.dirname(fileURLToPath(context.parentURL))
      : PROJECT_ROOT;
    const base = path.resolve(parentPath, specifier);

    for (const extension of EXTENSIONS) {
      const candidate = `${base}${extension}`;
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }

    for (const extension of EXTENSIONS) {
      const candidate = path.join(base, `index${extension}`);
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }

  return nextResolve(specifier, context);
}

/**
 * Transpiles `.tsx` to plain ESM so Node can execute it.
 *
 * esbuild is loaded lazily so the (rare) non-JSX test runs pay nothing.
 */
export async function load(url, context, nextLoad) {
  if (url.endsWith(".tsx")) {
    const { transform } = await import("esbuild");
    const source = readFileSync(fileURLToPath(url), "utf8");

    const { code } = await transform(source, {
      loader: "tsx",
      format: "esm",
      target: "es2022",
      jsx: "automatic",
      // Keep the source in the output so stack traces stay useful.
      sourcemap: "inline",
    });

    return { format: "module", source: code, shortCircuit: true };
  }

  return nextLoad(url, context);
}
