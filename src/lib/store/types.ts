import type { StoreApi } from "zustand";
import type {
  Ontology, OntologyClass, OntologyMetadata, OntologyProperty, Individual,
  IndividualPropertyValue, ClipboardItem, UnmappedTriple, ParseResult, PropertyType,
} from "../../types";
import type { SerializationFormat } from "../formats";

export interface OntologyHistory {
  past: Ontology[];
  future: Ontology[];
}

export interface EditorState {
  // ── Data ───────────────────────────────────────────────────────────
  ontologies: Ontology[];
  activeOntologyId: string | null;
  initialized: boolean;

  /** Timestamp of last successful file save (for UI indicator) */
  lastFileSaveTime: number | null;
  /** Whether a file save is in progress */
  fileSaveInProgress: boolean;

  // ── Undo / Redo (per ontology) ─────────────────────────────────────
  history: Record<string, OntologyHistory>;
  undo: () => void;
  redo: () => void;

  // ── Import feedback ────────────────────────────────────────────────
  /** Warnings from the most recent import */
  importWarnings: string[];
  clearImportWarnings: () => void;

  // ── Derived ────────────────────────────────────────────────────────
  getActiveOntology: () => Ontology | undefined;
  hasFileHandle: () => boolean;

  // ── Lifecycle ──────────────────────────────────────────────────────
  init: () => Promise<void>;
  createOntology: (meta: Partial<OntologyMetadata>) => string;
  importOntology: (turtleText: string, fileName: string) => string;
  importOntologyAsync: (text: string, fileName: string) => Promise<string>;
  importOntologyWithHandle: (turtleText: string, fileName: string, handle: FileSystemFileHandle) => string;
  /** Shared import tail: build the model, add it, and activate it. Throws on fatal parse errors. */
  _addImported: (parsed: ParseResult, fileName: string) => string;
  deleteOntology: (id: string) => void;
  setActiveOntology: (id: string | null) => void;
  updateMetadata: (patch: Partial<OntologyMetadata>) => void;

  // ── Classes ────────────────────────────────────────────────────────
  addClass: (cls: Partial<OntologyClass>) => string;
  updateClass: (id: string, patch: Partial<OntologyClass>) => void;
  deleteClass: (id: string) => void;

  // ── Properties ─────────────────────────────────────────────────────
  addProperty: (prop: Partial<OntologyProperty>) => string;
  updateProperty: (id: string, patch: Partial<OntologyProperty>) => void;
  deleteProperty: (id: string) => void;

  // ── Individuals ────────────────────────────────────────────────────
  addIndividual: (label: string, typeUri: string) => string;
  updateIndividual: (id: string, patch: Partial<Individual>) => void;
  deleteIndividual: (id: string) => void;
  updateIndividualProperty: (individualId: string, propertyIndex: number, patch: Partial<IndividualPropertyValue>) => void;
  addIndividualProperty: (individualId: string, propVal: IndividualPropertyValue) => void;
  removeIndividualProperty: (individualId: string, propertyIndex: number) => void;

  // ── Other statements (raw triples) ─────────────────────────────────
  /**
   * Replace a group of other statements with new raw triples (empty = delete).
   * New triples about an existing class / property / the ontology are routed
   * to that entity rather than left in other statements.
   */
  replaceOtherStatements: (oldTriples: UnmappedTriple[], newTriples: UnmappedTriple[]) => void;
  /** Turn an untyped subject's statements into a new class or property. */
  declareEntity: (subject: string, statements: UnmappedTriple[], kind: "class" | PropertyType) => string | null;

  // ── Clipboard (in-memory; survives ontology switching) ─────────────
  clipboard: ClipboardItem | null;
  copyClass: (classId: string) => void;
  copyProperty: (propertyId: string) => void;
  /**
   * Paste into the active ontology with fresh IDs and collision-free URIs
   * rebased onto the target base URI. Returns the new entity ID, or null.
   */
  pasteClipboard: (opts?: { domainUri?: string }) => string | null;
  clearClipboard: () => void;

  // ── Export / Save ──────────────────────────────────────────────────
  exportTurtle: () => string;
  exportAs: (format: SerializationFormat) => Promise<string>;
  /** Save to the original file handle. If none, opens a "Save As" picker. */
  saveToFile: () => Promise<boolean>;
}

export type SetState = StoreApi<EditorState>["setState"];
export type GetState = StoreApi<EditorState>["getState"];

/** Helpers shared by every slice. */
export interface StoreInternals {
  /**
   * Apply an edit to the active ontology: records an undo snapshot for that
   * ontology, clears its redo stack, and schedules persistence by ID.
   * Returning the same object from `updater` is a no-op.
   */
  commit: (updater: (onto: Ontology) => Ontology) => void;
  /** Schedule debounced IndexedDB (+ linked file) saves for an ontology. */
  persist: (id: string) => void;
  /** Drop any pending saves for an ontology (e.g. after deleting it). */
  cancelPersist: (id: string) => void;
}

export type Slice<K extends keyof EditorState> = (
  set: SetState,
  get: GetState,
  internals: StoreInternals,
) => Pick<EditorState, K>;
