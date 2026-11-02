/**
 * Parse small pieces of Turtle typed into the editor, using the ontology's
 * prefixes. Two shapes:
 *  - a predicate–object list about one entity ("rdfs:subClassOf [ … ] ;
 *    skos:note "x"") → that entity's extra triples
 *  - complete statements ("<s> <p> <o> .") → raw triples
 *
 * Blank nodes get fresh labels so they can't collide with existing ones.
 * Errors report line numbers relative to the user's text.
 */

import type { ExtraTriple, Ontology, UnmappedTriple } from "../types";
import { KEPT_LABEL_PREFIX, parseTurtle } from "./turtle-parser";
import { STANDARD_PREFIXES } from "./uri-utils";
import { attachBlankNodeClosures, freshBlankNodeLabel } from "./raw-triples";

const THIS = "urn:ontorite:this";

export type SnippetResult<T> = { ok: true; value: T } | { ok: false; error: string };

function prefixHeader(prefixes: Record<string, string>): string[] {
  return Object.entries({ ...STANDARD_PREFIXES, ...prefixes }).map(([p, ns]) => `@prefix ${p}: <${ns}> .`);
}

function parseWithPrefixes(body: string, prefixes: Record<string, string>): SnippetResult<UnmappedTriple[]> {
  const header = prefixHeader(prefixes);
  const parsed = parseTurtle([...header, body].join("\n"), "Turtle", { keepBlankNodeLabels: true });
  if (parsed.errors.length > 0) {
    const err = parsed.errors[0]!;
    const line = err.line !== undefined ? err.line - header.length : undefined;
    return { ok: false, error: line !== undefined && line > 0 ? `Line ${line}: ${err.message}` : err.message };
  }
  // Explicit labels (`_:b12`) are references to existing blank nodes — keep
  // them. Anonymous ones (`[ … ]`, `( … )`) are new — give them fresh labels.
  const kept = `_:${KEPT_LABEL_PREFIX}`;
  const fresh = new Map<string, string>();
  const relabel = (term: string) => {
    if (!term.startsWith("_:")) return term;
    if (term.startsWith(kept)) return `_:${term.slice(kept.length)}`;
    let label = fresh.get(term);
    if (!label) fresh.set(term, (label = freshBlankNodeLabel()));
    return label;
  };
  return {
    ok: true,
    value: parsed.triples.map((t) => ({
      subject: relabel(t.s), predicate: t.p, object: t.isLiteral ? t.o : relabel(t.o),
      isLiteral: t.isLiteral, lang: t.lang, datatype: t.datatype,
    })),
  };
}

/**
 * A predicate–object list about one entity, e.g.
 * `rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:qualifiedCardinality 2 ; owl:onClass :C ]`.
 * Blank-node values must be written inline (each used once).
 */
export function parsePredicateObjectList(text: string, prefixes: Record<string, string>): SnippetResult<ExtraTriple[]> {
  const body = text.trim().replace(/\s*[.;]\s*$/, "");
  if (!body) return { ok: true, value: [] };
  // Keep the user's first line on its own line so error line numbers line up
  const parsed = parseWithPrefixes(`<${THIS}>\n${body} .`, prefixes);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error.replace(/^Line (\d+)/, (_, n) => `Line ${Number(n) - 1}`) };
  }
  const own = parsed.value.filter((t) => t.subject === THIS);
  const rest = parsed.value.filter((t) => t.subject !== THIS);
  if (rest.some((t) => !t.subject.startsWith("_:"))) {
    return { ok: false, error: "Only statements about this entity can go here — use Other statements for other subjects." };
  }
  if (parsed.value.some((t) => !t.isLiteral && t.object === THIS)) {
    return { ok: false, error: "Refer to this entity by its IRI." };
  }
  // Reuse the ownership rules: every blank node must hang off exactly one statement
  const shell: Ontology = {
    id: "", createdAt: "", updatedAt: "", classes: [], properties: [], individuals: [],
    metadata: {
      baseUri: "", ontologyUri: "", ontologyLabel: "", ontologyComment: "", versionIRI: "", versionInfo: "",
      imports: [], editorialNotes: [], prefixes: {}, defaultLanguage: "",
      extraTriples: own.map(({ predicate, object, isLiteral, lang, datatype }) => ({ predicate, object, isLiteral, lang, datatype })),
    },
    unmappedTriples: rest,
  };
  const attached = attachBlankNodeClosures(shell);
  if (attached.unmappedTriples.length > 0) {
    return { ok: false, error: "Each blank node must be used once, written inline as [ … ] or ( … )." };
  }
  return { ok: true, value: attached.metadata.extraTriples };
}

/** Complete Turtle statements (subjects included). */
export function parseStatements(text: string, prefixes: Record<string, string>): SnippetResult<UnmappedTriple[]> {
  if (!text.trim()) return { ok: true, value: [] };
  return parseWithPrefixes(text, prefixes);
}
