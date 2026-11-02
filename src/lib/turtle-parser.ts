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

/** Prefix N3 puts on explicitly written blank-node labels when asked to keep them. */
export const KEPT_LABEL_PREFIX = "keep_";

/**
 * @param keepBlankNodeLabels For editor snippets: explicit labels (`_:x`) come
 *   back as `_:keep_x` and generated ones (`[]`) as `_:n3-N`, so the caller can
 *   preserve references to existing blank nodes. Otherwise all blank nodes are
 *   relabelled `_:b0…` per document.
 */
export function parseTurtle(
  input: string,
  format: "Turtle" | "N-Triples" = "Turtle",
  { keepBlankNodeLabels = false } = {},
): ParseResult {
  const prefixes: Record<string, string> = {};
  const errors: ParseError[] = [];
  let triples: ParseResult["triples"] = [];

  try {
    const parser = new Parser(keepBlankNodeLabels ? { format, blankNodePrefix: KEPT_LABEL_PREFIX } : { format });
    const quads = parser.parse(input, null, (prefix, iri) => {
      prefixes[prefix] = iri.value;
    }) as unknown as RdfQuad[];
    const mapped = quads.map(quadToParsedTriple);
    triples = keepBlankNodeLabels ? mapped : relabelBlankNodes(mapped);
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
