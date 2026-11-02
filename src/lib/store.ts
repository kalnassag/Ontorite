/**
 * Zustand store for Ontorite — single source of truth for all domain data.
 *
 * Composed from slices in ./store/. Every edit goes through `commit` (see
 * ./store/internals.ts), which records a per-ontology undo snapshot and
 * schedules persistence to IndexedDB and, when linked, the original file.
 */

import { create } from "zustand";
import type { EditorState } from "./store/types";
import { createInternals } from "./store/internals";
import { lifecycleSlice } from "./store/lifecycle-slice";
import { entitySlice } from "./store/entity-slice";
import { clipboardSlice } from "./store/clipboard-slice";
import { fileSlice } from "./store/file-slice";

export type { EditorState } from "./store/types";
export { flushPendingSaves } from "./store/internals";
export { sweepLegacyTriples, hoistClassExpressions, migrateOntology } from "./store/migrations";

export const useStore = create<EditorState>()((set, get) => {
  const internals = createInternals(set, get);
  return {
    ...lifecycleSlice(set, get, internals),
    ...entitySlice(set, get, internals),
    ...clipboardSlice(set, get, internals),
    ...fileSlice(set, get, internals),
  };
});

// ── Selectors ────────────────────────────────────────────────────────────

export const selectActiveOntology = (s: EditorState) =>
  s.ontologies.find((o) => o.id === s.activeOntologyId);

export const selectCanUndo = (s: EditorState) =>
  !!s.activeOntologyId && (s.history[s.activeOntologyId]?.past.length ?? 0) > 0;

export const selectCanRedo = (s: EditorState) =>
  !!s.activeOntologyId && (s.history[s.activeOntologyId]?.future.length ?? 0) > 0;
