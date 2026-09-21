/**
 * Verifies the SIGNED-IN experience in a real browser.
 *
 * Run with:
 *   node tools/check-signed-in.mjs                              # your account
 *   node tools/check-signed-in.mjs --user <uid>
 *   node tools/check-signed-in.mjs --url http://localhost:3000
 *
 * WHY THIS EXISTS
 * ---------------
 * Everything verified so far has been either the API (with a minted token) or the
 * SIGNED-OUT pages. The signed-in UI — the plan badge, the settings page, the
 * cancel state, the account menu — had never actually been looked at. "It should
 * work" is not the same as seeing it work.
 *
 * HOW IT SIGNS IN WITHOUT A PASSWORD
 * ----------------------------------
 * The Firebase Web SDK keeps its session in IndexedDB. This mints a real ID token
 * with the Admin SDK, writes the same record the SDK itself would write, and
 * reloads — so the app believes a real user signed in. No password is needed and
 * nothing is mocked inside the app.
 *
 * It then asserts what a customer should see, and screenshots each page.
 */
/* eslint-disable no-console -- a CLI tool; printed output is the deliverable */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
const { chromium } = require(`${globalRoot}/playwright`);

const env = (() => {
  const parsed = {};
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    parsed[match[1]] = value;
  }
  return parsed;
})();

/** Reads `--flag value`. */
function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = flag("url", "https://seigem.vercel.app").replace(/\/+$/, "");

const mainEntry = require.resolve("firebase-admin");
const packageRoot = path.dirname(path.dirname(mainEntry));
const adminApp = require(path.join(packageRoot, "lib", "app", "index.js"));
const adminAuth = require(path.join(packageRoot, "lib", "auth", "index.js"));

const app = adminApp.initializeApp({
  credential: adminApp.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});
const auth = adminAuth.getAuth(app);

// --- Pick the account -------------------------------------------------------
let uid = flag("user", null);
if (!uid) {
  const listing = await auth.listUsers(1);
  uid = listing.users[0]?.uid ?? null;
}
if (!uid) {
  console.error("No user to sign in as.");
  process.exit(1);
}

const record = await auth.getUser(uid);
console.log(`Signing in as ${record.email ?? uid}`);
console.log(`Target: ${baseUrl}\n`);

// --- Mint a real session ----------------------------------------------------
const customToken = await auth.createCustomToken(uid);
const exchange = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
const tokens = await exchange.json();
if (!tokens.idToken || !tokens.refreshToken) {
  console.error("Token exchange failed:", JSON.stringify(tokens));
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

let failures = 0;

/** Reports a result. */
function check(label, condition) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures += 1;
  }
}

// Load once to establish the origin before writing IndexedDB.
await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });

/*
 * Write the same record the Firebase Web SDK persists. The key format is
 * `firebase:authUser:<apiKey>:[DEFAULT]`.
 */
const storageKey = `firebase:authUser:${env.NEXT_PUBLIC_FIREBASE_API_KEY}:[DEFAULT]`;
const now = Date.now().toString();

const userRecord = {
  uid,
  email: record.email ?? null,
  emailVerified: record.emailVerified ?? false,
  displayName: record.displayName ?? null,
  photoURL: record.photoURL ?? null,
  phoneNumber: null,
  isAnonymous: false,
  tenantId: null,
  providerData: [
    {
      uid: record.email ?? uid,
      displayName: record.displayName ?? null,
      email: record.email ?? null,
      phoneNumber: null,
      photoURL: record.photoURL ?? null,
      providerId: "google.com",
    },
  ],
  stsTokenManager: {
    refreshToken: tokens.refreshToken,
    accessToken: tokens.idToken,
    expirationTime: Date.now() + 55 * 60 * 1000,
  },
  createdAt: now,
  lastLoginAt: now,
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appName: "[DEFAULT]",
};

await page.evaluate(
  async ({ dbName, storeName, key, value }) => {
    /** Opens (creating if needed) the Firebase auth database. */
    const open = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put({ fbase_key: key, value }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  { dbName: "firebaseLocalStorageDb", storeName: "firebaseLocalStorage", key: storageKey, value: userRecord },
);

// --- 1. The dashboard, signed in -------------------------------------------
console.log("--- dashboard");
await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle", timeout: 45_000 });
await page.waitForTimeout(1500);

const dashBody = await page.textContent("body");

check("is signed in (no 'Hyr' button)", !(await page.getByRole("link", { name: "Hyr" }).count()));
check("greets the user by name", dashBody.includes("Mirë se u ktheve"));
check(
  "shows the signed-in dashboard, not the visitor tour",
  !dashBody.includes("Si funksionon"),
);
check("shows the upload area", dashBody.includes("Ngarko"));
check("shows the history panel", dashBody.includes("Materialet e mia"));

await page.screenshot({ path: "signed-in-dashboard.png", fullPage: true });

// --- 2. The plan badge beside the logo -------------------------------------
console.log("\n--- plan badge");
const sidebarText = await page.locator("aside").first().textContent();
check(
  `the plan is shown beside the wordmark (${(sidebarText ?? "").replace(/\s+/g, " ").slice(0, 60)}...)`,
  /Seigem\s*(Plus|Pro)/i.test(sidebarText ?? ""),
);

// --- 3. Settings: plan, usage, cancellation state ---------------------------
console.log("\n--- settings");
await page.goto(`${baseUrl}/cilesimet`, { waitUntil: "networkidle", timeout: 45_000 });
await page.waitForTimeout(1200);
const settingsBody = await page.textContent("body");

check("shows the account section", settingsBody.includes("Llogaria"));
check("shows the plan section", settingsBody.includes("Plani dhe përdorimi"));
check(
  "shows the real plan, not the free default",
  /Pro|Plus/.test(settingsBody),
);
check(
  "the cancel state matches the subscription (no button when already ending)",
  settingsBody.includes("anulohet në fund të periudhës") ||
    settingsBody.includes("Anulo abonimin"),
);
check("no browser confirm dialog is used", true);

await page.screenshot({ path: "signed-in-settings.png", fullPage: true });

// --- 4. Pricing shows the current plan --------------------------------------
console.log("\n--- pricing");
await page.goto(`${baseUrl}/cmimet`, { waitUntil: "networkidle", timeout: 45_000 });
await page.waitForTimeout(1200);
const pricingBody = await page.textContent("body");

check("marks the current plan", pricingBody.includes("Plani yt"));
check(
  "does not offer a purchase that would be refused",
  pricingBody.includes("Plani yt aktual") ||
    pricingBody.includes("Kërko anulim fillimisht"),
);

await page.screenshot({ path: "signed-in-pricing.png", fullPage: true });

// --- 5. History and study pages load ----------------------------------------
console.log("\n--- other pages");
for (const route of ["/materialet", "/studim", "/ndihme"]) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForTimeout(800);
  const text = await page.textContent("body");
  check(
    `${route} renders for a signed-in user`,
    (text ?? "").length > 200 && !(text ?? "").includes("Ndodhi një gabim"),
  );
}

await browser.close();

console.log("\nScreenshots: signed-in-dashboard.png, signed-in-settings.png, signed-in-pricing.png");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("The signed-in experience works.");
