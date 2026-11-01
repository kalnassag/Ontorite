/**
 * N-Triples import and export, backed by the n3 library.
 */

import { Parser, Writer } from "n3";
import type { ParseResult } from "../../types";
import { parseTurtle } from "../turtle-parser";

export function parseNTriples(text: string): ParseResult {
  const result = parseTurtle(text, "N-Triples");
  return { ...result, prefixes: {}, baseUri: "" };
}

/**
 * Re-serialize a Turtle string into N-Triples by parsing with n3 and
 * writing the same quads back out in line-per-triple form.
 */
export function serializeNTriples(turtle: string): string {
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
