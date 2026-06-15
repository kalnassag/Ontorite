/**
 * JSON-LD import and export.
 *
 * Import: jsonld.toRDF() yields RDF/JS-shaped datasets, which we map
 * straight into ParsedTriple records.
 *
 * Export: serialize the ontology to Turtle first, parse with n3 to get
 * a canonical quad list, write to N-Quads, then jsonld.fromRDF() turns
 * it into a JSON-LD document. We then compact against the ontology's
 * own prefix map for human-readable output.
 */

import jsonld from "jsonld";
import { Parser, Writer } from "n3";
import type { ParseResult } from "../../types";
import { quadToParsedTriple, type RdfQuad } from "./quad-utils";

interface JsonLdRdfDataset {
  subject: { termType: string; value: string };
  predicate: { termType: string; value: string };
  object: { termType: string; value: string; language?: string; datatype?: { termType: string; value: string } };
}

export async function parseJsonLd(text: string): Promise<ParseResult> {
  const triples: ParseResult["triples"] = [];
  const errors: ParseResult["errors"] = [];
  const blankNodes = new Set<string>();

  try {
    const doc = JSON.parse(text);
    const dataset = (await jsonld.toRDF(doc, { format: undefined })) as unknown as JsonLdRdfDataset[];
    for (const q of dataset) {
      const quad: RdfQuad = {
        subject: q.subject as RdfQuad["subject"],
        predicate: q.predicate as RdfQuad["predicate"],
        object: q.object as RdfQuad["object"],
      };
      triples.push(quadToParsedTriple(quad));
      if (q.subject.termType === "BlankNode") blankNodes.add(q.subject.value);
    }

    // Best-effort prefix extraction from the top-level @context
    const prefixes: Record<string, string> = {};
    const ctx = (doc as { "@context"?: unknown })["@context"];
    if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
      for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
        if (typeof v === "string") prefixes[k] = v;
      }
    }

    return {
      prefixes,
      baseUri: "",
      triples,
      errors,
      blankNodeCount: blankNodes.size,
    };
  } catch (err) {
    errors.push({ message: (err as Error).message });
    return { prefixes: {}, baseUri: "", triples, errors, blankNodeCount: blankNodes.size };
  }
}

export async function serializeJsonLd(turtle: string, prefixes: Record<string, string>): Promise<string> {
  // Turtle → N-Quads → JSON-LD
  const parser = new Parser({ format: "Turtle" });
  const quads = parser.parse(turtle);
  const writer = new Writer({ format: "N-Quads" });
  writer.addQuads(quads);
  const nquads: string = await new Promise((resolve, reject) => {
    writer.end((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  const expanded = await jsonld.fromRDF(nquads, { format: "application/n-quads" });
  // Compact against the ontology's prefix map for readability
  const context: Record<string, string> = { ...prefixes };
  const compacted = await jsonld.compact(expanded, context);
  return JSON.stringify(compacted, null, 2);
}
