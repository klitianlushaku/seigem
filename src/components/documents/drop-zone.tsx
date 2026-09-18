"use client";

/**
 * Drag-and-drop file drop zone.
 *
 * Accepts one or more files: drag-and-drop, or the normal file-selection
 * button. Keyboard accessible, because the zone exposes a real button.
 *
 * Two layouts:
 *   - "stacked" (default): a tall centred target, used when the zone has the
 *     full width of a card to itself;
 *   - "inline": a short horizontal target that sits beside explanatory copy in
 *     the two-column upload card.
 *
 * Deliberately plain — no gradients, no decorative graphics.
 */
import { useCallback, useRef, useState, type DragEvent } from "react";

import { CloudUploadIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { ACCEPT_ATTRIBUTE } from "@/services/document/validate";

interface DropZoneProps {
  /** Receives every file the user dropped or selected. */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Accepted formats, shown to the user. */
  formatsLabel: string;
  /** Optional file size limit label. */
  sizeLabel: string;
  /** Allow selecting more than one file at a time. Defaults to true. */
  multiple?: boolean;
  /** Which arrangement to render. Defaults to "stacked". */
  layout?: "stacked" | "inline";
}

/**
 * Returns true when a drag event carries files.
 * Without this check, dragging text over the zone would trigger the highlight.
 */
function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  if (!event.dataTransfer?.types) return false;
  return Array.from(event.dataTransfer.types).includes("Files");
}

/** The folder glyph used by both layouts' picker buttons. */
function FolderGlyph({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L11.4 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function DropZone({
  onFiles,
  disabled = false,
  formatsLabel,
  sizeLabel,
  multiple = true,
  layout = "stacked",
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for child elements too, so track depth instead of
  // a simple boolean to avoid the highlight flickering.
  const dragDepthRef = useRef(0);

  const openPicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !carriesFiles(event)) return;
      // Required, otherwise the browser opens the file instead of dropping it.
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      if (disabled) return;

      const dropped = Array.from(event.dataTransfer.files ?? []);
      if (dropped.length === 0) return;
      onFiles(multiple ? dropped : dropped.slice(0, 1));
    },
    [disabled, multiple, onFiles],
  );

  const pickerButtonClass = cn(
    "inline-flex items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-white transition-colors",
    disabled ? "cursor-not-allowed opacity-60" : "hover:bg-accent-soft",
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "dash-dropzone rounded-xl border border-dashed transition-colors",
        isDragging ? "border-accent" : "border-line-strong",
        disabled && "opacity-60",
        layout === "stacked" ? "px-6 py-9 text-center" : "px-4 py-4",
      )}
    >
      {layout === "stacked" ? (
        <>
          {/* Functional icon: an upload arrow. No decorative graphics. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="30"
            height="30"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto text-accent"
          >
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>

          <p className="mt-3 text-sm font-semibold">
            Tërhiq dhe lësho skedarët këtu
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Formate të pranuara: {formatsLabel}. {sizeLabel}
          </p>
          {multiple ? (
            <p className="mt-0.5 text-[11px] text-muted">
              Mund të ngarkosh disa skedarë njëherësh.
            </p>
          ) : null}

          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className={cn(pickerButtonClass, "mt-4 rounded-xl px-4 py-2.5 text-sm")}
          >
            <FolderGlyph size={16} />
            Zgjidh skedarë
          </button>
        </>
      ) : (
        <div className="flex items-center gap-4">
          <CloudUploadIcon size={34} className="shrink-0 text-accent" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-sm font-semibold">Zvarrit skedarët këtu ose</p>
              <button
                type="button"
                onClick={openPicker}
                disabled={disabled}
                className={cn(pickerButtonClass, "px-3.5 py-2 text-[13px]")}
              >
                <FolderGlyph size={15} />
                Zgjidh skedarë
              </button>
            </div>

            <p className="mt-3 text-[11px] text-muted">
              {formatsLabel} {sizeLabel}
            </p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          if (selected.length > 0) onFiles(selected);
          // Allow re-selecting the same file after an error.
          event.target.value = "";
        }}
      />
    </div>
  );
}
