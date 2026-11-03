/**
 * Cached external ontologies (read-only) and term lookup across every source.
 *
 * Sources, in lookup order:
 *   1. other ontologies open in the workspace (what you're actively using)
 *   2. cached references (fetched imports / namespaces, or files you loaded)
 *   3. the built-in library (SKOS, DCTERMS, FOAF, schema.org, PROV-O)
 *
 * This is app state, not ontology data — it never enters undo history.
 */

import { create } from "zustand";
import type { Ontology } from "../../types";
import { deleteReference, loadAllReferences, saveReference, type StoredReference } from "../persistence";
import { parseTurtle } from "../turtle-parser";
import { serializeToTurtle } from "../turtle-serializer";
import { COMMON_ONTOLOGIES } from "../common-ontologies";
import { buildSource, findDefinition, type ReferenceSource } from "./reference-source";
import { candidateUrls, fetchOntology, parseReference, type FetchOutcome } from "./reference-fetch";

interface ReferenceState {
  stored: StoredReference[];
  sources: ReferenceSource[];
  ready: boolean;
  /** Bumped whenever sources change, for memoised lookups */
  version: number;
  init: () => Promise<void>;
  /** Parse and cache an ontology's text. Throws with a readable message if it isn't RDF. */
  addFromText: (iri: string, text: string, origin: string, formatHint: string) => Promise<ReferenceSource>;
  /** Fetch a URL and cache it under `iri` (defaults to the URL). */
  fetchInto: (url: string, iri?: string) => Promise<FetchOutcome>;
  remove: (id: string) => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useReferences = create<ReferenceState>((set, get) => {
  const addParsed = async (record: StoredReference): Promise<ReferenceSource> => {
    const { parsed } = await parseReference(record.text, record.formatHint);
    if (parsed.errors.length && parsed.triples.length === 0) {
      throw new Error(parsed.errors[0]!.line ? `Line ${parsed.errors[0]!.line}: ${parsed.errors[0]!.message}` : parsed.errors[0]!.message);
    }
    if (parsed.triples.length === 0) throw new Error("No RDF statements found.");
    return buildSource({ id: record.id, kind: "reference", iri: record.iri, origin: record.origin }, parsed.triples, parsed.prefixes);
  };

  return {
    stored: [],
    sources: [],
    ready: false,
    version: 0,

    init: () => {
      initPromise ??= (async () => {
        let stored: StoredReference[] = [];
        try { stored = await loadAllReferences(); } catch { /* storage unavailable: start empty */ }
        const sources: ReferenceSource[] = [];
        for (const record of stored) {
          try { sources.push(await addParsed(record)); } catch { /* unreadable cache entry: skip */ }
        }
        set((s) => ({ stored, sources, ready: true, version: s.version + 1 }));
      })();
      return initPromise;
    },

    addFromText: async (iri, text, origin, formatHint) => {
      const existing = get().stored.find((r) => r.iri === iri);
      const record: StoredReference = {
        id: existing?.id ?? crypto.randomUUID().slice(0, 8),
        iri, origin, text, formatHint, fetchedAt: new Date().toISOString(),
      };
      const source = await addParsed(record);
      await saveReference(record).catch(() => { /* kept for this session even if storage fails */ });
      set((s) => ({
        stored: [...s.stored.filter((r) => r.id !== record.id), record],
        sources: [...s.sources.filter((src) => src.id !== record.id), source],
        version: s.version + 1,
      }));
      return source;
    },

    fetchInto: async (url, iri) => {
      const outcome = await fetchOntology(url);
      if (!outcome.ok) return outcome;
      try {
        await get().addFromText(iri ?? url, outcome.text, outcome.url, outcome.formatHint);
        return outcome;
      } catch (err) {
        return { ok: false, url, reason: "not-rdf", message: err instanceof Error ? err.message : String(err) };
      }
    },

    remove: async (id) => {
      await deleteReference(id).catch(() => undefined);
      set((s) => ({
        stored: s.stored.filter((r) => r.id !== id),
        sources: s.sources.filter((src) => src.id !== id),
        version: s.version + 1,
      }));
    },
  };
});

// ── Library and workspace sources (built on demand, cached) ──────────────

let librarySources: ReferenceSource[] | null = null;
export function getLibrarySources(): ReferenceSource[] {
  librarySources ??= COMMON_ONTOLOGIES.map((lib) => {
    const parsed = parseTurtle(lib.turtle);
    return buildSource({ id: `library:${lib.id}`, kind: "library", iri: lib.baseUri, origin: `Built-in library: ${lib.name}` }, parsed.triples, parsed.prefixes);
  });
  return librarySources;
}

const workspaceCache = new WeakMap<Ontology, ReferenceSource>();
/** An open ontology as a lookup source (cached per ontology object). */
export function workspaceSource(onto: Ontology): ReferenceSource {
  let source = workspaceCache.get(onto);
  if (!source) {
    const parsed = parseTurtle(serializeToTurtle(onto));
    source = buildSource(
      { id: `workspace:${onto.id}`, kind: "workspace", iri: onto.metadata.ontologyUri || onto.metadata.baseUri, origin: onto.fileName ?? "Open in the workspace" },
      parsed.triples, parsed.prefixes,
    );
    workspaceCache.set(onto, source);
  }
  return source;
}

/** Every source in lookup order, excluding the active ontology itself. */
export function allSources(ontologies: Ontology[], activeId: string | null, references: ReferenceSource[]): ReferenceSource[] {
  return [
    ...ontologies.filter((o) => o.id !== activeId).map(workspaceSource),
    ...references,
    ...getLibrarySources(),
  ];
}

// ── Finding a term that isn't loaded yet ─────────────────────────────────

export interface ResolveStep {
  url: string;
  outcome: "found" | "fetched-not-here" | "blocked" | "http" | "not-rdf" | "already-cached";
  message?: string;
}

/**
 * Try the candidate URLs for a term (imports first, then its namespace),
 * caching each ontology fetched, until one defines it. Reports every step so
 * the UI can explain what happened and offer a manual load.
 */
export async function resolveTerm(termUri: string, imports: string[], onStep: (step: ResolveStep) => void): Promise<boolean> {
  const state = useReferences.getState();
  for (const url of candidateUrls(termUri, imports)) {
    if (useReferences.getState().stored.some((r) => r.iri === url || r.origin === url)) {
      onStep({ url, outcome: "already-cached" });
      continue;
    }
    const outcome = await state.fetchInto(url, imports.includes(url) ? url : undefined);
    if (!outcome.ok) {
      onStep({ url, outcome: outcome.reason, message: outcome.message });
      continue;
    }
    const found = findDefinition(termUri, useReferences.getState().sources);
    onStep({ url, outcome: found ? "found" : "fetched-not-here" });
    if (found) return true;
  }
  return false;
}
