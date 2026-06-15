/**
 * Zustand store for Ontorite state.
 *
 * Single source of truth for all domain data. Persistence goes to both
 * IndexedDB (session survival) and the original file on disk via the
 * File System Access API (Chrome/Edge) when a file handle is available.
 */

import { create } from "zustand";
import type { Ontology, OntologyClass, OntologyMetadata, OntologyProperty, Individual, IndividualPropertyValue, ClipboardItem, UnmappedTriple, ExtraTriple } from "../types";
import { loadAllOntologies, saveOntology, deleteOntology as dbDelete, debounce } from "./persistence";
import { buildUri, toPascalCase, toCamelCase, STANDARD_PREFIXES } from "./uri-utils";
import { parseTurtle, buildModelFromTriples } from "./turtle-parser";
import { serializeToTurtle } from "./turtle-serializer";
import { detectFormat, parseToTriples, serializeFromOntology, type SerializationFormat } from "./formats";
import {
  getHandle,
  setHandle,
  removeHandle,
  hasHandle,
  writeToHandle,
  saveAsTurtleFile,
  supportsFileSystemAccess,
} from "./file-access";

interface EditorState {
  // ── Data ───────────────────────────────────────────────────────────
  ontologies: Ontology[];
  activeOntologyId: string | null;
  initialized: boolean;

  /** Timestamp of last successful file save (for UI indicator) */
  lastFileSaveTime: number | null;
  /** Whether a file save is in progress */
  fileSaveInProgress: boolean;

  // ── Undo / Redo ────────────────────────────────────────────────────
  _history: Ontology[][];
  _future: Ontology[][];
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;

  // ── Import feedback ────────────────────────────────────────────────
  /** Warnings/errors from the most recent import (parse errors, blank nodes, etc.) */
  importWarnings: string[];
  clearImportWarnings: () => void;

  // ── Derived (convenience getters) ──────────────────────────────────
  getActiveOntology: () => Ontology | undefined;
  getPropertiesByDomain: () => Map<string, OntologyProperty[]>;
  getUnassignedProperties: () => OntologyProperty[];
  hasFileHandle: () => boolean;

  // ── Lifecycle ──────────────────────────────────────────────────────
  init: () => Promise<void>;
  createOntology: (meta: Partial<OntologyMetadata>) => string;
  importOntology: (turtleText: string, fileName: string) => string;
  importOntologyAsync: (text: string, fileName: string) => Promise<string>;
  importOntologyWithHandle: (
    turtleText: string,
    fileName: string,
    handle: FileSystemFileHandle
  ) => string;
  deleteOntology: (id: string) => void;
  setActiveOntology: (id: string | null) => void;
  updateMetadata: (patch: Partial<OntologyMetadata>) => void;

  // ── Class actions ──────────────────────────────────────────────────
  addClass: (cls: Partial<OntologyClass>) => string;
  updateClass: (id: string, patch: Partial<OntologyClass>) => void;
  deleteClass: (id: string) => void;

  // ── Property actions ───────────────────────────────────────────────
  addProperty: (prop: Partial<OntologyProperty>) => string;
  updateProperty: (id: string, patch: Partial<OntologyProperty>) => void;
  deleteProperty: (id: string) => void;

  // ── Individual actions ──────────────────────────────────────────────
  addIndividual: (label: string, typeUri: string) => string;
  updateIndividual: (id: string, patch: Partial<Individual>) => void;
  deleteIndividual: (id: string) => void;
  updateIndividualProperty: (
    individualId: string,
    propertyIndex: number,
    patch: Partial<IndividualPropertyValue>
  ) => void;
  addIndividualProperty: (
    individualId: string,
    propVal: IndividualPropertyValue
  ) => void;
  removeIndividualProperty: (individualId: string, propertyIndex: number) => void;

  // ── Unmapped triples ───────────────────────────────────────────────
  updateUnmappedTriple: (index: number, patch: Partial<UnmappedTriple>) => void;
  deleteUnmappedTriple: (index: number) => void;
  /**
   * Move an unmapped triple into a class/property's extraTriples. The triple's
   * subject does not have to match the target entity's URI — the user knows best.
   */
  promoteUnmappedTriple: (index: number, targetEntityId: string) => void;

