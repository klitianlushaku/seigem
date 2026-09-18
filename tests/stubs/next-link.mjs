/**
 * Test stand-in for `next/link`.
 *
 * Next.js resolves `next/link` through its bundler, so it cannot be imported
 * directly by `node --test`. Components under test render with
 * `react-dom/server`, so this stub only needs to produce the same markup a
 * link would: an anchor carrying the resolved `href` and any other props.
 *
 * The rendered output IS asserted on (for example that a tile links to
 * /dashboard#kuiz), so this must stay faithful to the real component's
 * contract for the props the app actually uses.
 */
import { createElement } from "react";

export default function Link({ href, children, ...rest }) {
  return createElement("a", { href, ...rest }, children);
}
