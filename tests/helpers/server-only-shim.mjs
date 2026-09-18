/**
 * Resolve hook that maps `server-only` to an empty module.
 *
 * Used only by the test helper `load-server-module.mjs`. See that file for why
 * this is safe and does not weaken the production guarantee.
 */
const EMPTY_MODULE = new URL("./empty-module.mjs", import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: EMPTY_MODULE, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
