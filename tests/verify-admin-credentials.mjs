/**
 * Verifies the Firebase Admin credentials from .env.local against the real
 * project. Run with: node tests/verify-admin-credentials.mjs
 *
 * This is a deployment sanity check, not part of the test suite: it needs real
 * credentials and network access.
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** Minimal .env.local parser (no dependency on Next.js). */
function loadEnvLocal(path = ".env.local") {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key] = match;
    let value = match[2].trim();
    // Strip surrounding double quotes, keeping literal \n escapes for the key.
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal();

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = (env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

console.log("projectId:  ", projectId);
console.log("clientEmail:", clientEmail);
console.log("key begins: ", privateKey.slice(0, 32).replace(/\n/g, "\\n"));
console.log("key ends:   ", privateKey.slice(-32).replace(/\n/g, "\\n"));
console.log("key lines:  ", privateKey.split("\n").length);
console.log("");

let app;
try {
  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
} catch (error) {
  console.error("FAIL: could not build credential:", error.message);
  process.exit(1);
}

// The Admin SDK signs a token to prove the key is usable. Listing one user is
// the cheapest real call that exercises the credential.
try {
  const auth = getAuth(app);
  const result = await auth.listUsers(1);
  console.log("PASS: Admin Auth reachable. users sampled:", result.users.length);
} catch (error) {
  console.error("FAIL: Admin Auth call rejected:", error.message);
  process.exitCode = 1;
}

try {
  const db = getFirestore(app);
  await db.collection("users").limit(1).get();
  console.log("PASS: Firestore reachable.");
} catch (error) {
  console.error("FAIL: Firestore call rejected:", error.message);
  process.exitCode = 1;
}
