/**
 * DOCX text extraction using Mammoth.
 *
 * Mammoth converts the OOXML document into plain text. It runs entirely in the
 * browser: the file bytes are read locally and never uploaded.
 *
 * We ask Mammoth for raw text rather than HTML so no markup can reach the DOM.
 */
import { failure, type ExtractionResult } from "@/services/document/types";

/**
 * Loads Mammoth.
 *
 * Mammoth ships two builds with different input contracts:
 *   - browser build: accepts `{ arrayBuffer }`
 *   - Node build:    accepts `{ buffer }` (or `{ path }`)
 *
 * Seigem runs in the browser, but the test suite runs the same code under
 * Node, so both the module and the option key are selected at runtime. This
 * keeps one implementation exercised by both environments.
 */
async function loadMammoth(): Promise<{
  mammothModule: MammothModule;
  inputKey: "arrayBuffer" | "buffer";
}> {
  const isBrowser =
    typeof window !== "undefined" && typeof window.document !== "undefined";

  if (isBrowser) {
    // The browser build has no type declarations; it exposes the same API.
    const mammothModule = (await import(
      "mammoth/mammoth.browser.js"
    )) as unknown as MammothModule;
    return { mammothModule, inputKey: "arrayBuffer" };
  }

  const mammothModule = (await import("mammoth")) as unknown as MammothModule;
  return { mammothModule, inputKey: "buffer" };
}

/** Minimal structural type for the parts of Mammoth that Seigem uses. */
interface MammothModule {
  extractRawText: (input: MammothInput) => Promise<{
    value: string;
    messages: Array<{ type: string; message: string }>;
  }>;
}

type MammothInput = { arrayBuffer: ArrayBuffer } | { buffer: Buffer };

/**
 * Extracts text from a .docx file.
 *
 * Note on scope: only modern OOXML `.docx` is supported. The legacy binary
 * `.doc` format is a completely different container and is rejected earlier by
 * `validateFile`.
 */
export async function extractDocx(file: File): Promise<ExtractionResult> {
  let mammoth: MammothModule;
  let inputKey: "arrayBuffer" | "buffer";

  try {
    // Loaded lazily so the bundle is only fetched when a DOCX is selected.
    ({ mammothModule: mammoth, inputKey } = await loadMammoth());
  } catch (error) {
    console.error("[extract:docx] failed to load Mammoth:", error);
    return failure("unknown", "Nuk u ngarkua lexuesi i dokumenteve Word.");
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (error) {
    console.error("[extract:docx] failed to read file:", error);
    return failure("unknown", "Skedari nuk mund të lexohet.");
  }

  try {
    // Note: `extractRawText` accepts only the input — style-map options are
    // not part of its signature in this version.
    const input: MammothInput =
      inputKey === "arrayBuffer"
        ? { arrayBuffer }
        : { buffer: Buffer.from(arrayBuffer) };

    const result = await mammoth.extractRawText(input);

    const text = result.value ?? "";
    const warnings = (result.messages ?? [])
      .filter((message) => message.type === "warning")
      .slice(0, 5)
      .map((message) => message.message);

    if (!text.trim()) {
      return failure(
        "no_selectable_text",
        "Ky dokument Word nuk përmban tekst të lexueshëm. Nëse përmbajtja është vetëm imazhe, nuk mund të nxirret tekst.",
      );
    }

    return {
      ok: true,
      text,
      format: "docx",
      unitCount: 1,
      warnings,
      truncated: false,
    };
  } catch (error) {
    console.error("[extract:docx] Mammoth failed:", error);
    return failure(
      "corrupt_file",
      "Skedari Word nuk mund të hapet. Ai mund të jetë i dëmtuar ose në një format të vjetër (.doc).",
    );
  }
}
