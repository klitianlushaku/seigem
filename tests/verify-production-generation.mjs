/**
 * Tests the PRODUCTION generation endpoint with a real ID token.
 *
 * Run with: node tests/verify-production-generation.mjs
 *
 * The upload completing with no flashcards/summary/quiz means the generation
 * request either reached DeepSeek and came back incomplete, or was rejected.
 * This calls the endpoint directly and prints exactly what it returns, which
 * separates those cases.
 *
 * NOTE: this CONSUMES daily plan quota on the account it uses.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file = path.join(here, "..", ".env.local")) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

const env = loadEnv();
const BASE = process.argv[2] ?? "https://seigem.vercel.app";

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
const listed = await auth.listUsers(1);
const user = listed.users[0];
if (!user) {
  console.error("No users in the project.");
  process.exit(1);
}

const customToken = await auth.createCustomToken(user.uid);
const exchange = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
const exchanged = await exchange.json();
const idToken = exchanged.idToken;
if (!idToken) {
  console.error("Token exchange failed:", JSON.stringify(exchanged));
  process.exit(1);
}

// --- Check remaining quota first, so a rejection is not a surprise ----------
const quotaResponse = await fetch(`${BASE}/api/generate`, {
  headers: { Authorization: `Bearer ${idToken}` },
});
const quota = await quotaResponse.json();
console.log("Quota before:", JSON.stringify(quota.remaining ?? quota));

// --- Request the smallest meaningful generation -----------------------------
const sourceText = `
Fotosinteza është procesi me të cilin bimët, algat dhe disa baktere konvertojnë
energjinë e dritës në energji kimike. Gjatë fotosintezës, bima thith dioksidin e
karbonit dhe ujin, dhe me ndihmën e dritës së diellit prodhon glukozë dhe oksigjen.
Klorofili është pigmenti i gjelbër që thith dritën dhe gjendet në kloroplaste.
Fotosinteza ndodh në dy faza: reaksionet e varura nga drita dhe cikli i Calvin.
Reaksionet e varura nga drita ndodhin në membranat e tilakoideve dhe prodhojnë ATP
dhe NADPH. Cikli i Calvin ndodh në stromë dhe përdor ATP e NADPH për të kthyer
dioksidin e karbonit në glukozë.
`.trim();

const body = {
  title: "Fotosinteza",
  text: sourceText,
  kinds: ["summary", "flashcards", "quiz"],
  flashcards: 2,
  quizQuestions: 2,
  uploads: 1,
  sourceFormat: "pdf",
  sourceUnits: 1,
};

console.log(`\nPOST ${BASE}/api/generate`);
console.log(`  text length: ${sourceText.length} chars`);

const response = await fetch(`${BASE}/api/generate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`,
  },
  body: JSON.stringify(body),
});

const raw = await response.text();
console.log(`  HTTP ${response.status}`);

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.log("  non-JSON body:", raw.slice(0, 400));
  process.exit(1);
}

if (response.status !== 201) {
  console.log("  error:", JSON.stringify(parsed, null, 2).slice(0, 800));
  process.exit(1);
}

const set = parsed.studySet;
console.log("\n=== RESULT ===");
console.log(`  title:             ${set.title}`);
console.log(`  hasSummary:        ${set.hasSummary}`);
console.log(`  summary length:    ${set.summary ? set.summary.length : 0}`);
console.log(`  flashcards:        ${set.flashcards?.length ?? 0}`);
console.log(`  quizQuestions:     ${set.quizQuestions?.length ?? 0}`);
console.log(`  model:             ${parsed.model}`);

if (set.flashcards?.length) {
  console.log(`  first flashcard:   ${JSON.stringify(set.flashcards[0])}`);
}
if (set.quizQuestions?.length) {
  console.log(`  first question:    ${JSON.stringify(set.quizQuestions[0])}`);
}

const produced =
  (set.hasSummary ? 1 : 0) +
  (set.flashcards?.length ?? 0) +
  (set.quizQuestions?.length ?? 0);

console.log("");
if (produced === 0) {
  console.log("EMPTY GENERATION: the model returned no usable content.");
  process.exit(1);
}
console.log("Generation produced content.");
