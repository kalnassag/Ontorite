/**
 * Finding a term that isn't in the library yet: try the active ontology's
 * owl:imports, the catalogue entry for the term's namespace, then the
 * namespace document, adding what's downloaded to the library.
 */

import { findDefinition } from "./reference-source";
import { namespaceUrls, type FetchOutcome } from "./reference-fetch";
import { catalogEntryFor, type CatalogEntry } from "./catalog";
import { isCatalogEntryInstalled, isHttp, libraryEntryFor, useReferences } from "./reference-store";

export interface ResolveStep {
  url: string;
  outcome: "found" | "fetched-not-here" | "blocked" | "http" | "not-rdf" | "already-cached";
  message?: string;
}

/**
 * Try, in order: the active ontology's owl:imports, the catalogue entry for
 * the term's namespace, then the namespace document itself — adding each
 * ontology downloaded to the library — until one defines the term. Reports
 * every step so the UI can explain what happened and offer a manual load.
 */
export async function resolveTerm(termUri: string, imports: string[], onStep: (step: ResolveStep) => void): Promise<boolean> {
  const state = () => useReferences.getState();
  const attempts: Array<{ url: string; inLibrary: () => boolean; run: () => Promise<FetchOutcome> }> = [];
  const seenEntries = new Set<string>();
  const addEntry = (entry: CatalogEntry, url: string) => {
    if (seenEntries.has(entry.id)) return;
    seenEntries.add(entry.id);
    attempts.push({
      url,
      inLibrary: () => isCatalogEntryInstalled(entry, state().stored, state().sources),
      run: () => state().addFromCatalog(entry),
    });
  };

  for (const iri of imports.filter(isHttp)) {
    const entry = catalogEntryFor(iri);
    if (entry) addEntry(entry, iri);
    else attempts.push({ url: iri, inLibrary: () => !!libraryEntryFor(iri, state().stored, state().sources), run: () => state().fetchInto(iri, { iri }) });
  }
  const termEntry = catalogEntryFor(termUri);
  if (termEntry) addEntry(termEntry, termEntry.urls[0] ?? termEntry.homepage);
  for (const url of namespaceUrls(termUri)) {
    if (attempts.some((a) => a.url === url)) continue;
    attempts.push({ url, inLibrary: () => state().stored.some((r) => r.iri === url || r.origin === url), run: () => state().fetchInto(url) });
  }

  for (const attempt of attempts) {
    if (attempt.inLibrary()) {
      onStep({ url: attempt.url, outcome: "already-cached" });
      continue;
    }
    const outcome = await attempt.run();
    if (!outcome.ok) {
      onStep({ url: attempt.url, outcome: outcome.reason, message: outcome.message });
      continue;
    }
    const found = findDefinition(termUri, state().sources);
    onStep({ url: outcome.url, outcome: found ? "found" : "fetched-not-here" });
    if (found) return true;
  }
  return false;
}
