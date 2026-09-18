"use client";

/**
 * Summary of the currently selected document.
 *
 * Shows the filename, format, size, and extraction statistics. Offers a reset
 * action that releases the file reference and extracted text.
 */
import { Button } from "@/components/ui/button";
import type { UploadedDocument } from "@/components/documents/use-document-uploader";
import { countWords, humanSize, unitLabel } from "@/lib/utils/display";

export function DocumentSummary({
  document,
  onReset,
  disabled,
}: {
  document: UploadedDocument;
  onReset: () => void;
  disabled?: boolean;
}) {
  const units = unitLabel(document.format, document.unitCount);

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={document.filename}>
            {document.filename}
          </p>
          <p className="mt-1 text-xs text-muted">
            {document.format.toUpperCase()} · {humanSize(document.sizeBytes)} ·{" "}
            {document.unitCount} {units}
          </p>
        </div>

        <Button variant="ghost" onClick={onReset} disabled={disabled}>
          Hiq skedarin
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Karaktere të nxjerrë</dt>
          <dd>{document.text.length.toLocaleString("sq-AL")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Fjalë (afërsisht)</dt>
          <dd>{countWords(document.text).toLocaleString("sq-AL")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Teksti u kufizua</dt>
          <dd>{document.truncated ? "Po" : "Jo"}</dd>
        </div>
      </dl>

      {document.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {document.warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-muted hover:text-content">
          Shfaq tekstin e nxjerrë
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 text-xs leading-5">
          {document.text}
        </pre>
        <p className="mt-2 text-xs text-muted">
          Teksti mbahet vetëm përkohësisht në kujtesën e browser-it dhe nuk
          ruhet.
        </p>
      </details>
    </div>
  );
}
