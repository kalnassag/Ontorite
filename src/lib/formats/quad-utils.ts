/**
 * Shared helpers for converting between RDF/JS quads (from n3, jsonld,
 * rdfxml-streaming-parser) and Ontorite's ParsedTriple shape.
 */

import type { ParsedTriple } from "../../types";

/** Minimal RDF/JS Term shape — works for n3 / rdfxml-streaming-parser / jsonld. */
export interface RdfTerm {
  termType: "NamedNode" | "BlankNode" | "Literal" | "Variable" | "DefaultGraph";
  value: string;
  language?: string;
  datatype?: RdfTerm;
}

export interface RdfQuad {
  subject: RdfTerm;
  predicate: RdfTerm;
  object: RdfTerm;
}

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const RDF_LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";

function termToSubjectOrPredicate(term: RdfTerm): string {
  if (term.termType === "BlankNode") return `_:${term.value}`;
  return term.value;
}

export function quadToParsedTriple(q: RdfQuad): ParsedTriple {
  const s = termToSubjectOrPredicate(q.subject);
  const p = termToSubjectOrPredicate(q.predicate);
  if (q.object.termType === "Literal") {
    const datatype = q.object.datatype?.value;
    const isPlain = !datatype || datatype === XSD_STRING || datatype === RDF_LANG_STRING;
    return {
      s,
      p,
      o: q.object.value,
      isLiteral: true,
      lang: q.object.language || undefined,
      datatype: isPlain ? undefined : datatype,
    };
  }
  return {
    s,
    p,
    o: termToSubjectOrPredicate(q.object),
    isLiteral: false,
  };
}
