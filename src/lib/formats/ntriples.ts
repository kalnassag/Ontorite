/**
 * N-Triples import and export, backed by the n3 library.
 */

import { Parser, Writer } from "n3";
import type { ParseResult } from "../../types";
import { quadToParsedTriple, type RdfQuad } from "./quad-utils";

export function parseNTriples(text: string): ParseResult {
  const parser = new Parser({ format: "N-Triples" });
  const triples: ParseResult["triples"] = [];
  const errors: ParseResult["errors"] = [];
  const blankNodes = new Set<string>();

  try {
    const quads = parser.parse(text) as unknown as RdfQuad[];
    for (const q of quads) {
      triples.push(quadToParsedTriple(q));
      if (q.subject.termType === "BlankNode") blankNodes.add(q.subject.value);
    }
  } catch (err) {
    errors.push({ message: (err as Error).message });
  }

  return {
    prefixes: {},
    baseUri: "",
    triples,
    errors,
    blankNodeCount: blankNodes.size,
  };
}

/**
 * Re-serialize a Turtle string into N-Triples by parsing with n3 and
 * writing the same quads back out in line-per-triple form.
 */
export function serializeNTriples(turtle: string, _prefixes: Record<string, string>): string {
  const parser = new Parser({ format: "Turtle" });
  const quads = parser.parse(turtle);
  const writer = new Writer({ format: "N-Triples" });
  writer.addQuads(quads);
  let out = "";
  writer.end((err, result) => {
    if (err) throw err;
    out = result;
  });
  return out;
}
