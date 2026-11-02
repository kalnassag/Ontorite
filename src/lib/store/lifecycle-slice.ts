/**
 * Ontology lifecycle: load, create, import, delete, switch, metadata, undo/redo.
 */

import type { Ontology, OntologyMetadata, ParseError } from "../../types";
import { loadAllOntologies, saveOntology, deleteOntology as dbDelete } from "../persistence";
import { STANDARD_PREFIXES } from "../uri-utils";
import { parseTurtle } from "../turtle-parser";
import { buildModelFromTriples } from "../model-builder";
import { detectFormat, parseToTriples } from "../formats";
import { setHandle, removeHandle, hasHandle } from "../file-access";
import { migrateOntology } from "./migrations";
import { HISTORY_LIMIT } from "./internals";
import { genId } from "./ids";
import type { Slice } from "./types";

type LifecycleKeys =
  | "ontologies" | "activeOntologyId" | "initialized" | "history" | "importWarnings"
  | "undo" | "redo" | "clearImportWarnings" | "getActiveOntology" | "hasFileHandle"
  | "init" | "createOntology" | "importOntology" | "importOntologyAsync" | "importOntologyWithHandle"
  | "_addImported" | "deleteOntology" | "setActiveOntology" | "updateMetadata";

const formatParseError = (err: ParseError) => (err.line ? `Line ${err.line}: ${err.message}` : err.message);

/** Standard prefixes the file rebinds to a different namespace (the file's binding wins). */
export function prefixConflicts(filePrefixes: Record<string, string>): string[] {
  return Object.entries(filePrefixes)
    .filter(([prefix, uri]) => STANDARD_PREFIXES[prefix] !== undefined && STANDARD_PREFIXES[prefix] !== uri)
    .map(([prefix, uri]) =>
      `Prefix "${prefix}:" is bound to <${uri}> in this file, not the standard <${STANDARD_PREFIXES[prefix]}> — kept the file's binding.`);
}

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
      created: meta.created ?? now,
      modified: meta.modified ?? now,
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

export const lifecycleSlice: Slice<LifecycleKeys> = (set, get, { commit, persist, cancelPersist }) => {
  /** Move the active ontology one step through its history (undo: past → future). */
  const step = (from: "past" | "future") => {
    const id = get().activeOntologyId;
    if (!id) return;
    const to = from === "past" ? "future" : "past";
    let moved = false;
    set((s) => {
      const h = s.history[id];
      const current = s.ontologies.find((o) => o.id === id);
      const target = h?.[from][h[from].length - 1];
      if (!h || !current || !target) return {};
      moved = true;
      const next = { ...h, [from]: h[from].slice(0, -1), [to]: [...h[to], current].slice(-HISTORY_LIMIT) };
      return {
        ontologies: s.ontologies.map((o) => (o.id === id ? target : o)),
        history: { ...s.history, [id]: next },
      };
    });
    if (moved) persist(id); // also rewrites a linked file
  };

  return {
    ontologies: [],
    activeOntologyId: null,
    initialized: false,
    history: {},
    importWarnings: [],

    undo: () => step("past"),
    redo: () => step("future"),
    clearImportWarnings: () => set({ importWarnings: [] }),

    getActiveOntology: () => {
      const { ontologies, activeOntologyId } = get();
      return ontologies.find((o) => o.id === activeOntologyId);
    },
    hasFileHandle: () => {
      const id = get().activeOntologyId;
      return id ? hasHandle(id) : false;
    },

    init: async () => {
      const ontologies = await loadAllOntologies();
      ontologies.forEach(migrateOntology);
      set({
        ontologies,
        activeOntologyId: ontologies[0]?.id ?? null,
        initialized: true,
      });
    },

    createOntology: (meta) => {
      const onto = newOntology(meta);
      set((s) => ({ ontologies: [...s.ontologies, onto], activeOntologyId: onto.id }));
      saveOntology(onto);
      return onto.id;
    },

    importOntology: (turtleText, fileName) => get()._addImported(parseTurtle(turtleText), fileName),

    importOntologyAsync: async (text, fileName) => {
      const format = detectFormat(fileName, text);
      const parsed = format === "turtle" ? parseTurtle(text) : await parseToTriples(text, format);
      return get()._addImported(parsed, fileName);
    },

    importOntologyWithHandle: (turtleText, fileName, handle) => {
      const id = get().importOntology(turtleText, fileName);
      setHandle(id, handle);
      set({ lastFileSaveTime: Date.now() }); // the file is "saved" — we just read it
      return id;
    },

    _addImported: (parsed, fileName) => {
      // Strict: a file with a syntax error is rejected rather than half-imported
      // (a partial import linked to a file handle would be auto-saved over the original).
      if (parsed.errors.length > 0 && parsed.triples.length === 0) {
        throw new Error(parsed.errors.map(formatParseError).join("; "));
      }
      const model = buildModelFromTriples(parsed);
      const now = new Date().toISOString();
      const fallbackLabel = fileName.replace(/\.(ttl|turtle|n3|jsonld|json|rdf|xml|owl|nt)$/i, "");
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
      set((s) => ({
        ontologies: [...s.ontologies, onto],
        activeOntologyId: onto.id,
        importWarnings: [...parsed.errors.map(formatParseError), ...prefixConflicts(model.metadata.prefixes)],
      }));
      saveOntology(onto);
      return onto.id;
    },

    deleteOntology: (id) => {
      cancelPersist(id);
      set((s) => {
        const remaining = s.ontologies.filter((o) => o.id !== id);
        const { [id]: _dropped, ...history } = s.history;
        return {
          ontologies: remaining,
          history,
          activeOntologyId: s.activeOntologyId === id ? (remaining[0]?.id ?? null) : s.activeOntologyId,
        };
      });
      dbDelete(id);
      removeHandle(id);
    },

    setActiveOntology: (id) => {
      set({ activeOntologyId: id, lastFileSaveTime: id && hasHandle(id) ? Date.now() : null });
    },

    updateMetadata: (patch) => {
      const stamp = new Date().toISOString();
      commit((o) => ({ ...o, metadata: { ...o.metadata, ...patch, modified: patch.modified ?? stamp } }));
    },
  };
};
