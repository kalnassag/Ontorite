/**
 * Multi-format import/export pipeline for Ontorite.
 *
 * Strategy: each format parses to (or serializes from) a flat array of
 * `ParsedTriple` records — the same shape the hand-rolled Turtle parser
 * already emits. That lets `buildModelFromTriples` consume all formats
 * uniformly. For export, non-Turtle formats first run the existing
 * Turtle serializer, then re-parse with n3 to get a canonical triple
 * list, then hand to the target format.
 *
 * Each non-Turtle module is dynamically imported so the libraries are
 * not pulled into the main bundle until the user picks the format.
 */

import type { ParseResult, Ontology } from "../../types";
import { parseTurtle } from "../turtle-parser";
import { serializeToTurtle } from "../turtle-serializer";

export type SerializationFormat = "turtle" | "jsonld" | "rdfxml" | "ntriples";

export const FORMAT_LABEL: Record<SerializationFormat, string> = {
  turtle: "Turtle (.ttl)",
  jsonld: "JSON-LD (.jsonld)",
  rdfxml: "RDF/XML (.rdf)",
  ntriples: "N-Triples (.nt)",
};

export const FORMAT_EXTENSION: Record<SerializationFormat, string> = {
  turtle: "ttl",
  jsonld: "jsonld",
  rdfxml: "rdf",
  ntriples: "nt",
};

export const FORMAT_MIME: Record<SerializationFormat, string> = {
  turtle: "text/turtle",
  jsonld: "application/ld+json",
  rdfxml: "application/rdf+xml",
  ntriples: "application/n-triples",
};

/**
 * Best-effort format detection. Filename extension is preferred; falls
 * back to sniffing the first non-whitespace characters of the content.
 */
export function detectFormat(filename: string, content: string): SerializationFormat {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "ttl" || ext === "turtle") return "turtle";
  if (ext === "jsonld" || ext === "json") return "jsonld";
  if (ext === "rdf" || ext === "xml" || ext === "owl") return "rdfxml";
  if (ext === "nt" || ext === "ntriples") return "ntriples";

  const trimmed = content.trimStart();
  if (trimmed.startsWith("<?xml") || /^<rdf:RDF\b/i.test(trimmed)) return "rdfxml";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "jsonld";
  if (/^@(prefix|base)\b/i.test(trimmed) || /^PREFIX\s/i.test(trimmed)) return "turtle";
  // N-Triples lines look like `<subject> <predicate> <object> .`
  if (/^<[^>]+>\s+<[^>]+>\s+/m.test(trimmed)) return "ntriples";
  // Default: Turtle (most common)
  return "turtle";
}

/** Parse any supported format into the existing ParseResult shape. */
export async function parseToTriples(text: string, format: SerializationFormat): Promise<ParseResult> {
  switch (format) {
    case "turtle":
      return parseTurtle(text);
    case "ntriples": {
      const mod = await import("./ntriples");
      return mod.parseNTriples(text);
    }
    case "jsonld": {
      const mod = await import("./jsonld");
      return mod.parseJsonLd(text);
    }
    case "rdfxml": {
      const mod = await import("./rdfxml");
      return mod.parseRdfXml(text);
    }
  }
}

/** Serialize an ontology into the requested format. */
export async function serializeFromOntology(
  ontology: Ontology,
  format: SerializationFormat,
): Promise<string> {
  // Turtle is the source-of-truth serializer.
  const turtle = serializeToTurtle(ontology);
  if (format === "turtle") return turtle;

  switch (format) {
    case "ntriples": {
      const mod = await import("./ntriples");
      return mod.serializeNTriples(turtle, ontology.metadata.prefixes);
    }
    case "jsonld": {
      const mod = await import("./jsonld");
      return mod.serializeJsonLd(turtle, ontology.metadata.prefixes);
    }
    case "rdfxml": {
      const mod = await import("./rdfxml");
      return mod.serializeRdfXml(turtle, ontology.metadata.prefixes);
    }
  }
}
