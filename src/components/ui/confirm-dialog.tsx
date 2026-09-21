"use client";

/**
 * Confirmation dialog.
 *
 * Replaces `window.confirm`, which is a browser chrome dialog: it carries the
 * origin ("seigem.vercel.app says"), cannot be styled, is not translated, blocks
 * the whole tab, and looks borrowed rather than designed. For an action as
 * consequential as cancelling a subscription, that is the wrong impression to
 * give.
 *
 * Accessibility: `role="dialog"` with `aria-modal`, Escape closes it, the
 * confirm button takes focus when it opens, and focus returns to the trigger on
 * close. The backdrop is clickable to dismiss.
 *
 * Rendered inline rather than through a portal. The app has no transform or
 * overflow ancestor around this usage, so a fixed overlay at a high z-index is
 * sufficient, and it avoids a portal's server-rendering complications.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Anulo",
  /** Visual weight of the confirm action. */
  tone = "primary",
  /** True while the confirmed action is running. */
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** Explanation shown under the title. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  /** The element that had focus before opening, restored on close. */
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Escape closes, and the rest of the page is frozen while the dialog is up.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onCancel]);

  const stop = useCallback((event: React.MouseEvent) => event.stopPropagation(), []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/70" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={stop}
        className="dash-panel relative w-full max-w-md rounded-2xl p-5 shadow-2xl"
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold leading-6"
        >
          {title}
        </h2>

        <div className="mt-2 text-sm leading-6 text-muted">{children}</div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              tone === "danger" &&
                "bg-danger text-white shadow-none hover:bg-danger/90",
            )}
          >
            {busy ? "Duke u anuluar…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
