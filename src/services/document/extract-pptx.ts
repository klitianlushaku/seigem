/**
 * PPTX text extraction using deterministic ZIP + XML parsing.
 *
 * A .pptx file is an OOXML package: a ZIP archive containing one XML file per
 * slide. This module:
 *   1. opens the archive with JSZip
 *   2. resolves the true slide order from the presentation relationships
 *   3. parses `<a:t>` text nodes from each slide's XML
 *   4. joins the results into normalized plain text
 *
 * No AI model is involved at any point, and nothing leaves the browser.
 */
import { failure, type ExtractionResult } from "@/services/document/types";

/** Where slide XML lives inside the archive. */
const SLIDE_PATH_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/;

/** The presentation part, which lists slides in their logical order. */
const PRESENTATION_PATH = "ppt/presentation.xml";
const PRESENTATION_RELS_PATH = "ppt/_rels/presentation.xml.rels";

/** Extracts the value of every `<a:t>` element, in document order. */
function extractTextNodes(xml: string): string[] {
  const matches = xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g);
  const values: string[] = [];

  for (const match of matches) {
    const raw = match[1];
    if (raw === undefined) continue;
    const decoded = decodeXmlEntities(raw).trim();
    if (decoded) values.push(decoded);
  }

  return values;
}

/** Decodes the XML entities that appear in OOXML text nodes. */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last, so "&amp;lt;" does not become "<".
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

/**
 * Determines slide order.
 *
 * `ppt/slides/slide7.xml` is not necessarily the seventh slide. The real order
 * is defined by the `<p:sldIdLst>` entries in `presentation.xml`, each of which
 * references a relationship id resolved through `presentation.xml.rels`.
 *
 * Falls back to numeric filename order when either part cannot be parsed, so a
 * slightly unusual but valid file still extracts in a sensible order.
 */
async function resolveSlideOrder(
  zip: import("jszip"),
): Promise<{ order: string[]; usedFallback: boolean }> {
  const numericOrder = Object.keys(zip.files)
    .filter((path) => SLIDE_PATH_PATTERN.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const presentationFile = zip.file(PRESENTATION_PATH);
  const relsFile = zip.file(PRESENTATION_RELS_PATH);

  if (!presentationFile || !relsFile) {
    return { order: numericOrder, usedFallback: true };
  }

  try {
    const [presentationXml, relsXml] = await Promise.all([
      presentationFile.async("string"),
      relsFile.async("string"),
    ]);

    // relationship id -> target path (e.g. "slides/slide3.xml")
    const targets = new Map<string, string>();
    for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
      const tag = match[0];
      const id = attributeOf(tag, "Id");
      const target = attributeOf(tag, "Target");
      if (id && target) {
        targets.set(id, target.replace(/^\.\//, "").replace(/^\//, ""));
      }
    }

    // <p:sldId id=".." r:id="rId2"/> in presentation order
    const orderedPaths: string[] = [];
    const slideIdList = presentationXml.match(
      /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/,
    );
    if (!slideIdList?.[1]) return { order: numericOrder, usedFallback: true };

    for (const match of slideIdList[1].matchAll(/<p:sldId\b[^>]*\/?>/g)) {
      const relId = attributeOf(match[0], "r:id");
      if (!relId) continue;
      const target = targets.get(relId);
      if (!target) continue;

      // Targets are relative to ppt/, so build "ppt/slides/slideN.xml".
      const fullPath = target.startsWith("ppt/") ? target : `ppt/${target}`;
      const normalized = fullPath.replace(/\\/g, "/");
      if (SLIDE_PATH_PATTERN.test(normalized)) orderedPaths.push(normalized);
    }

    if (orderedPaths.length === 0) {
      return { order: numericOrder, usedFallback: true };
    }

    // Append any slides present in the archive but missing from sldIdLst,
    // so no content is silently dropped.
    const known = new Set(orderedPaths);
    for (const path of numericOrder) {
      if (!known.has(path)) orderedPaths.push(path);
    }

    return { order: orderedPaths, usedFallback: false };
  } catch (error) {
    console.warn("[extract:pptx] slide order resolution failed:", error);
    return { order: numericOrder, usedFallback: true };
  }
}

/** Reads an attribute value from a raw XML tag string. */
function attributeOf(tag: string, name: string): string | null {
  // Attribute names may carry a namespace prefix (e.g. r:id).
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*"([^"]*)"`));
  return match?.[1] ?? null;
}

/** Extracts the numeric index from a slide path, for stable sorting. */
function slideNumber(path: string): number {
  const match = path.match(SLIDE_PATH_PATTERN);
  return match?.[1] ? Number(match[1]) : 0;
}

/**
 * Extracts text from a .pptx file.
 *
 * Slides are joined with a blank line in logical order. Speaker notes are not
 * included: they are not part of the presented material.
 */
export async function extractPptx(file: File): Promise<ExtractionResult> {
  let JSZip: typeof import("jszip");

  try {
    const jszipModule = await import("jszip");
    JSZip = jszipModule.default;
  } catch (error) {
    console.error("[extract:pptx] failed to load JSZip:", error);
    return failure("unknown", "Nuk u ngarkua lexuesi i prezantimeve.");
  }

  let zip: import("jszip");
  try {
    const buffer = await file.arrayBuffer();
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    console.error("[extract:pptx] failed to open archive:", error);
    return failure(
      "corrupt_file",
      "Skedari PowerPoint nuk mund të hapet. Ai mund të jetë i dëmtuar ose në një format të vjetër (.ppt).",
    );
  }

  const { order, usedFallback } = await resolveSlideOrder(zip);

  if (order.length === 0) {
    return failure(
      "corrupt_file",
      "Skedari PowerPoint nuk përmban slides të lexueshme.",
    );
  }

  const slideTexts: string[] = [];
  let emptySlides = 0;

  try {
    for (const path of order) {
      const slideFile = zip.file(path);
      if (!slideFile) {
        emptySlides += 1;
        continue;
      }

      const xml = await slideFile.async("string");
      const parts = extractTextNodes(xml);

      if (parts.length === 0) {
        emptySlides += 1;
        continue;
      }

      slideTexts.push(parts.join("\n"));
    }
  } catch (error) {
    console.error("[extract:pptx] failed while reading slides:", error);
    return failure(
      "corrupt_file",
      "Ndodhi një gabim gjatë leximit të slides.",
    );
  }

  if (slideTexts.length === 0) {
    return failure(
      "no_selectable_text",
      "Ky prezantim nuk përmban tekst të lexueshëm. Slides me vetëm imazhe nuk mund të lexohen.",
    );
  }

  const warnings: string[] = [];
  if (emptySlides > 0) {
    warnings.push(`${emptySlides} slides nuk përmbanin tekst.`);
  }
  if (usedFallback) {
    warnings.push(
      "Renditja e slides u përcaktua nga emrat e skedarëve, jo nga prezantimi.",
    );
  }

  return {
    ok: true,
    text: slideTexts.join("\n\n"),
    format: "pptx",
    unitCount: order.length,
    warnings,
    truncated: false,
  };
}