  // ── Clipboard ─────────────────────────────────────────────────────
  clipboard: ClipboardItem | null;
  /** Copy a class + all its domain properties into the clipboard. */
  copyClass: (classId: string) => void;
  /** Copy a single property into the clipboard. */
  copyProperty: (propertyId: string) => void;
  /**
   * Paste the clipboard into the active ontology.
   * For a class item: creates the class + its properties (new IDs, URIs rebased to target base).
   * For a property item: creates the property (domainUri overridable via opts).
   * Returns the new entity ID, or null if clipboard is empty.
   */
  pasteClipboard: (opts?: { domainUri?: string }) => string | null;
  clearClipboard: () => void;

  // ── Export / Save ─────────────────────────────────────────────────
  exportTurtle: () => string;
  exportAs: (format: SerializationFormat) => Promise<string>;
  /** Save to the original file handle. If none, opens a "Save As" picker. */
  saveToFile: () => Promise<boolean>;
}

const genId = () => crypto.randomUUID().slice(0, 8);

function newOntology(meta: Partial<OntologyMetadata>): Ontology {
  const now = new Date().toISOString();
  const baseUri = meta.baseUri || "http://example.org/ontology/";
  return {
    id: genId(),
    metadata: {
      baseUri,
      ontologyUri: baseUri,
      ontologyLabel: meta.ontologyLabel || "New Ontology",
      ontologyComment: meta.ontologyComment || "",
      versionIRI: meta.versionIRI || "",
      versionInfo: meta.versionInfo || "",
      editorialNotes: meta.editorialNotes || [],
      prefixes: { ...STANDARD_PREFIXES, ...meta.prefixes },
      defaultLanguage: meta.defaultLanguage || "en",
    },
    classes: [],
    properties: [],
    individuals: [],
    unmappedTriples: [],
    createdAt: now,
    updatedAt: now,
  };
}

const SKOS_EDITORIAL_NOTE = "http://www.w3.org/2004/02/skos/core#editorialNote";
const OWL_VERSION_IRI = "http://www.w3.org/2002/07/owl#versionIRI";
const OWL_VERSION_INFO = "http://www.w3.org/2002/07/owl#versionInfo";

/**
 * One-time migration helper: hoist legacy skos:editorialNote and
 * owl:versionIRI/versionInfo triples out of extraTriples/unmappedTriples
 * into the new typed fields. Safe to re-run — once the buckets no longer
 * contain those predicates, the function is a no-op.
 *
 * Exported for unit tests.
 */
export function sweepLegacyTriples(onto: Ontology): void {
  // Classes: move skos:editorialNote from extraTriples to editorialNotes
  for (const cls of onto.classes) {
    const keep: typeof cls.extraTriples = [];
    for (const et of cls.extraTriples) {
      if (et.predicate === SKOS_EDITORIAL_NOTE && et.isLiteral) {
        cls.editorialNotes.push({ value: et.object, lang: et.lang ?? "" });
      } else {
        keep.push(et);
      }
    }
    cls.extraTriples = keep;
  }
  // Properties: same
  for (const prop of onto.properties) {
    const keep: typeof prop.extraTriples = [];
    for (const et of prop.extraTriples) {
      if (et.predicate === SKOS_EDITORIAL_NOTE && et.isLiteral) {
        prop.editorialNotes.push({ value: et.object, lang: et.lang ?? "" });
      } else {
        keep.push(et);
      }
    }
    prop.extraTriples = keep;
  }
  // Ontology-level: sweep unmappedTriples for editorial notes / version triples
  // whose subject is the ontology URI.
  const ontoUri = onto.metadata.ontologyUri;
  const keepUnmapped: typeof onto.unmappedTriples = [];
  for (const t of onto.unmappedTriples) {
    if (t.subject && ontoUri && t.subject === ontoUri) {
      if (t.predicate === OWL_VERSION_IRI && !t.isLiteral) {
        if (!onto.metadata.versionIRI) onto.metadata.versionIRI = t.object;
        continue;
      }
      if (t.predicate === OWL_VERSION_INFO && t.isLiteral) {
        if (!onto.metadata.versionInfo) onto.metadata.versionInfo = t.object;
        continue;
      }
      if (t.predicate === SKOS_EDITORIAL_NOTE && t.isLiteral) {
        onto.metadata.editorialNotes.push({ value: t.object, lang: t.lang ?? "" });
        continue;
      }
    }
    keepUnmapped.push(t);
  }
  onto.unmappedTriples = keepUnmapped;
}

