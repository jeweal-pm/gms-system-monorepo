/**
 * Focus ring only for keyboard navigation (owner 2026-10-29: no green frame when pressing Shift).
 *
 * Browsers turn `:focus-visible` on for any key press after a click, Shift included, so a clicked button
 * suddenly showed its focus ring. We remember how the user last moved focus and set
 * `<html data-focus-source="pointer|keyboard">`; globals.css hides `:focus-visible` rings while it is
 * "pointer". Only navigation keys switch back to "keyboard", so Tab still shows where focus is
 * (WCAG 2.4.7). Typing, Shift and other modifiers keep the current source.
 */
export type FocusSource = "pointer" | "keyboard";

const NAVIGATION_KEYS = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

export const FOCUS_SOURCE_ATTRIBUTE = "data-focus-source";

/** The source a key press switches to, or null when it keeps the current one. */
export function focusSourceForKey(key: string): FocusSource | null {
  return NAVIGATION_KEYS.has(key) ? "keyboard" : null;
}

/** Tracks the focus source on the document's <html> element; returns the cleanup. */
export function installFocusModality(doc: Document): () => void {
  const root = doc.documentElement;
  const set = (source: FocusSource) => {
    if (root.getAttribute(FOCUS_SOURCE_ATTRIBUTE) !== source) root.setAttribute(FOCUS_SOURCE_ATTRIBUTE, source);
  };
  const onPointer = () => set("pointer");
  const onKey = (event: KeyboardEvent) => {
    const source = focusSourceForKey(event.key);
    if (source) set(source);
  };
  // Capture phase: runs before components that stop propagation.
  const capture = { capture: true };
  doc.addEventListener("pointerdown", onPointer, capture);
  doc.addEventListener("keydown", onKey, capture);
  return () => {
    doc.removeEventListener("pointerdown", onPointer, capture);
    doc.removeEventListener("keydown", onKey, capture);
  };
}
