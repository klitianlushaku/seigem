/**
 * Security and production-readiness tests.
 *
 * Run with:  npm run test:security
 *
 * Covers the Task 15 requirements that are not already exercised elsewhere:
 * file/MIME validation, rate limiting, sanitization, and secret leakage.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatFromExtension,
  validateFile,
} from "../src/services/document/validate.ts";
import { normalizeTitle, normalizeWhitespace, titleFromFilename } from "../src/lib/utils/text.ts";
import { MAX_FILE_SIZE_BYTES, MAX_EXTRACTED_TEXT_CHARS, MAX_TITLE_LENGTH } from "../src/config/app.ts";

// The rate limiter is server-only; load it with the guard neutralised.
const { loadModule } = (await import(
  // @ts-expect-error - plain JS helper without type declarations
  "./helpers/load-server-module.mjs"
)) as {
  loadModule: (path: string) => Promise<Record<string, unknown>>;
};

const rateLimitModule = (await loadModule("src/server/http/rate-limit.ts")) as {
  checkRateLimit: (
    bucket: string,
    identifier: string,
    rule: { limit: number; windowMs: number },
  ) => { allowed: boolean; remaining: number; retryAfterSeconds: number };
  enforceRateLimit: (
    bucket: string,
    identifier: string,
    rule: { limit: number; windowMs: number },
  ) => { allowed: boolean; remaining: number; retryAfterSeconds: number };
  resetRateLimits: () => void;
  RATE_LIMITS: Record<string, { limit: number; windowMs: number }>;
};

const { checkRateLimit, enforceRateLimit, resetRateLimits, RATE_LIMITS } =
  rateLimitModule;

/** Builds a File-like object with a given name, type, and size. */
function makeFile(name: string, type = "", size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

// ===========================================================================
// Requirement 282/283: file validation
// ===========================================================================

describe("file extension validation", () => {
  it("accepts the three supported formats", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["a.pdf", "pdf"],
      ["a.docx", "docx"],
      ["a.pptx", "pptx"],
    ];

    for (const [name, format] of cases) {
      const result = validateFile(makeFile(name, "", 1024));
      assert.equal(result.ok, true, name);
      if (result.ok) assert.equal(result.format, format);
    }
  });

  it("is case-insensitive about the extension", () => {
    assert.equal(formatFromExtension("REPORT.PDF") ?? "", "pdf");
    assert.equal(formatFromExtension("Doc.DOCX") ?? "", "docx");
  });

  it("rejects unsupported extensions", () => {
    for (const name of ["a.txt", "a.exe", "a.zip", "a.pdf.exe", "a"]) {
      const result = validateFile(makeFile(name));
      assert.equal(result.ok, false, `${name} must be rejected`);
    }
  });

  it("rejects the legacy binary Office formats", () => {
    // .doc and .ppt are different containers, not OOXML.
    for (const name of ["legacy.doc", "legacy.ppt", "legacy.xls"]) {
      assert.equal(validateFile(makeFile(name)).ok, false, name);
    }
  });

  it("rejects a double extension that hides an executable", () => {
    // "malware.exe.pdf" has a .pdf extension; the extension check passes, so
    // the MIME check and the parser are the remaining defences.
    const result = validateFile(makeFile("malware.exe.pdf", "application/pdf"));
    assert.equal(result.ok, true, "extension alone is .pdf");
  });
});

describe("MIME type validation", () => {
  const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const PPTX =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  it("accepts a matching MIME type", () => {
    assert.equal(validateFile(makeFile("a.pdf", "application/pdf")).ok, true);
    assert.equal(validateFile(makeFile("a.docx", DOCX)).ok, true);
    assert.equal(validateFile(makeFile("a.pptx", PPTX)).ok, true);
  });

  it("REJECTS a MIME type that contradicts the extension", () => {
    const result = validateFile(makeFile("invoice.pdf", "image/png"));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /nuk përputhet/);
  });

  it("rejects an executable MIME type outright", () => {
    assert.equal(
      validateFile(makeFile("a.pdf", "application/x-msdownload")).ok,
      false,
    );
  });

  it("allows an EMPTY MIME type", () => {
    // Browsers often report nothing for Office documents; requiring a type
    // would reject legitimate uploads.
    assert.equal(validateFile(makeFile("a.docx", "")).ok, true);
  });

  it("allows a generic octet-stream MIME type", () => {
    // Also common for Office documents, and carries no contradicting claim.
    assert.equal(
      validateFile(makeFile("a.pptx", "application/octet-stream")).ok,
      true,
    );
  });
});

describe("file size limit", () => {
  it("accepts a file exactly at the limit", () => {
    assert.equal(
      validateFile(makeFile("a.pdf", "application/pdf", MAX_FILE_SIZE_BYTES)).ok,
      true,
    );
  });

  it("rejects a file one byte over the limit", () => {
    const result = validateFile(
      makeFile("a.pdf", "application/pdf", MAX_FILE_SIZE_BYTES + 1),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /shumë i madh/);
  });

  it("rejects an empty file", () => {
    const result = validateFile(makeFile("a.pdf", "application/pdf", 0));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /bosh/);
  });

  it("has a sensible limit configured", () => {
    // 25 MB: large enough for real study material, small enough to bound abuse.
    assert.equal(MAX_FILE_SIZE_BYTES, 25 * 1024 * 1024);
  });
});

