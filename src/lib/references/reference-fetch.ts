/**
 * Fetching external ontologies in the browser.
 *
 * There's no backend, so a server must allow cross-origin reads (CORS) for a
 * fetch to work; many ontology servers don't. Failures are classified so the
 * UI can offer the right fallback (load the file or another URL yourself).
 */

import type { ParseResult } from "../../types";
import { detectFormat, parseToTriples, type SerializationFormat } from "../formats";
import { namespace } from "../uri-utils";

const ACCEPT = "text/turtle, application/rdf+xml;q=0.9, application/ld+json;q=0.8, application/n-triples;q=0.7, */*;q=0.1";

export type FetchOutcome =
  | { ok: true; text: string; url: string; formatHint: string }
  | { ok: false; url: string; reason: "blocked" | "http" | "not-rdf"; message: string };

/**
 * URLs worth trying for a term, most specific first: the active ontology's
 * owl:imports (a term's namespace often isn't its ontology's address — gist's
 * terms are under …/ns/ontology/gist/ but it imports as …/ontology/gistCore),
 * then the term's own namespace document.
 */
export function candidateUrls(termUri: string, imports: string[]): string[] {
  const ns = namespace(termUri);
  const nsDoc = ns.endsWith("#") ? ns.slice(0, -1) : ns;
  const urls = [...imports, nsDoc, ns].filter((u) => /^https?:\/\//i.test(u));
  return [...new Set(urls)];
}

export async function fetchOntology(url: string): Promise<FetchOutcome> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: ACCEPT }, redirect: "follow" });
  } catch {
    return {
      ok: false, url, reason: "blocked",
      message: "The server didn't let the browser read it (no CORS permission), or it's unreachable.",
    };
  }
  if (!response.ok) {
    return { ok: false, url, reason: "http", message: `HTTP ${response.status} ${response.statusText}`.trim() };
  }
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (/text\/html/i.test(contentType) || /^\s*<!doctype html|^\s*<html/i.test(text)) {
    return { ok: false, url, reason: "not-rdf", message: "It returned a web page, not an ontology file." };
  }
  return { ok: true, text, url: response.url || url, formatHint: formatHintFor(response.url || url, contentType) };
}

/** A "file name" for format detection: the URL, with an extension implied by the content type. */
function formatHintFor(url: string, contentType: string): string {
  if (/turtle/i.test(contentType)) return "source.ttl";
  if (/rdf\+xml|application\/xml|text\/xml/i.test(contentType)) return "source.rdf";
  if (/ld\+json|application\/json/i.test(contentType)) return "source.jsonld";
  if (/n-triples/i.test(contentType)) return "source.nt";
  return url;
}

/** Parse fetched or loaded text in whatever RDF format it's in. */
export async function parseReference(text: string, formatHint: string): Promise<{ parsed: ParseResult; format: SerializationFormat }> {
  const format = detectFormat(formatHint, text);
  return { parsed: await parseToTriples(text, format), format };
}
