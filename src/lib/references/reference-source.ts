/**
 * Definitions of terms from other ontologies (owl:imports, dcterms, dcat, …).
 *
 * A ReferenceSource is any read-only collection of triples a term can be
 * looked up in: an ontology in the user's library (lib/references/catalog +
 * reference-store), or another ontology open in the workspace. Lookups are by subject IRI, so a term is
 * found wherever it's defined, whatever namespace / ontology IRI it uses
 * (gist's terms live in …/ns/ontology/gist/ but its ontology is …/ontology/gistCore).
 */

import type { ParsedTriple, UnmappedTriple } from "../../types";
import { STANDARD_PREFIXES } from "../uri-utils";
import { createNodeRenderer, createTermFormatter, formatBlock, formatLiteral } from "../turtle-format";
import { NS, RDF, RDFS, OWL } from "../vocab";

export type SourceKind = "reference" | "workspace";

export interface ReferenceSource {
  id: string;
  kind: SourceKind;
  /** Display name: the ontology's label, else its IRI / file name */
  name: string;
  /** The IRI the source stands for (owl:Ontology IRI, import IRI or namespace) */
  iri: string;
  /** Where it came from (URL or file name), for display */
  origin: string;
  /** Subjects typed owl:Ontology in it (to match owl:imports IRIs) */
  ontologyIris: string[];
  prefixes: Record<string, string>;
  /** Triples grouped by subject */
  bySubject: Map<string, ParsedTriple[]>;
  tripleCount: number;
}

export function buildSource(
  meta: { id: string; kind: SourceKind; iri: string; origin: string; name?: string },
  triples: ParsedTriple[],
  prefixes: Record<string, string>,
): ReferenceSource {
  const bySubject = new Map<string, ParsedTriple[]>();
  for (const t of triples) {
    const list = bySubject.get(t.s);
    if (list) list.push(t);
    else bySubject.set(t.s, [t]);
  }
  const ontologyIris = [...new Set(triples.filter((t) => t.p === RDF.type && t.o === OWL.Ontology && !t.s.startsWith("_:")).map((t) => t.s))];
  const ontologyLabel = ontologyIris[0] ? pickLiteral(bySubject.get(ontologyIris[0]) ?? [], LABEL_PREDICATES) : undefined;
  return {
    ...meta,
    ontologyIris,
    name: meta.name || ontologyLabel?.value || meta.iri || meta.origin,
    prefixes,
    bySubject,
    tripleCount: triples.length,
  };
}

/** The first source that says anything about `uri` as a subject. */
export function findDefinition(uri: string, sources: ReferenceSource[]): { source: ReferenceSource; triples: ParsedTriple[] } | null {
  for (const source of sources) {
    const triples = source.bySubject.get(uri);
    if (triples?.length) return { source, triples };
  }
  return null;
}

// ── Describing a term ──────────────────────────────────────────────────────

const LABEL_PREDICATES = [RDFS.label, NS.skos + "prefLabel", NS.dcterms + "title", "http://purl.org/dc/elements/1.1/title", "https://schema.org/name", "http://schema.org/name"];
const DESCRIPTION_PREDICATES = [RDFS.comment, NS.skos + "definition", NS.dcterms + "description", "http://purl.org/dc/elements/1.1/description", "https://schema.org/description", "http://schema.org/description"];

/** Best literal among predicates (in priority order), preferring English, then untagged. */
function pickLiteral(triples: ParsedTriple[], predicates: string[]): { value: string; lang?: string } | undefined {
  for (const predicate of predicates) {
    const values = triples.filter((t) => t.p === predicate && t.isLiteral);
    const best = values.find((t) => t.lang?.toLowerCase().startsWith("en")) ?? values.find((t) => !t.lang) ?? values[0];
    if (best) return { value: best.o, lang: best.lang };
  }
  return undefined;
}

export interface TermSummary {
  label?: string;
  description?: string;
  /** "Class", "Object property", … from rdf:type */
  kind?: string;
  facts: Array<[string, string[]]>;
}

const KIND_BY_TYPE: Record<string, string> = {
  [OWL.Class]: "Class",
  [RDFS.Class]: "Class",
  [OWL.ObjectProperty]: "Object property",
  [OWL.DatatypeProperty]: "Datatype property",
  [OWL.AnnotationProperty]: "Annotation property",
  [RDF.Property]: "Property",
  [OWL.NamedIndividual]: "Individual",
  [NS.rdfs + "Datatype"]: "Datatype",
};

/** Label, description, kind and IRI-valued facts (parents, domain, range) for the hover card. */
export function summarizeTerm(triples: ParsedTriple[]): TermSummary {
  const types = triples.filter((t) => t.p === RDF.type && !t.isLiteral).map((t) => t.o);
  const iris = (predicate: string) =>
    triples.filter((t) => t.p === predicate && !t.isLiteral && !t.o.startsWith("_:")).map((t) => t.o);
  const facts: Array<[string, string[]]> = [];
  for (const [label, predicate] of [
    ["Subclass of", RDFS.subClassOf],
    ["Subproperty of", RDFS.subPropertyOf],
    ["Domain", RDFS.domain],
    ["Range", RDFS.range],
    ["Disjoint with", OWL.disjointWith],
  ] as const) {
    const values = iris(predicate);
    if (values.length) facts.push([label, values]);
  }
  return {
    label: pickLiteral(triples, LABEL_PREDICATES)?.value,
    description: pickLiteral(triples, DESCRIPTION_PREDICATES)?.value,
    kind: types.map((t) => KIND_BY_TYPE[t]).find(Boolean),
    facts,
  };
}

/** Label for an IRI from the source it's defined in (for facts like "Subclass of gist:Category"). */
export function labelFor(uri: string, sources: ReferenceSource[]): string | undefined {
  const found = findDefinition(uri, sources);
  return found ? pickLiteral(found.triples, LABEL_PREDICATES)?.value : undefined;
}

// ── The definition as Turtle ───────────────────────────────────────────────

const toRaw = (t: ParsedTriple): UnmappedTriple => ({
  subject: t.s, predicate: t.p, object: t.o, isLiteral: t.isLiteral, lang: t.lang, datatype: t.datatype,
});

/**
 * Everything the source says about `uri`, as one Turtle block with nested
 * blank nodes (restrictions, intersections, lists) written inline, using the
 * source's own prefixes.
 */
export function formatDefinition(uri: string, source: ReferenceSource): string {
  const own = source.bySubject.get(uri) ?? [];
  // Collect the blank-node structures hanging off this term
  const nested: ParsedTriple[] = [];
  const seen = new Set<string>();
  const stack = own.filter((t) => !t.isLiteral && t.o.startsWith("_:")).map((t) => t.o);
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const t of source.bySubject.get(node) ?? []) {
      nested.push(t);
      if (!t.isLiteral && t.o.startsWith("_:")) stack.push(t.o);
    }
  }
  const refCount = new Map<string, number>();
  for (const t of [...own, ...nested]) if (!t.isLiteral) refCount.set(t.o, (refCount.get(t.o) ?? 0) + 1);
  const c = createTermFormatter({ ...STANDARD_PREFIXES, ...source.prefixes });
  const renderer = createNodeRenderer(nested.map(toRaw), refCount, c);
  return formatBlock(c(uri), own.map((t) => renderer.triplePair(toRaw(t)))).join("\n");
}

/** A literal as Turtle (exposed for UI that shows individual values). */
export const literalText = (t: ParsedTriple, prefixes: Record<string, string>) =>
  formatLiteral(t.o, t.datatype, t.lang, createTermFormatter({ ...STANDARD_PREFIXES, ...prefixes }));
