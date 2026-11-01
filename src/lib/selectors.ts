/**
 * Pure, memo-friendly derivations over an Ontology. Components wrap these in
 * useMemo keyed on the ontology (or its arrays) — never recompute per render.
 */

import type { Ontology, OntologyClass, OntologyProperty } from "../types";

/** Class URIs named by a property's domain (empty when unassigned). */
export function domainUris(prop: OntologyProperty): string[] {
  if (prop.domain.kind === "class") return prop.domain.uri ? [prop.domain.uri] : [];
  return prop.domain.uris.filter(Boolean);
}

export function hasDomain(prop: OntologyProperty): boolean {
  return domainUris(prop).length > 0;
}

export function classesByUri(onto: Ontology): Map<string, OntologyClass> {
  return new Map(onto.classes.map((cls) => [cls.uri, cls]));
}

/** class id → properties whose domain includes that class. */
export function propertiesByDomain(onto: Ontology): Map<string, OntologyProperty[]> {
  const byUri = classesByUri(onto);
  const map = new Map<string, OntologyProperty[]>(onto.classes.map((cls) => [cls.id, []]));
  for (const prop of onto.properties) {
    for (const uri of domainUris(prop)) {
      const cls = byUri.get(uri);
      if (cls) map.get(cls.id)!.push(prop);
    }
  }
  return map;
}

/** Properties with no domain, or whose domain names no class in this ontology. */
export function unassignedProperties(onto: Ontology): OntologyProperty[] {
  const classUris = new Set(onto.classes.map((cls) => cls.uri));
  return onto.properties.filter((prop) => !domainUris(prop).some((uri) => classUris.has(uri)));
}
