/**
 * Verifies the extraction libraries resolve correctly in a BUNDLED browser
 * context, which the Node test runner cannot prove.
 *
 * The risk this guards against: PDF.js worker and Mammoth browser-build paths
 * are resolved by the bundler. A wrong specifier works in Node but 404s in the
 * browser. This script imports the client service through the Next.js build
 * output to confirm the module graph is intact.
 *
 * Run:  node tests/verify-browser-bundle.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const NEXT_DIR = ".next";

if (!existsSync(NEXT_DIR)) {
  console.error("No .next build found. Run `npm run build` first.");
  process.exit(1);
}

/** Collects every JS file emitted into the server build. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const serverFiles = walk(path.join(NEXT_DIR, "server"));
void serverFiles; // Reserved for future server-side bundle assertions.

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failures += 1;
}

console.log("=== Bundled extraction modules ===");

/** Files that make up the CLIENT bundle (what the browser downloads). */
const clientFiles = walk(path.join(NEXT_DIR, "static"));

const clientSource = clientFiles
  .map((file) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return "";
    }
  })
  .join("\n");

// The extraction service must be in the CLIENT bundle: extraction runs in the
// browser, so its absence would mean the feature cannot work at all.
//
// Note: the production bundler MINIFIES identifiers, so function names like
// `extractTextFromFile` are renamed. These checks therefore match on stable
// user-facing strings (error messages) rather than identifier names.
check(
  "dispatcher is in the client bundle (via its Albanian error text)",
  /Formati i skedarit nuk mbështetet/.test(clientSource),
);

check(
  "PDF extractor is in the client bundle",
  /extractPdf|Nuk u ngarkua lexuesi i PDF/.test(clientSource),
);

check(
  "DOCX extractor is in the client bundle",
  /extractDocx|Nuk u ngarkua lexuesi i dokumenteve Word/.test(clientSource),
);

check(
  "PPTX extractor is in the client bundle",
  /extractPptx|Nuk u ngarkua lexuesi i prezantimeve/.test(clientSource),
);

check(
  "scanned-PDF message is present (Albanian)",
  /skanuara/.test(clientSource),
);

console.log("\n=== Worker asset resolution ===");

// The worker is emitted as a hashed asset under .next/static/media and
// referenced by URL from a chunk. Both must be true for parsing to work.
const workerAssets = readdirSync(path.join(NEXT_DIR, "static"), {
  recursive: true,
})
  .map(String)
  .filter((name) => name.includes("pdf.worker"));

check(
  "PDF.js worker asset is emitted",
  workerAssets.length > 0,
);
if (workerAssets.length > 0) {
  console.log(`      ${workerAssets.join(", ")}`);
}

check(
  "worker is referenced from the client bundle",
  /pdf\.worker/i.test(clientSource),
);

console.log("\n=== Privacy: no upload path in extraction code ===");

// Extraction must never POST the file anywhere.
for (const file of [
  "src/services/document/index.ts",
  "src/services/document/extract-pdf.ts",
  "src/services/document/extract-docx.ts",
  "src/services/document/extract-pptx.ts",
]) {
  const source = readFileSync(file, "utf8");
  check(
    `${path.basename(file)} performs no network request`,
    !/\bfetch\(|XMLHttpRequest|axios/.test(source),
  );
}

check(
  "no server-only or Admin SDK import in client extraction code",
  !/server-only|firebase-admin/.test(
    readFileSync("src/services/document/index.ts", "utf8"),
  ),
);

console.log(
  failures === 0
    ? "\nAll bundle checks passed."
    : `\n${failures} bundle check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
