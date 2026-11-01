/**
 * Turtle (.ttl) parser — a thin adapter over N3.js.
 *
 * Input:  raw Turtle text
 * Output: ParseResult { prefixes, baseUri, triples, errors }
 *
 * N3.js is spec-complete (numeric/boolean shorthand, single-quoted strings,
 * relative IRIs, escapes, blank nodes, collections) and reports the line of
 * the first syntax error. Parsing is strict: on a syntax error no triples are
 * returned, so a half-parsed file can never be auto-saved back over the
 * original.
 */

import { Parser } from "n3";
import type { ParseResult, ParseError } from "../types";
import { quadToParsedTriple, relabelBlankNodes, type RdfQuad } from "./formats/quad-utils";

/** First `@base` / `BASE` declaration in the document, if any. */
function findBase(text: string): string {
  const m = /^\s*(?:@base|BASE)\s*<([^>]*)>/im.exec(text);
  return m?.[1] ?? "";
}

export function parseTurtle(input: string, format: "Turtle" | "N-Triples" = "Turtle"): ParseResult {
  const prefixes: Record<string, string> = {};
  const errors: ParseError[] = [];
  let triples: ParseResult["triples"] = [];

  try {
    const parser = new Parser({ format });
    const quads = parser.parse(input, null, (prefix, iri) => {
      prefixes[prefix] = iri.value;
    }) as unknown as RdfQuad[];
    triples = relabelBlankNodes(quads.map(quadToParsedTriple));
  } catch (err) {
    const e = err as Error & { context?: { line?: number } };
    errors.push({
      line: e.context?.line,
      // N3 appends "on line N." — strip it since we report the line separately
      message: e.message.replace(/\s+on line \d+\.?$/, ""),
    });
  }

  return { prefixes, baseUri: findBase(input), triples, errors };
}
