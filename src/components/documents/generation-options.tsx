"use client";

/**
 * Generation option selector.
 *
 * Lets the user pick what to generate — Përmbledhje, Flashcards, Kuiz — with
 * multi-selection. At least one option must stay selected.
 *
 * Rendered as native checkboxes so keyboard and screen-reader behaviour is
 * correct without custom ARIA.
 */
import type { GenerationKind } from "@/types";

interface Option {
  kind: GenerationKind;
  label: string;
  description: string;
}

/** The three generation types, in display order. */
export const GENERATION_OPTIONS: readonly Option[] = [
  {
    kind: "summary",
    label: "Përmbledhje",
    description: "Konceptet më të rëndësishme të materialit.",
  },
  {
    kind: "flashcards",
    label: "Flashcards",
    description: "Karta me pyetje dhe përgjigje të shkurtra.",
  },
  {
    kind: "quiz",
    label: "Kuiz",
    description: "Pyetje me alternativa dhe përgjigjja e saktë.",
  },
];

export function GenerationOptions({
  selected,
  onChange,
  disabled,
}: {
  selected: GenerationKind[];
  onChange: (kinds: GenerationKind[]) => void;
  disabled?: boolean;
}) {
  function toggle(kind: GenerationKind) {
    if (disabled) return;

    if (selected.includes(kind)) {
      // Keep at least one option selected — generating nothing is not valid.
      if (selected.length === 1) return;
      onChange(selected.filter((entry) => entry !== kind));
    } else {
      // Preserve display order regardless of click order.
      const next = GENERATION_OPTIONS.map((option) => option.kind).filter(
        (entry) => entry === kind || selected.includes(entry),
      );
      onChange(next);
    }
  }

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="text-sm font-medium">
        Çfarë dëshiron të gjenerosh?
      </legend>
      <p className="text-xs text-muted">
        Mund të zgjedhësh më shumë se një opsion.
      </p>

      <div className="mt-3 space-y-2">
        {GENERATION_OPTIONS.map((option) => {
          const checked = selected.includes(option.kind);
          return (
            <label
              key={option.kind}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                checked ? "border-accent bg-surface-2" : "border-line"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(option.kind)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
