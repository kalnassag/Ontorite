/**
 * The user's library: external ontologies (gist, dcat, their own…) kept
 * read-only on this device, used to look up terms' definitions.
 *
 * Nothing is bundled. Ontologies get in by being added from the catalogue
 * (catalog.ts), from a file or URL, or when "Find definition" fetches one.
 *
 * Lookup order: other ontologies open in the workspace, then the library
 * (entries switched off in Settings are skipped).
 *
 * This is app state, not ontology data — it never enters undo history.
 */

import { create } from "zustand";
import type { Ontology } from "../../types";
import { deleteReference, loadAllReferences, saveReference, type StoredReference } from "../persistence";
import { parseTurtle } from "../turtle-parser";
import { serializeToTurtle } from "../turtle-serializer";
import { buildSource, type ReferenceSource } from "./reference-source";
import { fetchOntology, parseReference, type FetchOutcome } from "./reference-fetch";
import { CATALOG, type CatalogEntry } from "./catalog";

export interface AddOptions {
  /** The IRI it stands for; defaults to the document's owl:Ontology IRI, else its origin */
  iri?: string;
  catalogId?: string;
  name?: string;
  prefix?: string;
}

interface ReferenceState {
  stored: StoredReference[];
  /** Parsed, one per stored record (including switched-off ones) */
  sources: ReferenceSource[];
  ready: boolean;
  init: () => Promise<void>;
  /** Parse and keep an ontology's text. Throws with a readable message if it isn't RDF. */
  addFromText: (text: string, origin: string, formatHint: string, opts?: AddOptions) => Promise<ReferenceSource>;
  fetchInto: (url: string, opts?: AddOptions) => Promise<FetchOutcome>;
  addFromCatalog: (entry: CatalogEntry) => Promise<FetchOutcome>;
  /** Download an entry again from where it came from */
  update: (id: string) => Promise<FetchOutcome>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Add records exported from another device (Settings → Data). */
  importRecords: (records: StoredReference[]) => Promise<{ added: number; failed: string[] }>;
}

let initPromise: Promise<void> | null = null;

async function parseRecord(record: StoredReference): Promise<ReferenceSource> {
  const { parsed } = await parseReference(record.text, record.formatHint);
  if (parsed.errors.length && parsed.triples.length === 0) {
    const first = parsed.errors[0]!;
    throw new Error(first.line ? `Line ${first.line}: ${first.message}` : first.message);
  }
  if (parsed.triples.length === 0) throw new Error("No RDF statements found.");
  return buildSource(
    { id: record.id, kind: "reference", iri: record.iri, origin: record.origin, name: record.name },
    parsed.triples, parsed.prefixes,
  );
}

export const isHttp = (url: string) => /^https?:\/\//i.test(url);