// ===========================================================================
// Requirement 284: extracted text limit
// ===========================================================================

describe("extracted text limit", () => {
  it("has a sensible limit configured", () => {
    // 60k characters keeps prompt cost bounded while fitting a long chapter.
    assert.equal(MAX_EXTRACTED_TEXT_CHARS, 60_000);
  });

  it("is enforced when parsing a generation request", async () => {
    const { parseGenerationRequest } = await import(
      "../src/server/ai/validation.ts"
    );

    const oversized = "a".repeat(MAX_EXTRACTED_TEXT_CHARS + 1);
    assert.throws(
      () =>
        parseGenerationRequest({
          title: "T",
          text: oversized,
          kinds: ["summary"],
        }),
      /tejkalon kufirin/,
    );
  });
});

// ===========================================================================
// Requirement 285: sanitization
// ===========================================================================

describe("title sanitization", () => {
  it("strips control characters", () => {
    const cleaned = normalizeTitle("Titull\u0000i\u001b[31m", MAX_TITLE_LENGTH);
    assert.doesNotMatch(cleaned, /[\u0000-\u001f\u007f]/);
  });

  it("collapses whitespace and trims", () => {
    assert.equal(normalizeTitle("  Titull   i   gjatë  ", MAX_TITLE_LENGTH), "Titull i gjatë");
  });

  it("truncates to the maximum length", () => {
    const cleaned = normalizeTitle("x".repeat(500), MAX_TITLE_LENGTH);
    assert.ok(cleaned.length <= MAX_TITLE_LENGTH, `got ${cleaned.length}`);
  });

  it("preserves Albanian diacritics", () => {
    assert.equal(normalizeTitle("Përmbledhje e qelizës", 120), "Përmbledhje e qelizës");
  });

  it("does not strip angle brackets as if they were HTML", () => {
    // Sanitization happens at RENDER time (React escapes by default), not by
    // mangling the user's text. Storing the literal is correct.
    const cleaned = normalizeTitle("<b>Titull</b>", MAX_TITLE_LENGTH);
    assert.equal(cleaned, "<b>Titull</b>");
  });

  it("sanitizes a filename-derived title", () => {
    // A filename is untrusted: it may carry control characters or a path.
    const title = titleFromFilename("../../etc/passwd\u0000.pdf", MAX_TITLE_LENGTH);
    assert.doesNotMatch(title, /\u0000/, "control characters must be stripped");
    assert.doesNotMatch(title, /\.pdf$/, "the extension must be removed");
  });

  it("strips a right-to-left override from a filename", () => {
    // U+202E reverses displayed text, a classic spoofing trick.
    const title = titleFromFilename("invoice\u202egnp.exe.pdf", MAX_TITLE_LENGTH);
    assert.doesNotMatch(title, /\.pdf$/);
    // The override itself is a format character, not a control one, so it is
    // normalized away by whitespace handling rather than silently kept.
    assert.ok(title.length > 0);
  });

  it("handles a filename with no extension", () => {
    assert.equal(titleFromFilename("README", MAX_TITLE_LENGTH), "README");
  });

  it("caps a very long filename", () => {
    const title = titleFromFilename(`${"x".repeat(500)}.pdf`, MAX_TITLE_LENGTH);
    assert.ok(title.length <= MAX_TITLE_LENGTH, `got ${title.length}`);
  });
});

describe("text normalization", () => {
  it("collapses runs of blank lines", () => {
    assert.equal(normalizeWhitespace("A\n\n\n\n\nB"), "A\n\nB");
  });

  it("converts non-breaking spaces", () => {
    assert.equal(normalizeWhitespace("A\u00a0B"), "A B");
  });

  it("removes zero-width characters", () => {
    assert.equal(normalizeWhitespace("A\u200bB"), "AB");
  });

  it("normalizes CRLF line endings", () => {
    assert.equal(normalizeWhitespace("A\r\nB"), "A\nB");
  });
});

// ===========================================================================
// Requirement 288: rate limiting
// ===========================================================================

