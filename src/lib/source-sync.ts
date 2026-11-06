/**
 * Keeps the Source editor and the class / individual views pointing at the
 * same entity when they're side by side (App's split view).
 *
 * - `revealInSource(uri)`: a card was clicked → the editor scrolls to that
 *   subject's block and highlights it briefly.
 * - `cursorUri`: the subject block the user's cursor is in → the card view
 *   scrolls to and highlights that entity.
 *
 * UI state only — never in undo history or persisted.
 */

import { create } from "zustand";

interface SourceSyncState {
  /** Bumped on every request, so revealing the same entity twice still scrolls */
  reveal: { uri: string; n: number } | null;
  cursorUri: string | null;
  revealInSource: (uri: string) => void;
  setCursorUri: (uri: string | null) => void;
}

export const useSourceSync = create<SourceSyncState>((set) => ({
  reveal: null,
  cursorUri: null,
  revealInSource: (uri) => set((s) => ({ reveal: { uri, n: (s.reveal?.n ?? 0) + 1 } })),
  setCursorUri: (uri) => set((s) => (s.cursorUri === uri ? s : { cursorUri: uri })),
}));

/** Smooth scrolling, unless the user asked for reduced motion (OS or Settings). */
export function scrollBehavior(): ScrollBehavior {
  const reduce = document.documentElement.classList.contains("reduce-motion")
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduce ? "auto" : "smooth";
}
