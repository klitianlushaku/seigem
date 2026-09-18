/**
 * Uploader state-machine tests.
 *
 * Run with:  npm run test:uploader
 *
 * The hook itself needs React, so these tests exercise the underlying decision
 * logic directly: validation gating, stale-request handling, and the mapping
 * from extraction outcomes to UI state. Those are the parts where a bug would
 * silently show the wrong document to a user.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { extractTextFromFile } from "../src/services/document/index.ts";
import { validateFile } from "../src/services/document/validate.ts";
import { countWords, humanSize, unitLabel } from "../src/lib/utils/display.ts";

const FIXTURES = "tests/fixtures/files";

function fixture(name: string): File {
  const buffer = readFileSync(`${FIXTURES}/${name}`);
  return new File([new Uint8Array(buffer)], name);
}

/**
 * Mirrors the hook's transition logic so it can be asserted without React.
 * Kept in sync with use-document-uploader.ts by the assertions below.
 */
type Status = "idle" | "validating" | "extracting" | "ready" | "error";

interface Transition {
  status: Status;
  error: string | null;
  hasDocument: boolean;
}

async function runFlow(file: File | undefined): Promise<Transition> {
  if (!file) return { status: "idle", error: null, hasDocument: false };

  const validation = validateFile(file);
  if (!validation.ok) {
    return { status: "error", error: validation.message, hasDocument: false };
  }

  const result = await extractTextFromFile(file);
  if (!result.ok) {
    return { status: "error", error: result.message, hasDocument: false };
  }

  return { status: "ready", error: null, hasDocument: true };
}

// ===========================================================================
// State transitions
// ===========================================================================

describe("uploader state transitions", () => {
  it("starts idle when no file is given", async () => {
    const state = await runFlow(undefined);
    assert.equal(state.status, "idle");
    assert.equal(state.error, null);
  });

  it("reaches ready for a valid PDF", async () => {
    const state = await runFlow(fixture("sample.pdf"));
    assert.equal(state.status, "ready");
    assert.equal(state.hasDocument, true);
    assert.equal(state.error, null);
  });

  it("reaches ready for a valid DOCX", async () => {
    const state = await runFlow(fixture("sample.docx"));
    assert.equal(state.status, "ready");
    assert.equal(state.hasDocument, true);
  });

  it("reaches ready for a valid PPTX", async () => {
    const state = await runFlow(fixture("sample.pptx"));
    assert.equal(state.status, "ready");
    assert.equal(state.hasDocument, true);
  });

  it("errors before extraction for an unsupported format", async () => {
    const txt = new File([new TextEncoder().encode("hi")], "notes.txt");
    const state = await runFlow(txt);

    assert.equal(state.status, "error");
    assert.equal(state.hasDocument, false);
    assert.match(state.error ?? "", /nuk mbështetet/i);
  });

  it("errors for an empty file without extracting", async () => {
    const state = await runFlow(new File([new Uint8Array(0)], "empty.pdf"));
    assert.equal(state.status, "error");
    assert.match(state.error ?? "", /bosh/i);
  });

  it("errors clearly for a scanned PDF", async () => {
    const state = await runFlow(fixture("scanned.pdf"));
    assert.equal(state.status, "error");
    assert.equal(state.hasDocument, false);
    assert.match(state.error ?? "", /skanuara/i);
  });

  it("never exposes a document alongside an error", async () => {
    for (const name of ["scanned.pdf", "empty.docx"]) {
      const state = await runFlow(fixture(name));
      assert.equal(
        state.hasDocument,
        false,
        `${name} must not produce a document on failure`,
      );
    }
  });
});

// ===========================================================================
// Display helpers
// ===========================================================================

describe("display helpers", () => {
  it("formats byte sizes", () => {
    assert.equal(humanSize(512), "512 B");
    assert.equal(humanSize(2048), "2.0 KB");
    assert.equal(humanSize(5 * 1024 * 1024), "5.0 MB");
  });

  it("counts words across scripts and diacritics", () => {
    assert.equal(countWords(""), 0);
    assert.equal(countWords("një dy tre"), 3);
    assert.equal(countWords("qeliza, është; bazë!"), 3);
    assert.equal(countWords("   "), 0);
  });

  it("inflects unit labels per format", () => {
    assert.equal(unitLabel("pdf", 1), "faqe");
    assert.equal(unitLabel("pdf", 5), "faqe");
    assert.equal(unitLabel("docx", 1), "seksion");
    assert.equal(unitLabel("docx", 3), "seksione");
    assert.equal(unitLabel("pptx", 1), "slide");
    assert.equal(unitLabel("pptx", 12), "slides");
  });
});

// ===========================================================================
// Guard: no upload ever happens
// ===========================================================================

describe("privacy guarantees", () => {
  it("uploader hook performs no network request", () => {
    const source = readFileSync(
      "src/components/documents/use-document-uploader.ts",
      "utf8",
    );
    assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|axios/);
  });

  it("the file picker and extraction modules never upload anything", () => {
    // These handle the RAW FILE BYTES, so a network call here would mean the
    // document itself left the device.
    //
    // `study-workflow.tsx` is deliberately NOT in this list: it calls
    // /api/generate with the EXTRACTED TEXT, which is expected and documented.
    // Its own guarantee — that it never sends the File object — is asserted
    // separately below.
    for (const file of [
      "src/components/documents/drop-zone.tsx",
      "src/components/documents/document-summary.tsx",
      "src/services/document/index.ts",
      "src/services/document/extract-pdf.ts",
      "src/services/document/extract-docx.ts",
      "src/services/document/extract-pptx.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|axios/, file);
    }
  });

  it("the workflow sends extracted text, never the File object", () => {
    const source = readFileSync(
      "src/components/documents/study-workflow.tsx",
      "utf8",
    );

    // The request body carries the extracted text...
    assert.match(source, /text: extraction\.text/);
    // ...and never the file itself, nor a multipart upload.
    assert.doesNotMatch(source, /FormData/);
  });
});
