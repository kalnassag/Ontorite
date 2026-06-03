/**
 * URI manipulation utilities for ontology editing.
 *
 * Core operations:
 * - compact: full URI → prefixed name (e.g., "http://example.org/Dog" → "ex:Dog")
 * - expand: prefixed name → full URI
 * - localName: extract fragment/final segment from URI
 * - buildUri: baseUri + localName → full URI
 * - toPascalCase / toCamelCase: label → local name conventions
 */

/** Extract the local name from a full URI (after # or last /) */
export function localName(uri: string): string {
  const hashIdx = uri.lastIndexOf("#");
  if (hashIdx >= 0) return uri.slice(hashIdx + 1);
  const slashIdx = uri.lastIndexOf("/");
  if (slashIdx >= 0) return uri.slice(slashIdx + 1);
  return uri;
}

/** Extract the namespace from a full URI (everything up to and including # or last /) */
export function namespace(uri: string): string {
  const hashIdx = uri.lastIndexOf("#");
  if (hashIdx >= 0) return uri.slice(0, hashIdx + 1);
  const slashIdx = uri.lastIndexOf("/");
  if (slashIdx >= 0) return uri.slice(0, slashIdx + 1);
  return "";
}

/** Compact a full URI to prefixed form using a prefix map. Returns <uri> if no prefix matches. */
export function compact(uri: string, prefixes: Record<string, string>): string {
  if (uri.startsWith("_:")) return uri; // blank node — never wrap in angle brackets
  for (const [prefix, ns] of Object.entries(prefixes)) {
    if (uri.startsWith(ns)) {
      const local = uri.slice(ns.length);
      return prefix ? `${prefix}:${local}` : `:${local}`;
    }
  }
  return `<${uri}>`;
}

/** Expand a prefixed name to a full URI. Returns the input unchanged if prefix not found. */
export function expand(prefixed: string, prefixes: Record<string, string>): string {
  if (prefixed.startsWith("<") && prefixed.endsWith(">")) {
    return prefixed.slice(1, -1);
  }
  const colonIdx = prefixed.indexOf(":");
  if (colonIdx >= 0) {
    const prefix = prefixed.slice(0, colonIdx);
    const local = prefixed.slice(colonIdx + 1);
    const ns = prefixes[prefix];
    if (ns) return ns + local;
  }
  return prefixed;
}

/** Build a full URI from base URI and local name */
export function buildUri(baseUri: string, localNameStr: string): string {
  // Ensure base ends with # or /
  if (!baseUri.endsWith("#") && !baseUri.endsWith("/")) {
    baseUri += "#";
  }
  return baseUri + localNameStr;
}

/** Convert a label string to PascalCase (for class local names) */
export function toPascalCase(label: string): string {
  return label
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/** Convert a label string to camelCase (for property local names) */
export function toCamelCase(label: string): string {
  const pascal = toPascalCase(label);
  if (!pascal) return "";
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** Well-known XSD datatype URIs */
export const XSD_TYPES: Record<string, string> = {
  "xsd:string": "http://www.w3.org/2001/XMLSchema#string",
  "xsd:boolean": "http://www.w3.org/2001/XMLSchema#boolean",
  "xsd:integer": "http://www.w3.org/2001/XMLSchema#integer",
  "xsd:decimal": "http://www.w3.org/2001/XMLSchema#decimal",
  "xsd:float": "http://www.w3.org/2001/XMLSchema#float",
  "xsd:double": "http://www.w3.org/2001/XMLSchema#double",
  "xsd:date": "http://www.w3.org/2001/XMLSchema#date",
  "xsd:dateTime": "http://www.w3.org/2001/XMLSchema#dateTime",
  "xsd:time": "http://www.w3.org/2001/XMLSchema#time",
  "xsd:gYear": "http://www.w3.org/2001/XMLSchema#gYear",
  "xsd:anyURI": "http://www.w3.org/2001/XMLSchema#anyURI",
  "xsd:nonNegativeInteger": "http://www.w3.org/2001/XMLSchema#nonNegativeInteger",
  "xsd:positiveInteger": "http://www.w3.org/2001/XMLSchema#positiveInteger",
  "xsd:language": "http://www.w3.org/2001/XMLSchema#language",
};

/** Standard prefixes that every ontology should include */
export const STANDARD_PREFIXES: Record<string, string> = {
  owl: "http://www.w3.org/2002/07/owl#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dcterms: "http://purl.org/dc/terms/",
};