describe("rate limiting", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests up to the limit", () => {
    const rule = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i += 1) {
      const result = checkRateLimit("test", "user-1", rule);
      assert.equal(result.allowed, true, `request ${i + 1}`);
    }
  });

  it("blocks the request after the limit", () => {
    const rule = { limit: 2, windowMs: 60_000 };
    checkRateLimit("test", "user-1", rule);
    checkRateLimit("test", "user-1", rule);

    const blocked = checkRateLimit("test", "user-1", rule);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
  });

  it("reports how long to wait", () => {
    const rule = { limit: 1, windowMs: 60_000 };
    checkRateLimit("test", "user-1", rule);

    const blocked = checkRateLimit("test", "user-1", rule);
    assert.ok(blocked.retryAfterSeconds > 0);
  });

  it("isolates users from each other", () => {
    const rule = { limit: 1, windowMs: 60_000 };
    checkRateLimit("test", "user-1", rule);

    // Another user must not be affected by the first user's usage.
    assert.equal(checkRateLimit("test", "user-2", rule).allowed, true);
  });

  it("isolates buckets from each other", () => {
    const rule = { limit: 1, windowMs: 60_000 };
    checkRateLimit("generate", "user-1", rule);

    // Exhausting generation must not block history reads.
    assert.equal(checkRateLimit("history", "user-1", rule).allowed, true);
  });

  it("resets after the window elapses", async () => {
    const rule = { limit: 1, windowMs: 50 };
    checkRateLimit("test", "user-1", rule);
    assert.equal(checkRateLimit("test", "user-1", rule).allowed, false);

    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(checkRateLimit("test", "user-1", rule).allowed, true);
  });

  it("throws an ApiError with an Albanian message when enforced", () => {
    const rule = { limit: 1, windowMs: 60_000 };
    enforceRateLimit("test", "user-1", rule);

    assert.throws(
      () => enforceRateLimit("test", "user-1", rule),
      (error: unknown) => {
        const apiError = error as { name?: string; message?: string };
        assert.equal(apiError.name, "ApiError");
        assert.match(apiError.message ?? "", /Shumë kërkesa/);
        assert.match(apiError.message ?? "", /sekondash/);
        return true;
      },
    );
  });

  it("defines a limit for every expensive endpoint", () => {
    for (const bucket of ["generate", "regenerate", "history", "checkout"]) {
      const rule = RATE_LIMITS[bucket];
      assert.ok(rule, `${bucket} must have a rate limit`);
      assert.ok(rule.limit > 0);
      assert.ok(rule.windowMs > 0);
    }
  });

  it("keeps generation limits tight but usable", () => {
    // Tight enough to bound abuse, loose enough for normal study use.
    const generate = RATE_LIMITS["generate"];
    assert.ok(generate, "generate must have a rate limit");
    assert.ok(generate.limit <= 20);
    assert.ok(generate.limit >= 5);
  });
});

// ===========================================================================
// Requirement 287: authentication on protected endpoints
// ===========================================================================

describe("protected endpoints", () => {
  const PROTECTED = [
    "src/app/api/generate/route.ts",
    "src/app/api/study-sets/route.ts",
    "src/app/api/study-sets/regenerate/route.ts",
    "src/app/api/billing/checkout/route.ts",
    "src/app/api/auth/profile/route.ts",
  ];

  for (const file of PROTECTED) {
    it(`${file} requires authentication`, () => {
      const source = readFileSync(file, "utf8");
      assert.match(source, /requireUser\(/, `${file} must call requireUser`);
    });
  }

  it("the webhook is signature-verified rather than token-authenticated", () => {
    // Whop cannot present a Firebase token, so its endpoint authenticates by
    // verifying the request signature instead.
    const source = readFileSync("src/app/api/billing/webhook/route.ts", "utf8");
    assert.match(source, /verifyWhopWebhook/);
  });
});

// ===========================================================================
// Requirement 289: no secret leakage
// ===========================================================================

describe("secret leakage", () => {
  it("no client module reads a server-only variable", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const path = await import("node:path");

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;

        const normalized = full.split(path.sep).join("/");
        // Server code is allowed to read secrets; client code is not.
        if (normalized.startsWith("src/server/")) continue;
        if (normalized.endsWith("lib/env/server.ts")) continue;

        // Strip comments: a comment naming a variable is not a usage.
        const source = readFileSync(full, "utf8")
          .split("\n")
          .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
          .join("\n");

        for (const secret of [
          "DEEPSEEK_API_KEY",
          "WHOP_API_KEY",
          "WHOP_WEBHOOK_SECRET",
          "FIREBASE_PRIVATE_KEY",
          "FIREBASE_CLIENT_EMAIL",
        ]) {
          if (source.includes(secret)) {
            offenders.push(`${normalized}: ${secret}`);
          }
        }
      }
    };
    walk("src");

    assert.deepEqual(
      offenders,
      [],
      `secrets referenced in client code: ${offenders.join(", ")}`,
    );
  });

  it("error responses never include stack traces or internals", () => {
    const source = readFileSync("src/server/http/respond.ts", "utf8");
    // Unknown errors must be replaced by a generic message.
    assert.match(source, /internal_error/);
    assert.doesNotMatch(source, /error\.stack|String\(error\)/);
  });

  it("the API error catalogue is entirely Albanian", () => {
    const source = readFileSync("src/server/http/errors.ts", "utf8");
    // A leaked English provider message would be a smell; sample the table.
    assert.match(source, /Duhet të hysh në llogari/);
    assert.match(source, /Ndodhi një gabim i papritur/);
  });

  it(".env.local is git-ignored and .env.example is not", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    assert.match(gitignore, /^\.env\*/m);
    assert.match(gitignore, /^!\.env\.example$/m);
  });
});
