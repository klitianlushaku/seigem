/**
 * Merges class names, dropping falsy values.
 * Deliberately tiny: Seigem avoids pulling in a large UI utility library.
 *
 * Usage: cn("rounded-md", isActive && "border-accent")
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
