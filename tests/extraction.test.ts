/**
 * Extraction tests.
 *
 * Run with:  npm run test:extract
 *
 * These exercise the REAL extractors against REAL files (a genuine PDF with
 * text operators, a real OOXML .docx, and a .pptx whose slide order differs
 * from its filename order). Nothing is mocked except the browser `File` type.
 */
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractPdf } from "../src/services/document/extract-pdf.ts";
import { extractDocx } from "../src/services/document/extract-docx.ts";
import { extractPptx } from "../src/services/document/extract-pptx.ts";
import { extractTextFromFile } from "../src/services/document/index.ts";
import {
  formatFromExtension,
  validateFile,
} from "../src/services/document/validate.ts";

const FIXTURES = "tests/fixtures/files";

/** Reads a fixture and wraps it in a File-like object. */
function fixture(name: string, type = ""): File {
  const buffer = readFileSync(`${FIXTURES}/${name}`);
  const blob = new Blob([new Uint8Array(buffer)], { type });
  // Node's File implementation is available in Node 20+.
  return new File([blob], name, { type });
}

// ===========================================================================
// Validation
// ===========================================================================

describe("file validation", () => {
  it("maps supported extensions to formats", () => {
    assert.equal(formatFromExtension("a.pdf"), "pdf");
    assert.equal(formatFromExtension("a.docx"), "docx");
    assert.equal(formatFromExtension("a.pptx"), "pptx");
    assert.equal(formatFromExtension("A.PDF"), "pdf");
    assert.equal(formatFromExtension("a.doc"), null, "legacy .doc is unsupported");
    assert.equal(formatFromExtension("a.txt"), null);
    assert.equal(formatFromExtension("noextension"), null);
  });

  it("rejects an unsupported extension with an Albanian message", () => {
    const result = validateFile(fixture("sample.pdf")); // will rename below
    // Rebuild with a .txt name.
    const buffer = readFileSync(`${FIXTURES}/sample.pdf`);
    const txt = new File([new Uint8Array(buffer)], "notes.txt");
    const outcome = validateFile(txt);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.message, /nuk mbështetet/i);
      assert.match(outcome.message, /PDF, Word ose PowerPoint/);
    }
    assert.equal(result.ok, true);
  });

  it("rejects an empty file", () => {
    const empty = new File([new Uint8Array(0)], "empty.pdf");
    const outcome = validateFile(empty);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.message, /bosh/i);
  });
});

// ===========================================================================
// PDF
// ===========================================================================

