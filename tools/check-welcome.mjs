/**
 * One-off verification of the logged-out dashboard.
 *
 * Run with: node tools/check-welcome.mjs [baseUrl]
 *
 * Confirms three things that are easy to regress and impossible to see in a
 * build log:
 *
 *   1. A signed-out visitor sees the product tour (a real flashcard and quiz),
 *      NOT four meters reading zero.
 *   2. The flashcard is actually interactive — tapping it reveals the answer.
 *   3. The page does not overflow horizontally at phone width.
 *
 * Writes a screenshot for visual review. Requires Playwright/Chromium installed
 * globally; nothing is added to the app's dependencies.
 */
/* eslint-disable no-console -- a CLI tool; printed output is the deliverable */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = require(`${globalRoot}/playwright`);

const baseUrl = (process.argv[2] ?? "http://localhost:3500").replace(/\/+$/, "");

/**
 * Both widths matter, and for different reasons.
 *
 * Mobile catches overflow. Desktop catches the opposite failure: a layout that
 * is technically valid but sparse — one stretched column with a huge empty card,
 * which is what the first version of this page looked like.
 */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 900, isMobile: true },
  { name: "desktop", width: 1440, height: 1000, isMobile: false },
];

const browser = await chromium.launch();

let failures = 0;

/** Asserts a condition and reports it. */
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures += 1;
  }
}

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  const page = await context.newPage();

  console.log(`\n=== ${viewport.name} (${viewport.width}px) ===`);

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });

  const body = await page.textContent("body");

  check("shows the 'Fillo tani' call to action", body.includes("Fillo tani"));
  check(
    "shows a sample flashcard question",
    body.includes("fotosintezës") || body.includes("Klorofili"),
  );
  check("shows the how-it-works section", body.includes("Si funksionon"));
  check("states the free plan limits", body.includes("Plani Falas"));

  // The empty meters must be gone for a signed-out visitor.
  check("does NOT show the empty 'Studimi sot' meter", !body.includes("Studimi sot"));
  check("does NOT show the empty streak meter", !body.includes("Streak / Synimi sot"));

  // --- The flashcard must actually flip -------------------------------------
  const card = page.locator(".flip-inner").first();
  check("a flip card is rendered", (await card.count()) > 0);

  if ((await card.count()) > 0) {
    const before = await card.getAttribute("data-flipped");
    await card.click();
    await page.waitForTimeout(600);
    const after = await card.getAttribute("data-flipped");
    check(`tapping the card flips it (${before} -> ${after})`, after === "true");
  }

  // --- The quiz must be answerable ------------------------------------------
  const answerButton = page.getByRole("button", { name: /Klorofili/ }).first();
  if ((await answerButton.count()) > 0) {
    await answerButton.click();
    await page.waitForTimeout(300);
    const afterAnswer = await page.textContent("body");
    check("answering the sample quiz gives an explanation", afterAnswer.includes("Saktë"));
  } else {
    check("sample quiz options are rendered", false);
  }

  // --- No horizontal overflow -----------------------------------------------
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    `no horizontal overflow (${metrics.scrollWidth} <= ${metrics.clientWidth})`,
    metrics.scrollWidth <= metrics.clientWidth + 1,
  );

  /*
   * Desktop density guard. The previous version passed every functional check
   * while looking empty, so measure the thing that was wrong: the share of the
   * viewport the content actually occupies, and how tall the page is.
   */
  if (!viewport.isMobile) {
    const density = await page.evaluate(() => {
      const main = document.querySelector("main");
      const rect = main?.getBoundingClientRect();
      const card = document.querySelector(".flip-scene");
      const cardRect = card?.getBoundingClientRect();
      return {
        mainWidth: Math.round(rect?.width ?? 0),
        cardWidth: Math.round(cardRect?.width ?? 0),
        pageHeight: document.documentElement.scrollHeight,
        viewportWidth: document.documentElement.clientWidth,
      };
    });

    // A single centred column wastes a widescreen; a capped card stays card-sized.
    check(
      `flashcard is card-sized, not stretched (${density.cardWidth}px wide)`,
      density.cardWidth > 0 && density.cardWidth <= 520,
    );
    check(
      `page is not a single narrow strip (content spans ${density.mainWidth}px of ${density.viewportWidth}px)`,
      density.mainWidth > density.viewportWidth * 0.6,
    );
  }

  await page.screenshot({
    path: `welcome-${viewport.name}.png`,
    fullPage: true,
  });

  await context.close();
}

await browser.close();

console.log("\nScreenshots: welcome-mobile.png, welcome-desktop.png");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("Logged-out dashboard verified.");

