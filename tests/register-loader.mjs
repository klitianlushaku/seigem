/**
 * Node module resolution hook.
 *
 * Maps the project's TypeScript path alias (`@/*` -> `src/*`) and appends the
 * `.ts` extension so `node --test --experimental-strip-types` can run the
 * application modules directly, without a separate build step or a bundler.
 *
 * Registered via `--import` in the test scripts.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./tests/alias-loader.mjs", pathToFileURL("./"));

export {};
