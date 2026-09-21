/**
 * Screenshots the app shell (header + sidebar) at phone widths.
 *
 * Run with: node tools/check-shell.mjs [baseUrl]
 *
 * The header and sidebar are shared by every page, so a problem in either shows
 * up everywhere and is easy to misattribute to the page you happen to be on.
 * This crops to those two regions and writes images plus a text dump, so the
 * layout can be judged from evidence instead of from a description.
 *
 * Requires Playwright/Chromium installed globally.
 */
/* eslint-disable no-console -- a CLI tool; printed output is the deliverable */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = require(`${globalRoot}/playwright`);

const baseUrl = (process.argv[2] ?? "http://localhost:4000").replace(/\/+$/, "");

/** Narrow widths, where a header with this many controls is most at risk. */
const WIDTHS = [320, 360, 390];

const browser = await chromium.launch();

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });

  const header = page.locator("header").first();
  if ((await header.count()) > 0) {
    await header.screenshot({ path: `shell-header-${width}.png` });
  }

  // Measure the header's children so a cramped row is visible as numbers.
  const metrics = await page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) return null;

    const rect = header.getBoundingClientRect();
    const children = Array.from(header.querySelectorAll(":scope > *")).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").trim().slice(0, 40),
        width: Math.round(r.width),
        // Children that have collapsed to zero are hidden by a breakpoint.
        visible: r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none",
      };
    });

    return {
      headerWidth: Math.round(rect.width),
      headerHeight: Math.round(rect.height),
      scrollWidth: header.scrollWidth,
      children,
    };
  });

  console.log(`\n=== ${width}px ===`);
  if (!metrics) {
    console.log("  no header found");
  } else {
    console.log(
      `  header ${metrics.headerWidth}x${metrics.headerHeight}px ` +
        `scrollWidth=${metrics.scrollWidth}`,
    );
    for (const child of metrics.children) {
      if (!child.visible) continue;
      console.log(`    <${child.tag}> w=${child.width}  "${child.text}"`);
    }

    // The greeting should stay on one line; wrapping to three lines in a
    // header this short is what makes it look broken on a phone.
    const greeting = await page.evaluate(() => {
      const h1 = document.querySelector("header h1");
      if (!h1) return null;
      const r = h1.getBoundingClientRect();
      const style = getComputedStyle(h1);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      return {
        text: (h1.textContent ?? "").trim(),
        width: Math.round(r.width),
        height: Math.round(r.height),
        lines: Math.round(r.height / lineHeight),
        fontSize: style.fontSize,
      };
    });

    if (greeting) {
      console.log(
        `    greeting: "${greeting.text}" ${greeting.fontSize}, ` +
          `${greeting.lines} line(s), ${greeting.width}px wide`,
      );
    }
  }

  await context.close();
}

await browser.close();
console.log("\nScreenshots: shell-header-{320,360,390}.png");
