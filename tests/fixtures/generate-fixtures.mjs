/**
 * Generates real .docx and .pptx fixtures using JSZip, plus a minimal PDF.
 *
 * These are genuine OOXML/ZIP packages, so the extractors are exercised against
 * realistic structures rather than mocks.
 *
 * Run:  node tests/fixtures/generate-fixtures.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import JSZip from "jszip";

const OUT = "tests/fixtures/files";
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------
async function makeDocx() {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  const paragraphs = [
    "Biologjia e qelizës",
    "Qeliza është njësia bazë strukturore dhe funksionale e të gjitha organizmave të gjallë.",
    "Membrana qelizore kontrollon çfarë hyn dhe çfarë del nga qeliza.",
    "Bërthama përmban materialin gjenetik dhe drejton aktivitetet e qelizës.",
    "Mitokondria prodhon energji përmes frymëmarrjes qelizore.",
  ];

  const body = paragraphs
    .map((text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`)
    .join("");

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`,
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(`${OUT}/sample.docx`, buffer);
  return buffer.length;
}

// ---------------------------------------------------------------------------
// PPTX — deliberately writes slide XML in a non-sequential file order and
// declares the real order in presentation.xml, so the extractor's order
// resolution is genuinely exercised.
// ---------------------------------------------------------------------------
async function makePptx() {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  const slide = (title, bullets) => {
    const body = [title, ...bullets]
      .map((t) => `<a:p><a:r><a:t>${escapeXml(t)}</a:t></a:r></a:p>`)
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
  };

  // Real order (declared in presentation.xml): slide2, slide1, slide3
  zip.file("ppt/slides/slide1.xml", slide("Historiku i kompjuterave", [
    "Gjenerata e parë përdorte tuba vakumi.",
    "Transistorët zëvendësuan tubat në vitet 1950.",
  ]));
  zip.file("ppt/slides/slide2.xml", slide("Hyrje në algoritme", [
    "Algoritmi është një sekuencë e kufizuar hapash.",
    "Kompleksiteti matet me notacionin O të madh.",
  ]));
  zip.file("ppt/slides/slide3.xml", slide("Strukturat e të dhënave", [
    "Vargu, lista e lidhur dhe pema janë struktura bazë.",
    "Radha dhe pirgu ndjekin parimin FIFO dhe LIFO.",
  ]));

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId11"/>
    <p:sldId id="257" r:id="rId10"/>
    <p:sldId id="258" r:id="rId12"/>
  </p:sldIdLst>
</p:presentation>`,
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(`${OUT}/sample.pptx`, buffer);
  return buffer.length;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// PDF — a hand-written single-page PDF with real text operators.
// ---------------------------------------------------------------------------
function makePdf() {
  const lines = [
    "Kapitulli 1: Hyrje ne fizike",
    "Fizika studion ligjet themelore te natyres.",
    "Shpejtesia eshte ndryshimi i pozicionit ne kohe.",
    "Nxitimi eshte ndryshimi i shpejtesise ne kohe.",
  ];

  let content = "BT\n/F1 12 Tf\n50 750 Td\n14 TL\n";
  for (const line of lines) {
    content += `(${line.replace(/[()\\]/g, (c) => `\\${c}`)}) Tj\nT*\n`;
  }
  content += "ET";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  writeFileSync(`${OUT}/sample.pdf`, Buffer.from(pdf, "latin1"));
  return pdf.length;
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
async function makeEmptyDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:body></w:document>`,
  );
  writeFileSync(`${OUT}/empty.docx`, await zip.generateAsync({ type: "nodebuffer" }));
}

function makeScannedLikePdf() {
  // Valid PDF structure with NO text operators — simulates a scanned document.
  const content = "q 612 0 0 792 0 0 cm /Im0 Do Q";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\\x00\nendstream",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  writeFileSync(`${OUT}/scanned.pdf`, Buffer.from(pdf, "latin1"));
}

const docxSize = await makeDocx();
const pptxSize = await makePptx();
const pdfSize = makePdf();
await makeEmptyDocx();
makeScannedLikePdf();

console.log(`sample.docx  ${docxSize} bytes`);
console.log(`sample.pptx  ${pptxSize} bytes`);
console.log(`sample.pdf   ${pdfSize} bytes`);
console.log(`empty.docx   (no text)`);
console.log(`scanned.pdf  (image only, no text layer)`);
