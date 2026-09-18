/**
 * PDF text extraction using PDF.js.
 *
 * Extracts only *selectable* text. No OCR is performed: a scanned PDF has no
 * text layer, and the user is told so explicitly rather than being given an
 * empty or garbage result.
 *
 * The worker runs entirely in the browser so the file never leaves the device.
 */
import { failure, type ExtractionResult } from "@/services/document/types";

/**
 * Loads PDF.js.
 *
 * Seigem runs extraction in the browser, where the modern build plus a real
 * worker is the right choice. The test suite runs the same code under Node,
 * where PDF.js explicitly advises the `legacy` build instead. Selecting the
 * build at runtime keeps ONE implementation exercised by both.
 */
async function loadPdfjs() {
  const isBrowser =
    typeof window !== "undefined" && typeof window.document !== "undefined";

  const pdfjs = isBrowser
    ? await import("pdfjs-dist")
    : await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (isBrowser) {
    try {
      // The bundler rewrites this specifier to the emitted, same-origin asset.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
    } catch (error) {
      console.warn("[extract:pdf] worker unavailable, using fake worker:", error);
    }
  }

  return pdfjs;
}

/** A line is worth keeping if it has at least one alphanumeric character. */
function hasContent(line: string): boolean {
  return /[\p{L}\p{N}]/u.test(line);
}

/**
 * Extracts text from a PDF.
 *
 * Joins pages with a blank line so page boundaries remain visible in the
 * resulting plain text. Within a page, text items are grouped into lines using
 * their vertical position, which reconstructs reading order far more reliably
 * than concatenating raw items.
 */
export async function extractPdf(file: File): Promise<ExtractionResult> {
  let pdfjs: Awaited<ReturnType<typeof loadPdfjs>>;

  try {
    pdfjs = await loadPdfjs();
  } catch (error) {
    console.error("[extract:pdf] failed to load PDF.js:", error);
    return failure("unknown", "Nuk u ngarkua lexuesi i PDF-ve. Provo përsëri.");
  }

  const buffer = await file.arrayBuffer();

  // Keep a handle on the loading task: cleanup is on the TASK, not the
  // document proxy (`pdf.destroy` does not exist).
  let loadingTask: ReturnType<typeof pdfjs.getDocument>;
  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // Do not pre-fetch external resources referenced by the PDF.
      disableAutoFetch: true,
      // Text extraction does not need font rendering. Disabling it avoids a
      // warning about standardFontDataUrl and skips needless work.
      disableFontFace: true,
      useSystemFonts: false,
    });
    pdf = await loadingTask.promise;
  } catch (error) {
    const name = (error as { name?: string })?.name ?? "";
    if (name === "PasswordException") {
      return failure(
        "password_protected",
        "Ky PDF është i mbrojtur me fjalëkalim dhe nuk mund të lexohet.",
      );
    }
    console.error("[extract:pdf] failed to open document:", error);
    return failure(
      "corrupt_file",
      "Skedari PDF nuk mund të hapet. Ai mund të jetë i dëmtuar.",
    );
  }

  const pages: string[] = [];
  let pagesWithoutText = 0;
  let totalChars = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      const pageText = reconstructPageText(
        content.items as Array<{
          str?: string;
          transform?: number[];
          hasEOL?: boolean;
        }>,
      );

      if (pageText) {
        pages.push(pageText);
        totalChars += pageText.length;
      } else {
        pagesWithoutText += 1;
      }

      // Release page resources promptly rather than holding every page open.
      page.cleanup();
    }
  } catch (error) {
    console.error("[extract:pdf] failed while reading pages:", error);
    return failure(
      "corrupt_file",
      "Ndodhi një gabim gjatë leximit të faqeve të PDF-së.",
    );
  } finally {
    // Release the worker and cached page data. Cleanup lives on the loading
    // task (`pdf.destroy` does not exist on the document proxy).
    await loadingTask.destroy().catch(() => undefined);
  }

  if (totalChars === 0) {
    return failure(
      "no_selectable_text",
      "Ky PDF nuk përmban tekst të lexueshëm. PDF-të e skanuara (imazhe) nuk mbështeten aktualisht. Provo një version me tekst të zgjedhshëm.",
    );
  }

  const warnings: string[] = [];
  if (pagesWithoutText > 0) {
    warnings.push(
      `${pagesWithoutText} faqe nuk përmbanin tekst dhe u anashkaluan.`,
    );
  }

  return {
    ok: true,
    text: pages.join("\n\n"),
    format: "pdf",
    unitCount: pdf.numPages,
    warnings,
    truncated: false,
  };
}

/**
 * Rebuilds readable lines from PDF.js text items.
 *
 * PDF text items arrive in content-stream order, which does not always match
 * reading order. Grouping by vertical position (the `transform[5]` value) and
 * then sorting by horizontal position (transform[4]) reconstructs lines
 * correctly for the common single-column layout.
 */
function reconstructPageText(
  items: Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>,
): string {
  const lines: Array<{ y: number; parts: Array<{ x: number; text: string }> }> =
    [];

  for (const item of items) {
    const text = item.str ?? "";
    if (!text) continue;

    const transform = item.transform ?? [];
    const x = transform[4] ?? 0;
    const y = transform[5] ?? 0;

    // PDF.js emits a text item per fragment. Treat a large vertical gap, or an
    // explicit end-of-line marker, as starting a new line.
    const current = lines[lines.length - 1];
    const isNewLine =
      !current || Math.abs(current.y - y) > 2 || item.hasEOL === true;

    if (isNewLine) {
      lines.push({ y, parts: [{ x, text }] });
    } else {
      current.parts.push({ x, text });
    }
  }

  const rendered = lines.map((line) =>
    line.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  return rendered.filter(hasContent).join("\n");
}