/** Mutate the active ontology inside the ontologies array and return updated array */
function updateActive(
  ontologies: Ontology[],
  activeId: string | null,
  updater: (onto: Ontology) => Ontology
): Ontology[] {
  if (!activeId) return ontologies;
  return ontologies.map((o) => (o.id === activeId ? updater(o) : o));
}

export const useStore = create<EditorState>((set, get) => {
  // Debounced persistence: IndexedDB
  const persistToDb = debounce(async (..._args: unknown[]) => {
    const onto = get().getActiveOntology();
    if (onto) await saveOntology(onto);
  }, 500);

  // Debounced persistence: file on disk
  const persistToFile = debounce(async (..._args: unknown[]) => {
    const state = get();
    const onto = state.getActiveOntology();
    if (!onto) return;
    const handle = getHandle(onto.id);
    if (!handle) return;

    set({ fileSaveInProgress: true });
    const turtle = serializeToTurtle(onto);
    const ok = await writeToHandle(handle, turtle);
    set({
      fileSaveInProgress: false,
      lastFileSaveTime: ok ? Date.now() : state.lastFileSaveTime,
    });
    if (ok) { if (import.meta.env.DEV) console.log("[file-save] auto-saved to", handle.name); }
  }, 1000);

  /** Persist to both IndexedDB and file (if handle exists) */
  const persist = () => {
    persistToDb();
    persistToFile();
  };

  return {
    ontologies: [],
    activeOntologyId: null,
    initialized: false,
    lastFileSaveTime: null,
    fileSaveInProgress: false,
    _history: [],
    _future: [],
    importWarnings: [],
    clipboard: null,

    // ── Derived ────────────────────────────────────────────────────────
    getActiveOntology: () => {
      const { ontologies, activeOntologyId } = get();
      return ontologies.find((o) => o.id === activeOntologyId);
    },

    getPropertiesByDomain: () => {
      const onto = get().getActiveOntology();
      const map = new Map<string, OntologyProperty[]>();
      if (!onto) return map;
      for (const cls of onto.classes) {
        map.set(cls.id, []);
      }
      for (const prop of onto.properties) {
        if (prop.domainUri) {
          const cls = onto.classes.find((c) => c.uri === prop.domainUri);
          if (cls) {
            const list = map.get(cls.id) || [];
            list.push(prop);
            map.set(cls.id, list);
          }
        }
      }
      return map;
    },

    getUnassignedProperties: () => {
      const onto = get().getActiveOntology();
      if (!onto) return [];
      const classUris = new Set(onto.classes.map((c) => c.uri));
      return onto.properties.filter((p) => !p.domainUri || !classUris.has(p.domainUri));
    },

    hasFileHandle: () => {
      const id = get().activeOntologyId;
      return id ? hasHandle(id) : false;
    },

    // ── Undo / Redo ────────────────────────────────────────────────────
    canUndo: () => get()._history.length > 0,
    canRedo: () => get()._future.length > 0,

    undo: () => {
      set((s) => {
        if (s._history.length === 0) return {};
        const prev = s._history[s._history.length - 1]!;
        return {
          _history: s._history.slice(0, -1),
          _future: [...s._future, s.ontologies].slice(-50),
          ontologies: prev,
        };
      });
      persistToDb();
    },

    redo: () => {
      set((s) => {
        if (s._future.length === 0) return {};
        const next = s._future[s._future.length - 1]!;
        return {
          _history: [...s._history, s.ontologies].slice(-50),
          _future: s._future.slice(0, -1),
          ontologies: next,
        };
      });
      persistToDb();
    },

    // ── Import feedback ────────────────────────────────────────────────
    clearImportWarnings: () => set({ importWarnings: [] }),

    // ── Lifecycle ──────────────────────────────────────────────────────
    init: async () => {
      const ontologies = await loadAllOntologies();
      // Migrate older ontologies that lack newer fields
      for (const onto of ontologies) {
        if (!onto.individuals) onto.individuals = [];
        for (const cls of onto.classes) {
          if (!cls.subClassOf) cls.subClassOf = [];
          if (!cls.disjointWith) cls.disjointWith = [];
          if (!cls.restrictions) cls.restrictions = [];
          if (!cls.extraTriples) cls.extraTriples = [];
          if (!cls.editorialNotes) cls.editorialNotes = [];
        }
        for (const prop of onto.properties) {
          if (!prop.extraTriples) prop.extraTriples = [];
          if (!prop.editorialNotes) prop.editorialNotes = [];
          // Migrate v1 single range string → v2 ranges array
          if (!prop.ranges) {
            const legacy = (prop as unknown as { range?: string }).range;
            prop.ranges = legacy ? [legacy] : [];
          }
          // inverseOf / cardinality are optional — undefined is fine, no migration needed
        }
        for (const ind of onto.individuals) {
          if (!ind.editorialNotes) ind.editorialNotes = [];
        }
        // Default new metadata fields
        if (onto.metadata.versionIRI === undefined) onto.metadata.versionIRI = "";
        if (onto.metadata.versionInfo === undefined) onto.metadata.versionInfo = "";
        if (!onto.metadata.editorialNotes) onto.metadata.editorialNotes = [];
        // Sweep legacy storage: relocate skos:editorialNote and owl:versionIRI/versionInfo
        // out of extraTriples / unmappedTriples into the new typed fields. Idempotent.
        sweepLegacyTriples(onto);
      }
      set({
        ontologies,
        activeOntologyId: ontologies.length > 0 ? ontologies[0]!.id : null,
        initialized: true,
      });
    },

    createOntology: (meta) => {
      const onto = newOntology(meta);
      set((s) => ({
        ontologies: [...s.ontologies, onto],
        activeOntologyId: onto.id,
      }));
      saveOntology(onto);
      return onto.id;
    },

    importOntology: (turtleText, fileName) => {
      const parsed = parseTurtle(turtleText);
      const model = buildModelFromTriples(parsed);
      const now = new Date().toISOString();
      const fallbackLabel = fileName.replace(/\.ttl$/i, "");
      const onto: Ontology = {
        id: genId(),
        metadata: {
          ...model.metadata,
          ontologyLabel: model.metadata.ontologyLabel || fallbackLabel,
          prefixes: { ...STANDARD_PREFIXES, ...model.metadata.prefixes },
        },
        classes: model.classes,
        properties: model.properties,
        individuals: model.individuals,
        unmappedTriples: model.unmappedTriples,
        createdAt: now,
        updatedAt: now,
      };

      // Build user-visible warnings from parse errors and data-loss events
      const warnings: string[] = [];
      for (const err of parsed.errors) {
        warnings.push(err.line ? `Line ${err.line}: ${err.message}` : err.message);
      }
      if (parsed.blankNodeCount > 0) {
        warnings.push(
          `${parsed.blankNodeCount} blank-node statement${parsed.blankNodeCount > 1 ? "s" : ""} were skipped — blank nodes are not supported in v1.`
        );
      }

      set((s) => ({
        ontologies: [...s.ontologies, onto],
        activeOntologyId: onto.id,
        importWarnings: warnings,
      }));
      saveOntology(onto);
      return onto.id;
    },

    importOntologyAsync: async (text, fileName) => {
      const format = detectFormat(fileName, text);
      if (format === "turtle") {
        return get().importOntology(text, fileName);
      }
      const parsed = await parseToTriples(text, format);
      const model = buildModelFromTriples(parsed);
      const now = new Date().toISOString();
      const fallbackLabel = fileName.replace(/\.(ttl|jsonld|json|rdf|xml|owl|nt)$/i, "");
      const onto: Ontology = {
        id: genId(),
        metadata: {
          ...model.metadata,
          ontologyLabel: model.metadata.ontologyLabel || fallbackLabel,
          prefixes: { ...STANDARD_PREFIXES, ...model.metadata.prefixes },
        },
        classes: model.classes,
        properties: model.properties,
        individuals: model.individuals,
        unmappedTriples: model.unmappedTriples,
        createdAt: now,
        updatedAt: now,
      };
      sweepLegacyTriples(onto);

      const warnings: string[] = [];
      for (const err of parsed.errors) {
        warnings.push(err.line ? `Line ${err.line}: ${err.message}` : err.message);
      }
      if (parsed.blankNodeCount > 0) {
        warnings.push(
          `${parsed.blankNodeCount} blank-node statement${parsed.blankNodeCount > 1 ? "s" : ""} were skipped — blank nodes are not supported in v1.`
        );
      }

      set((s) => ({
        ontologies: [...s.ontologies, onto],
        activeOntologyId: onto.id,
        importWarnings: warnings,
      }));
      saveOntology(onto);
      return onto.id;
    },

    importOntologyWithHandle: (turtleText, fileName, handle) => {
      // Reuse the normal import, then associate the file handle
      const id = get().importOntology(turtleText, fileName);
      setHandle(id, handle);
      set({ lastFileSaveTime: Date.now() }); // file is "saved" because we just read it
      return id;
    },

    deleteOntology: (id) => {
      set((s) => {
        const remaining = s.ontologies.filter((o) => o.id !== id);
        return {
          ontologies: remaining,
          activeOntologyId:
            s.activeOntologyId === id
              ? remaining.length > 0
                ? remaining[0]!.id
                : null
              : s.activeOntologyId,
        };
      });
      dbDelete(id);
      removeHandle(id);
    },

    setActiveOntology: (id) => {
      set({
        activeOntologyId: id,
        lastFileSaveTime: id && hasHandle(id) ? Date.now() : null,
      });
    },

    updateMetadata: (patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          metadata: { ...o.metadata, ...patch },
        })),
      }));
      persist();
    },

    // ── Class actions ────────────────────────────────────────────────────
    addClass: (partial) => {
      const id = genId();
      const onto = get().getActiveOntology();
      if (!onto) return id;

      const label = partial.labels?.[0]?.value || "NewClass";
      const localName = partial.localName || toPascalCase(label);
      const uri = partial.uri || buildUri(onto.metadata.baseUri, localName);

      const cls: OntologyClass = {
        id,
        localName,
        uri,
        labels: partial.labels || [{ value: label, lang: onto.metadata.defaultLanguage }],
        descriptions: partial.descriptions || [{ value: "", lang: onto.metadata.defaultLanguage }],
        editorialNotes: partial.editorialNotes || [],
        subClassOf: partial.subClassOf || [],
        disjointWith: partial.disjointWith || [],
        restrictions: partial.restrictions || [],
        extraTriples: partial.extraTriples || [],
      };

      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          classes: [...o.classes, cls],
        })),
      }));
      persist();
      return id;
    },

    updateClass: (id, patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => {
          const existing = o.classes.find((c) => c.id === id);
          const oldUri = existing?.uri;
          const newUri = patch.uri ?? oldUri;
          const uriChanged = !!oldUri && !!newUri && oldUri !== newUri;
          return {
            ...o,
            classes: o.classes.map((c) => {
              if (c.id === id) return { ...c, ...patch };
              if (!uriChanged) return c;
              return {
                ...c,
                subClassOf: c.subClassOf.map((u) => (u === oldUri ? newUri! : u)),
                disjointWith: (c.disjointWith ?? []).map((u) => (u === oldUri ? newUri! : u)),
              };
            }),
            // Cascade: update properties whose domain or range pointed at the old class URI
            properties: uriChanged
              ? o.properties.map((p) => ({
                  ...p,
                  domainUri: p.domainUri === oldUri ? newUri! : p.domainUri,
                  ranges: (p.ranges ?? []).map((r) => r === oldUri ? newUri! : r),
                }))
              : o.properties,
          };
        }),
      }));
      persist();
    },

    deleteClass: (id) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => {
          const cls = o.classes.find((c) => c.id === id);
          return {
            ...o,
            classes: o.classes
              .filter((c) => c.id !== id)
              .map((c) => ({
                ...c,
                disjointWith: (c.disjointWith ?? []).filter((u) => u !== cls?.uri),
              })),
            properties: o.properties.map((p) =>
              cls && p.domainUri === cls.uri ? { ...p, domainUri: "" } : p
            ),
          };
        }),
      }));
      persist();
    },

    // ── Property actions ─────────────────────────────────────────────────
    addProperty: (partial) => {
      const id = genId();
      const onto = get().getActiveOntology();
      if (!onto) return id;

      const label = partial.labels?.[0]?.value || "newProperty";
      const localName = partial.localName || toCamelCase(label);
      const uri = partial.uri || buildUri(onto.metadata.baseUri, localName);

      const prop: OntologyProperty = {
        id,
        localName,
        uri,
        type: partial.type || "owl:DatatypeProperty",
        labels: partial.labels || [{ value: label, lang: onto.metadata.defaultLanguage }],
        descriptions: partial.descriptions || [{ value: "", lang: onto.metadata.defaultLanguage }],
        editorialNotes: partial.editorialNotes || [],
        domainUri: partial.domainUri || "",
        ranges: partial.ranges ?? [],
        subPropertyOf: partial.subPropertyOf || [],
        inverseOf: partial.inverseOf,
        minCardinality: partial.minCardinality,
        maxCardinality: partial.maxCardinality,
        exactCardinality: partial.exactCardinality,
        extraTriples: partial.extraTriples || [],
      };

      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          properties: [...o.properties, prop],
        })),
      }));
      persist();
      return id;
    },

    updateProperty: (id, patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => {
          const existing = o.properties.find((p) => p.id === id);
          const oldUri = existing?.uri;
          const newUri = patch.uri ?? oldUri;
          const uriChanged = !!oldUri && !!newUri && oldUri !== newUri;
          return {
            ...o,
            properties: o.properties.map((p) => {
              if (p.id === id) return { ...p, ...patch };
              if (!uriChanged) return p;
              return {
                ...p,
                subPropertyOf: p.subPropertyOf.map((u) => (u === oldUri ? newUri! : u)),
                inverseOf: p.inverseOf === oldUri ? newUri! : p.inverseOf,
              };
            }),
          };
        }),
      }));
      persist();
    },

    deleteProperty: (id) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => {
          const prop = o.properties.find((p) => p.id === id);
          return {
            ...o,
            properties: o.properties
              .filter((p) => p.id !== id)
              .map((p) => ({
                ...p,
                inverseOf: p.inverseOf === prop?.uri ? undefined : p.inverseOf,
              })),
          };
        }),
      }));
      persist();
    },

    // ── Individual actions ────────────────────────────────────────────────
    addIndividual: (label, typeUri) => {
      const id = genId();
      const onto = get().getActiveOntology();
      if (!onto) return id;

      const localNameVal = toCamelCase(label) || id;
      const uri = buildUri(onto.metadata.baseUri, localNameVal);

      const individual: Individual = {
        id,
        uri,
        localName: localNameVal,
        typeUris: [typeUri],
        propertyValues: [],
        editorialNotes: [],
      };

      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          individuals: [...(o.individuals ?? []), individual],
        })),
      }));
      persist();
      return id;
    },

    updateIndividual: (id, patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => {
          const oldUri = o.individuals.find((i) => i.id === id)?.uri;
          const updated = o.individuals.map((ind) =>
            ind.id === id ? { ...ind, ...patch } : ind
          );
          const newUri = updated.find((i) => i.id === id)?.uri;
          // Cascade URI rename into other individuals' object-property values
          if (oldUri && newUri && oldUri !== newUri) {
            return {
              ...o,
              individuals: updated.map((ind) => ({
                ...ind,
                propertyValues: ind.propertyValues.map((pv) =>
                  !pv.isLiteral && pv.value === oldUri ? { ...pv, value: newUri } : pv
                ),
              })),
            };
          }
          return { ...o, individuals: updated };
        }),
      }));
      persist();
    },

    deleteIndividual: (id) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          individuals: (o.individuals ?? []).filter((ind) => ind.id !== id),
        })),
      }));
      persist();
    },

    updateIndividualProperty: (individualId, propertyIndex, patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          individuals: (o.individuals ?? []).map((ind) => {
            if (ind.id !== individualId) return ind;
            const newVals = [...ind.propertyValues];
            const existing = newVals[propertyIndex];
            if (existing) {
              newVals[propertyIndex] = { ...existing, ...patch };
            }
            return { ...ind, propertyValues: newVals };
          }),
        })),
      }));
      persist();
    },

    addIndividualProperty: (individualId, propVal) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          individuals: (o.individuals ?? []).map((ind) =>
            ind.id === individualId
              ? { ...ind, propertyValues: [...ind.propertyValues, propVal] }
              : ind
          ),
        })),
      }));
      persist();
    },

    removeIndividualProperty: (individualId, propertyIndex) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          individuals: (o.individuals ?? []).map((ind) =>
            ind.id === individualId
              ? { ...ind, propertyValues: ind.propertyValues.filter((_, i) => i !== propertyIndex) }
              : ind
          ),
        })),
      }));
      persist();
    },

    // ── Unmapped triple actions ─────────────────────────────────────────
    updateUnmappedTriple: (index, patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          unmappedTriples: o.unmappedTriples.map((t, i) =>
            i === index ? { ...t, ...patch } : t
          ),
        })),
      }));
      persist();
    },

    deleteUnmappedTriple: (index) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          unmappedTriples: o.unmappedTriples.filter((_, i) => i !== index),
        })),
      }));
      persist();
    },

    promoteUnmappedTriple: (index, targetEntityId) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => {
          const t = o.unmappedTriples[index];
          if (!t) return o;
          const extra: ExtraTriple = {
            predicate: t.predicate,
            object: t.object,
            isLiteral: t.isLiteral,
            lang: t.lang,
            datatype: t.datatype,
          };
          const remainingUnmapped = o.unmappedTriples.filter((_, i) => i !== index);
          const targetClass = o.classes.find((c) => c.id === targetEntityId);
          if (targetClass) {
            return {
              ...o,
              classes: o.classes.map((c) =>
                c.id === targetEntityId
                  ? { ...c, extraTriples: [...c.extraTriples, extra] }
                  : c
              ),
              unmappedTriples: remainingUnmapped,
            };
          }
          const targetProp = o.properties.find((p) => p.id === targetEntityId);
          if (targetProp) {
            return {
              ...o,
              properties: o.properties.map((p) =>
                p.id === targetEntityId
                  ? { ...p, extraTriples: [...p.extraTriples, extra] }
                  : p
              ),
              unmappedTriples: remainingUnmapped,
            };
          }
          return o;
        }),
      }));
      persist();
    },

    // ── Clipboard ────────────────────────────────────────────────────────
    copyClass: (classId) => {
      const onto = get().getActiveOntology();
      if (!onto) return;
      const cls = onto.classes.find((c) => c.id === classId);
      if (!cls) return;
      const properties = onto.properties.filter((p) => p.domainUri === cls.uri);
      set({ clipboard: { type: "class", cls, properties } });
    },

    copyProperty: (propertyId) => {
      const onto = get().getActiveOntology();
      if (!onto) return;
      const property = onto.properties.find((p) => p.id === propertyId);
      if (!property) return;
      set({ clipboard: { type: "property", property } });
    },

    pasteClipboard: (opts) => {
      const onto = get().getActiveOntology();
      if (!onto) return null;
      const item = get().clipboard;
      if (!item) return null;

      // Build a set of URIs already in the target ontology for collision detection.
      const existingUris = new Set([
        ...onto.classes.map((c) => c.uri),
        ...onto.properties.map((p) => p.uri),
      ]);

      /** Return a local name + URI that don't collide in the target ontology. */
      function rebase(srcLocalName: string): { localName: string; uri: string } {
        let candidate = srcLocalName;
        let uri = buildUri(onto!.metadata.baseUri, candidate);
        if (!existingUris.has(uri)) return { localName: candidate, uri };
        let counter = 1;
        do {
          candidate = `${srcLocalName}_copy${counter > 1 ? counter : ""}`;
          uri = buildUri(onto!.metadata.baseUri, candidate);
          counter++;
        } while (existingUris.has(uri));
        return { localName: candidate, uri };
      }

      if (item.type === "class") {
        const { cls, properties } = item;
        const newClassId = genId();
        const { localName: newLocalName, uri: newUri } = rebase(cls.localName);
        existingUris.add(newUri);

        const newCls: OntologyClass = {
          ...cls,
          id: newClassId,
          localName: newLocalName,
          uri: newUri,
        };

        const newProperties: OntologyProperty[] = properties.map((prop) => {
          const { localName: pLocal, uri: pUri } = rebase(prop.localName);
          existingUris.add(pUri);
          return {
            ...prop,
            id: genId(),
            localName: pLocal,
            uri: pUri,
            domainUri: newUri, // remap domain to the new class URI
          };
        });

        set((s) => ({
          _history: [...s._history.slice(-49), s.ontologies],
          _future: [],
          ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
            ...o,
            classes: [...o.classes, newCls],
            properties: [...o.properties, ...newProperties],
          })),
        }));
        persist();
        return newClassId;
      }

      if (item.type === "property") {
        const { property } = item;
        const { localName: pLocal, uri: pUri } = rebase(property.localName);
        const domainUri =
          opts?.domainUri !== undefined ? opts.domainUri : property.domainUri;

        const newProp: OntologyProperty = {
          ...property,
          id: genId(),
          localName: pLocal,
          uri: pUri,
          domainUri,
        };

        set((s) => ({
          _history: [...s._history.slice(-49), s.ontologies],
          _future: [],
          ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
            ...o,
            properties: [...o.properties, newProp],
          })),
        }));
        persist();
        return newProp.id;
      }

      return null;
    },

    clearClipboard: () => set({ clipboard: null }),

    // ── Export / Save ────────────────────────────────────────────────────
    exportTurtle: () => {
      const onto = get().getActiveOntology();
      if (!onto) return "";
      return serializeToTurtle(onto);
    },

    exportAs: async (format) => {
      const onto = get().getActiveOntology();
      if (!onto) return "";
      return serializeFromOntology(onto, format);
    },

    saveToFile: async () => {
      const onto = get().getActiveOntology();
      if (!onto) return false;

      const turtle = serializeToTurtle(onto);
      const existing = getHandle(onto.id);

      if (existing) {
        // Write back to the original file
        set({ fileSaveInProgress: true });
        const ok = await writeToHandle(existing, turtle);
        set({
          fileSaveInProgress: false,
          lastFileSaveTime: ok ? Date.now() : get().lastFileSaveTime,
        });
        return ok;
      }

      // No handle — try "Save As" if the API is available
      if (supportsFileSystemAccess()) {
        const label = onto.metadata.ontologyLabel || "ontology";
        const suggestedName = `${label.toLowerCase().replace(/\s+/g, "-")}.ttl`;
        const handle = await saveAsTurtleFile(turtle, suggestedName);
        if (handle) {
          setHandle(onto.id, handle);
          set({ lastFileSaveTime: Date.now() });
          return true;
        }
        return false;
      }

      // Fallback: trigger download
      const blob = new Blob([turtle], { type: "text/turtle;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = onto.metadata.ontologyLabel ?? "ontology";
      a.href = url;
      a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.ttl`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    },
  };
});
