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

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });

let failures = 0;

/** Asserts a condition and reports it. */
async function check(label, condition) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures += 1;
  }
}

const body = await page.textContent("body");

await check("shows the 'Fillo tani' call to action", body.includes("Fillo tani"));
await check(
  "shows a sample flashcard question",
  body.includes("fotosintezës") || body.includes("Klorofili"),
);
await check(
  "shows the flashcard heading",
  body.includes("Kështu duket një flashcard"),
);
await check("shows the quiz heading", body.includes("kështu një pyetje kuizi"));

// The empty meters must be gone for a signed-out visitor.
await check("does NOT show the empty 'Studimi sot' meter", !body.includes("Studimi sot"));
await check("does NOT show the empty streak meter", !body.includes("Streak / Synimi sot"));

// --- The flashcard must actually flip ---------------------------------------
const card = page.locator(".flip-inner").first();
await check("a flip card is rendered", (await card.count()) > 0);

if ((await card.count()) > 0) {
  const before = await card.getAttribute("data-flipped");
  await card.click();
  await page.waitForTimeout(600);
  const after = await card.getAttribute("data-flipped");
  await check(
    `tapping the card flips it (${before} -> ${after})`,
    before !== after && after === "true",
  );
}

// --- The quiz must be answerable --------------------------------------------
const answerButton = page.getByRole("button", { name: /Klorofili/ }).first();
if ((await answerButton.count()) > 0) {
  await answerButton.click();
  await page.waitForTimeout(300);
  const afterAnswer = await page.textContent("body");
  await check("answering the sample quiz gives feedback", afterAnswer.includes("Saktë"));
} else {
  await check("sample quiz options are rendered", false);
}

// --- No horizontal overflow -------------------------------------------------
const metrics = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
await check(
  `no horizontal overflow (${metrics.scrollWidth} <= ${metrics.clientWidth})`,
  metrics.scrollWidth <= metrics.clientWidth + 1,
);

await page.screenshot({ path: "welcome-preview.png", fullPage: true });
console.log("\nScreenshot written to welcome-preview.png");

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("Logged-out dashboard verified.");
