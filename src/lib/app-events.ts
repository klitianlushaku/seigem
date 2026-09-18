/**
 * Tiny application event bus.
 *
 * Used to keep independent parts of the shell in sync without threading state
 * through props: the sidebar's recent list refreshes when a material is
 * created, and the uploader resets when "Material i ri" is pressed.
 *
 * Deliberately minimal — a pair of DOM events rather than a state library.
 */

/** Fired when a study set is created, updated, or deleted. */
export const HISTORY_CHANGED = "seigem:history-changed";

/** Fired when the user asks to start a fresh upload. */
export const NEW_MATERIAL = "seigem:new-material";

/** Fired when a practice panel asks to open the full regeneration panel. */
export const OPEN_MORE_MATERIAL = "seigem:open-more-material";

/** Dispatches an application event. Safe during server rendering. */
export function emitAppEvent(name: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(name));
}

/** Opens the full "Gjenero materiale shtesë" workflow for one saved set. */
export function emitOpenMoreMaterial(studySetId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OPEN_MORE_MATERIAL, { detail: { studySetId } }),
  );
}
