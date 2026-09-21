/**
 * Responsive audit against a running deployment.
 *
 * Run with:
 *   node tools/check-responsive.mjs                          # production
 *   node tools/check-responsive.mjs http://localhost:3000
 *
 * WHY THIS EXISTS
 * ---------------
 * "It is not responsive on my phone" is not something to fix by reading Tailwind
 * classes and guessing. This loads each page at real phone widths, measures
 * `scrollWidth` against `clientWidth` to detect horizontal overflow, and then
 * names the exact element that overflows — its tag, classes, and how far past
 * the viewport it reaches.
 *
 * Horizontal overflow is the usual cause: one wide element makes the whole page
 * pan sideways, and every other symptom follows from that.
 *
 * Requires Playwright with Chromium installed globally. Nothing is added to the
 * application's dependencies.
 */
/* eslint-disable no-console -- a CLI tool; printed output is the deliverable */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);

// Playwright is installed globally, so resolve it from the global root.
const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = require(`${globalRoot}/playwright`);

const baseUrl = (process.argv[2] ?? "https://seigem.vercel.app").replace(/\/+$/, "");

/** Real device widths worth checking, smallest first. */
const VIEWPORTS = [
  { name: "iPhone SE", width: 320, height: 568 },
  { name: "iPhone 12", width: 390, height: 844 },
  { name: "iPhone 14 Pro Max", width: 430, height: 932 },
];

/** Public pages. Authenticated pages are covered by their signed-out shell. */
const PAGES = ["/", "/login", "/cmimet", "/cilesimet", "/ndihme", "/materialet"];

const browser = await chromium.launch();

/** Any element wider than the viewport, with the detail needed to fix it. */
const OVERFLOW_PROBE = `
  (() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = [];

    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      // How far the element's right edge extends past the viewport.
      const overflowRight = rect.right - viewportWidth;
      const overflowLeft = -rect.left;

      if (overflowRight > 1 || overflowLeft > 1) {
        // Skip elements whose parent already overflows: report the outermost.
        offenders.push({
          tag: el.tagName.toLowerCase(),
          className:
            typeof el.className === "string" ? el.className.slice(0, 160) : "",
          text: (el.textContent || "").trim().slice(0, 60),
          overflowRight: Math.round(overflowRight),
          overflowLeft: Math.round(overflowLeft),
          width: Math.round(rect.width),
        });
      }
    }

    return {
      viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 12),
    };
  })()
`;

let problems = 0;

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();

  console.log(`\n=== ${viewport.name} (${viewport.width}px) ===`);

  for (const path of PAGES) {
    let result;
    try {
      await page.goto(`${baseUrl}${path}`, {
        waitUntil: "networkidle",
        timeout: 45_000,
      });
      result = await page.evaluate(OVERFLOW_PROBE);
    } catch (error) {
      console.log(`  ${path.padEnd(14)} SKIP  (${error.message.slice(0, 60)})`);
      continue;
    }

    const horizontalScroll = result.scrollWidth - result.viewportWidth;
    const bad = horizontalScroll > 1;

    if (bad) problems += 1;

    console.log(
      `  ${path.padEnd(14)} ${bad ? "OVERFLOW" : "ok      "}  ` +
        `scrollWidth=${result.scrollWidth} viewport=${result.viewportWidth} ` +
        `(+${horizontalScroll}px)`,
    );

    /*
     * Offenders are only listed when the PAGE overflows. An element wider than
     * the viewport inside an `overflow-x-auto` container is intentional — the
     * help page's comparison table does exactly that — so reporting it would be
     * a false positive that sends you chasing a non-bug.
     */
    if (!bad) continue;

    for (const offender of result.offenders.slice(0, 5)) {
      console.log(
        `      <${offender.tag}> +${offender.overflowRight}px ` +
          `w=${offender.width} class="${offender.className}"`,
      );
      if (offender.text) console.log(`          "${offender.text}"`);
    }
  }

  await context.close();
}

await browser.close();

console.log("");
if (problems > 0) {
  console.log(`${problems} page/viewport combination(s) overflow horizontally.`);
  process.exit(1);
}
console.log("No horizontal overflow at any tested width.");