describe("PDF extraction", () => {
  it("extracts selectable text", async () => {
    const result = await extractPdf(fixture("sample.pdf", "application/pdf"));

    assert.equal(result.ok, true, "extraction should succeed");
    if (!result.ok) return;

    assert.equal(result.format, "pdf");
    assert.equal(result.unitCount, 1);
    assert.match(result.text, /Fizika studion ligjet themelore/);
    assert.match(result.text, /Shpejtesia eshte ndryshimi i pozicionit/);
  });

  it("preserves line breaks between text lines", async () => {
    const result = await extractPdf(fixture("sample.pdf", "application/pdf"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const lines = result.text.split("\n").filter(Boolean);
    assert.ok(lines.length >= 4, `expected >= 4 lines, got ${lines.length}`);
    assert.match(lines[0] ?? "", /Kapitulli 1/);
  });

  it("reports a clear error for a PDF with no text layer", async () => {
    const result = await extractPdf(fixture("scanned.pdf", "application/pdf"));

    assert.equal(result.ok, false, "image-only PDF must not produce text");
    if (result.ok) return;

    assert.equal(result.reason, "no_selectable_text");
    // The message must explicitly explain that scanned PDFs are unsupported.
    assert.match(result.message, /skanuara/i);
    assert.match(result.message, /nuk mbështeten/i);
  });

  it("reports a clear error for a corrupt PDF", async () => {
    const corrupt = new File([new TextEncoder().encode("not a pdf at all")], "bad.pdf");
    const result = await extractPdf(corrupt);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "corrupt_file");
  });
});

// ===========================================================================
// DOCX
// ===========================================================================

describe("DOCX extraction", () => {
  it("extracts paragraph text", async () => {
    const result = await extractDocx(
      fixture("sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    );

    assert.equal(result.ok, true, "extraction should succeed");
    if (!result.ok) return;

    assert.equal(result.format, "docx");
    assert.match(result.text, /Biologjia e qelizës/);
    assert.match(result.text, /Mitokondria prodhon energji/);
  });

  it("preserves Albanian diacritics", async () => {
    const result = await extractDocx(fixture("sample.docx"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    // ë and ç must survive extraction, not be mangled.
    assert.match(result.text, /qelizës/);
    assert.match(result.text, /çfarë/);
  });

  it("reports a clear error for a document with no text", async () => {
    const result = await extractDocx(fixture("empty.docx"));

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_selectable_text");
  });

  it("reports a clear error for a corrupt DOCX", async () => {
    const corrupt = new File([new TextEncoder().encode("nonsense")], "bad.docx");
    const result = await extractDocx(corrupt);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "corrupt_file");
  });
});

// ===========================================================================
// PPTX
// ===========================================================================

describe("PPTX extraction", () => {
  it("extracts slide text", async () => {
    const result = await extractPptx(
      fixture("sample.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    );

    assert.equal(result.ok, true, "extraction should succeed");
    if (!result.ok) return;

    assert.equal(result.format, "pptx");
    assert.equal(result.unitCount, 3);
    assert.match(result.text, /Hyrje në algoritme/);
    assert.match(result.text, /Strukturat e të dhënave/);
    assert.match(result.text, /Historiku i kompjuterave/);
  });

  it("uses the presentation's logical slide order, not filename order", async () => {
    // The fixture declares order slide2, slide1, slide3 while the filenames
    // sort as slide1, slide2, slide3. Extraction must follow the presentation.
    const result = await extractPptx(fixture("sample.pptx"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const algorithmsAt = result.text.indexOf("Hyrje në algoritme");
    const historyAt = result.text.indexOf("Historiku i kompjuterave");
    const dataAt = result.text.indexOf("Strukturat e të dhënave");

    assert.ok(algorithmsAt >= 0 && historyAt >= 0 && dataAt >= 0, "all slides present");
    assert.ok(
      algorithmsAt < historyAt,
      "slide 2 (algorithms) must appear before slide 1 (history)",
    );
    assert.ok(
      historyAt < dataAt,
      "slide 1 (history) must appear before slide 3 (data structures)",
    );
  });

  it("decodes XML entities in slide text", async () => {
    const result = await extractPptx(fixture("sample.pptx"));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // No raw entity sequences should survive into the plain text.
    assert.doesNotMatch(result.text, /&amp;|&lt;|&gt;|&quot;/);
  });

  it("reports a clear error for a corrupt PPTX", async () => {
    const corrupt = new File([new TextEncoder().encode("nonsense")], "bad.pptx");
    const result = await extractPptx(corrupt);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "corrupt_file");
  });
});

// ===========================================================================
// Dispatcher + normalization
// ===========================================================================

describe("dispatcher and normalization", () => {
  it("dispatches PDF, DOCX and PPTX by extension", async () => {
    for (const [name, expected] of [
      ["sample.pdf", "pdf"],
      ["sample.docx", "docx"],
      ["sample.pptx", "pptx"],
    ] as const) {
      const result = await extractTextFromFile(fixture(name));
      assert.equal(result.ok, true, `${name} should extract`);
      if (result.ok) assert.equal(result.format, expected);
    }
  });

  it("normalizes excess whitespace and blank lines", async () => {
    const result = await extractTextFromFile(fixture("sample.docx"));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.doesNotMatch(result.text, /[ \t]{2,}/, "no repeated spaces");
    assert.doesNotMatch(result.text, /\n{3,}/, "no triple newlines");
    assert.doesNotMatch(result.text, /^\s|\s$/, "no leading/trailing space");
  });

  it("rejects an unsupported format", async () => {
    const txt = new File([new TextEncoder().encode("hello")], "notes.txt");
    const result = await extractTextFromFile(txt);

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "unsupported_format");
  });
});