export const useReferences = create<ReferenceState>((set, get) => {
  /** Store a parsed record, replacing an existing one for the same ontology. */
  const keep = async (record: StoredReference, source: ReferenceSource) => {
    await saveReference(record).catch(() => { /* kept for this session even if storage fails */ });
    set((s) => ({
      stored: [...s.stored.filter((r) => r.id !== record.id), record],
      sources: [...s.sources.filter((src) => src.id !== record.id), source],
    }));
  };

  /** An existing record for the same ontology: same catalogue entry, IRI, or owl:Ontology IRI. */
  const existingFor = (iri: string, catalogId: string | undefined, ontologyIris: string[]) => {
    const { stored, sources } = get();
    return stored.find((r) => {
      if (catalogId && r.catalogId === catalogId) return true;
      if (r.iri === iri) return true;
      const src = sources.find((s) => s.id === r.id);
      return !!src && ontologyIris.some((o) => src.ontologyIris.includes(o));
    });
  };

  return {
    stored: [],
    sources: [],
    ready: false,

    init: () => {
      initPromise ??= (async () => {
        let stored: StoredReference[] = [];
        try { stored = await loadAllReferences(); } catch { /* storage unavailable: start empty */ }
        const sources: ReferenceSource[] = [];
        for (const record of stored) {
          try { sources.push(await parseRecord(record)); } catch { /* unreadable entry: skip */ }
        }
        set({ stored, sources, ready: true });
      })();
      return initPromise;
    },

    addFromText: async (text, origin, formatHint, opts = {}) => {
      const draft: StoredReference = {
        id: "", iri: opts.iri ?? "", origin, text, formatHint, fetchedAt: new Date().toISOString(),
        catalogId: opts.catalogId, name: opts.name, prefix: opts.prefix,
      };
      const probe = await parseRecord({ ...draft, id: "probe" });
      const iri = opts.iri || probe.ontologyIris[0] || origin;
      const existing = existingFor(iri, opts.catalogId, probe.ontologyIris);
      const record: StoredReference = {
        ...draft,
        id: existing?.id ?? crypto.randomUUID().slice(0, 8),
        iri: existing?.iri ?? iri,
        catalogId: opts.catalogId ?? existing?.catalogId,
        name: opts.name ?? existing?.name,
        prefix: opts.prefix ?? existing?.prefix,
        enabled: existing?.enabled,
      };
      const source = { ...probe, id: record.id, iri: record.iri, name: record.name || probe.name };
      await keep(record, source);
      return source;
    },

    fetchInto: async (url, opts) => {
      const outcome = await fetchOntology(url);
      if (!outcome.ok) return outcome;
      try {
        await get().addFromText(outcome.text, outcome.url, outcome.formatHint, opts);
        return outcome;
      } catch (err) {
        return { ok: false, url, reason: "not-rdf", message: err instanceof Error ? err.message : String(err) };
      }
    },

    addFromCatalog: async (entry) => {
      const opts: AddOptions = { iri: entry.ontologyIri, catalogId: entry.id, name: entry.name, prefix: entry.prefix };
      const failures: Extract<FetchOutcome, { ok: false }>[] = [];
      for (const url of entry.urls) {
        const outcome = await get().fetchInto(url, opts);
        if (outcome.ok) return outcome;
        failures.push(outcome);
      }
      const blocked = failures.every((f) => f.reason === "blocked");
      return {
        ok: false,
        url: entry.urls[0] ?? entry.homepage,
        reason: blocked ? "blocked" : failures[failures.length - 1]?.reason ?? "http",
        message: blocked
          ? "The server doesn't let browsers download it (CORS). Download the file from its homepage and load it here."
          : failures.map((f) => f.message).join("; "),
      };
    },

    update: async (id) => {
      const record = get().stored.find((r) => r.id === id);
      if (!record) return { ok: false, url: "", reason: "http", message: "Not in the library." };
      const entry = record.catalogId ? CATALOG.find((e) => e.id === record.catalogId) : undefined;
      if (entry && !isHttp(record.origin)) return get().addFromCatalog(entry);
      if (!isHttp(record.origin)) {
        return { ok: false, url: record.origin, reason: "http", message: "It was loaded from a file — load the new file to update it." };
      }
      const outcome = await get().fetchInto(record.origin, { iri: record.iri, catalogId: record.catalogId, name: record.name, prefix: record.prefix });
      return !outcome.ok && entry ? get().addFromCatalog(entry) : outcome;
    },

    setEnabled: async (id, enabled) => {
      const record = get().stored.find((r) => r.id === id);
      if (!record) return;
      const next = { ...record, enabled };
      // State first, so the switch responds immediately; then persist
      set((s) => ({ stored: s.stored.map((r) => (r.id === id ? next : r)) }));
      await saveReference(next).catch(() => undefined);
    },

    remove: async (id) => {
      await deleteReference(id).catch(() => undefined);
      set((s) => ({
        stored: s.stored.filter((r) => r.id !== id),
        sources: s.sources.filter((src) => src.id !== id),
      }));
    },

    importRecords: async (records) => {
      let added = 0;
      const failed: string[] = [];
      for (const record of records) {
        try {
          await get().addFromText(record.text, record.origin, record.formatHint, {
            iri: record.iri, catalogId: record.catalogId, name: record.name, prefix: record.prefix,
          });
          if (record.enabled === false) {
            const kept = existingFor(record.iri, record.catalogId, []);
            if (kept) await get().setEnabled(kept.id, false);
          }
          added++;
        } catch {
          failed.push(record.name || record.iri || record.origin);
        }
      }
      return { added, failed };
    },
  };
});

// ── Lookup across sources ────────────────────────────────────────────────

/** Library sources that are switched on, in the order they were added. */
export function enabledLibrarySources(stored: StoredReference[], sources: ReferenceSource[]): ReferenceSource[] {
  const off = new Set(stored.filter((r) => r.enabled === false).map((r) => r.id));
  return sources.filter((s) => !off.has(s.id));
}

/** The library entry that covers an owl:imports IRI, if any. */
export function libraryEntryFor(iri: string, stored: StoredReference[], sources: ReferenceSource[]) {
  const catalogId = CATALOG.find((e) => e.ontologyIri === iri)?.id;
  const record = stored.find((r) => r.iri === iri || (catalogId && r.catalogId === catalogId)
    || sources.find((s) => s.id === r.id)?.ontologyIris.includes(iri));
  const source = record && sources.find((s) => s.id === record.id);
  return record && source ? { record, source } : undefined;
}

export function isCatalogEntryInstalled(entry: CatalogEntry, stored: StoredReference[], sources: ReferenceSource[]): boolean {
  return stored.some((r) => r.catalogId === entry.id) || !!libraryEntryFor(entry.ontologyIri, stored, sources);
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
export function allSources(ontologies: Ontology[], activeId: string | null, library: ReferenceSource[]): ReferenceSource[] {
  return [...ontologies.filter((o) => o.id !== activeId).map(workspaceSource), ...library];
}
