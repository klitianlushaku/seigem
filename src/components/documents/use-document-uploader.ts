"use client";

/**
 * Upload + extraction state machine.
 *
 * Owns the whole client-side document lifecycle:
 *   idle -> validating -> extracting -> ready
 *                          \-> error
 *
 * Privacy: the `File` reference and the extracted text live only in this hook's
 * state. Nothing is uploaded. `reset()` drops both so the bytes become
 * unreachable as soon as the user is done with them.
 */
import { useCallback, useRef, useState } from "react";

import { extractTextFromFile } from "@/services/document";
import {
  validateFile,
  type DocumentFormat,
} from "@/services/document/validate";

/** Where the extraction pipeline currently is. */
export type UploaderStatus =
  | "idle"
  | "validating"
  | "extracting"
  | "ready"
  | "error";

/** Everything the UI needs about the current document. */
export interface UploadedDocument {
  /** Original filename, sanitized for display. */
  filename: string;
  /** Size in bytes. */
  sizeBytes: number;
  format: DocumentFormat;
  /** Normalized extracted plain text. Never persisted. */
  text: string;
  /** Pages (PDF), slides (PPTX), or 1 (DOCX). */
  unitCount: number;
  /** Non-fatal notes, already in Albanian. */
  warnings: string[];
  /** True when the text hit the extraction limit. */
  truncated: boolean;
}

export interface UseDocumentUploader {
  status: UploaderStatus;
  document: UploadedDocument | null;
  error: string | null;
  /** True while validating or extracting. */
  busy: boolean;
  /** True when a file is selected and text was extracted successfully. */
  hasDocument: boolean;
  selectFile: (file: File | undefined) => Promise<void>;
  reset: () => void;
}

/**
 * Albanian messages for the extraction stage. Anything not matched falls back
 * to a generic message so an unexpected parser error never surfaces raw text.
 */
const GENERIC_EXTRACTION_ERROR =
  "Ndodhi një gabim i papritur gjatë leximit të dokumentit.";

export function useDocumentUploader(): UseDocumentUploader {
  const [status, setStatus] = useState<UploaderStatus>("idle");
  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow extraction from an earlier file overwriting the
  // result of a file the user picked afterwards.
  const requestIdRef = useRef(0);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setStatus("idle");
    setDocument(null);
    setError(null);
  }, []);

  const selectFile = useCallback(async (file: File | undefined) => {
    if (!file) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setError(null);
    setDocument(null);
    setStatus("validating");

    const validation = validateFile(file);
    if (!validation.ok) {
      setStatus("error");
      setError(validation.message);
      return;
    }

    setStatus("extracting");

    try {
      const result = await extractTextFromFile(file);

      // A newer selection superseded this one; discard the stale result.
      if (requestIdRef.current !== requestId) return;

      if (!result.ok) {
        setStatus("error");
        setError(result.message);
        return;
      }

      setDocument({
        filename: file.name,
        sizeBytes: file.size,
        format: result.format,
        text: result.text,
        unitCount: result.unitCount,
        warnings: result.warnings,
        truncated: result.truncated,
      });
      setStatus("ready");
    } catch (unexpected) {
      if (requestIdRef.current !== requestId) return;
      console.error("[uploader] extraction threw:", unexpected);
      setStatus("error");
      setError(GENERIC_EXTRACTION_ERROR);
    }
  }, []);

  return {
    status,
    document,
    error,
    busy: status === "validating" || status === "extracting",
    hasDocument: status === "ready" && document !== null,
    selectFile,
    reset,
  };
}
