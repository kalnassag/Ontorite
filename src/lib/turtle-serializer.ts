/**
 * Serializes an Ontology to valid Turtle (.ttl) format.
 */

import type { Ontology, OntologyClass, OntologyProperty, LangString, Individual, ClassExpression } from "../types";
import { compact, STANDARD_PREFIXES } from "./uri-utils";

const RDF_FIRST       = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";
const RDF_REST        = "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest";
const RDF_NIL         = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil";
const OWL_UNION       = "http://www.w3.org/2002/07/owl#unionOf";
const OWL_VERSION_IRI  = "http://www.w3.org/2002/07/owl#versionIRI";
const OWL_VERSION_INFO = "http://www.w3.org/2002/07/owl#versionInfo";
const SKOS_EDITORIAL  = "http://www.w3.org/2004/02/skos/core#editorialNote";
const DCT_CREATED     = "http://purl.org/dc/terms/created";
const DCT_MODIFIED    = "http://purl.org/dc/terms/modified";

export function serializeToTurtle(ontology: Ontology): string {
  const lines: string[] = [];
  const prefixes = { ...STANDARD_PREFIXES, ...ontology.metadata.prefixes };

  // Compact a URI using the merged prefix map
  const c = (uri: string): string => compact(uri, prefixes);

  // Escape a string literal value
  const escLit = (value: string): string =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");

  // Serialize a language-tagged literal
  const langLit = (ls: LangString): string =>
    ls.lang
      ? `"${escLit(ls.value)}"@${ls.lang}`
      : `"${escLit(ls.value)}"`;

  // Serialize a typed literal (for datatype properties — used in unmapped triples)
  const typedLit = (value: string, datatype?: string, lang?: string): string => {
    if (lang) return `"${escLit(value)}"@${lang}`;
    if (datatype) return `"${escLit(value)}"^^${c(datatype)}`;
    return `"${escLit(value)}"`;
  };

  // Build predicate-object pairs for a subject block.
  // Conventional Turtle style: ";" at end of each predicate line, "." closing
  // the last one. The caller prepends the subject to blockLines[0].
  const buildBlock = (pairs: Array<[string, string]>): string[] => {
    if (pairs.length === 0) return [];
    if (pairs.length === 1) return [`${pairs[0]![0]} ${pairs[0]![1]} .`];
    const blockLines: string[] = [];
    blockLines.push(`${pairs[0]![0]} ${pairs[0]![1]} ;`);
    for (let i = 1; i < pairs.length - 1; i++) {
      blockLines.push(`    ${pairs[i]![0]} ${pairs[i]![1]} ;`);
    }
    const last = pairs[pairs.length - 1]!;
    blockLines.push(`    ${last[0]} ${last[1]} .`);
    return blockLines;
  };

  // ── RDF list reconstruction ────────────────────────────────────────────────
  // Build a map of list-head blank node → ordered member URIs from unmapped triples.
  // This lets us reconstruct owl:unionOf ( A B ) collection syntax on write.
  const firstMap = new Map<string, string>(); // list-node URI → rdf:first value
  const restMap  = new Map<string, string>(); // list-node URI → rdf:rest value
  for (const t of ontology.unmappedTriples) {
    if (!t.isLiteral) {
      if (t.predicate === RDF_FIRST) firstMap.set(t.subject, t.object);
      if (t.predicate === RDF_REST)  restMap.set(t.subject, t.object);
    }
  }
  // All blank nodes that are list cells — skip them in the unmapped-triples section
  const listNodes = new Set<string>([...firstMap.keys(), ...restMap.keys()]);

  const resolveList = (head: string): string[] | null => {
    if (!firstMap.has(head)) return null;
    const members: string[] = [];
    const seen = new Set<string>();
    let cur = head;
    while (cur !== RDF_NIL) {
      if (seen.has(cur)) break; // cycle guard
      seen.add(cur);
      const member = firstMap.get(cur);
      if (member === undefined) break;
      members.push(member);
      cur = restMap.get(cur) ?? RDF_NIL;
    }
    return members.length > 0 ? members : null;
  };

  // Legacy: inline any blank-node union class expressions stored as a class
  // with an `owl:unionOf` extraTriple. New ontologies use ClassExpression on
  // properties and never produce blank-node class entries, but we keep this
  // for back-compat with anything that didn't go through migration yet.
  const serializeRef = (uri: string): string => {
    if (uri.startsWith("_:")) {
      const bnClass = ontology.classes.find((cls) => cls.uri === uri);
      if (bnClass) {
        const unionEt = bnClass.extraTriples.find(
          (et) => !et.isLiteral && et.predicate === OWL_UNION
        );
        if (unionEt) {
          const members = resolveList(unionEt.object);
          if (members && members.length > 0) {
            return `[ a owl:Class ; owl:unionOf ( ${members.map(c).join(" ")} ) ]`;
          }
        }
      }
    }
    return c(uri);
  };

  /** Serialize a ClassExpression (domain or range). */
  const serializeClassExpr = (expr: ClassExpression): string => {
    if (expr.kind === "class") return serializeRef(expr.uri);
    if (expr.uris.length === 1) return serializeRef(expr.uris[0]!);
    return `[ a owl:Class ; owl:unionOf ( ${expr.uris.map(c).join(" ")} ) ]`;
  };

  /** Does a ClassExpression have at least one non-empty URI? */
  const classExprNonEmpty = (expr: ClassExpression): boolean => {
    if (expr.kind === "class") return !!expr.uri;
    return expr.uris.some((u) => !!u);
  };

  // ── 1. @prefix declarations ─────────────────────────────────────────────
  for (const [prefix, uri] of Object.entries(prefixes).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`@prefix ${prefix}: <${uri}> .`);
  }
  lines.push("");

  // ── 2. owl:Ontology declaration ─────────────────────────────────────────
  const { ontologyUri, ontologyLabel, ontologyComment, versionIRI, versionInfo } = ontology.metadata;
  const ontoEditorialNotes = ontology.metadata.editorialNotes ?? [];
  if (ontologyUri) {
    const ontoPairs: Array<[string, string]> = [["a", "owl:Ontology"]];
    if (ontologyLabel) ontoPairs.push(["rdfs:label", `"${escLit(ontologyLabel)}"`]);
    if (ontologyComment) ontoPairs.push(["rdfs:comment", `"${escLit(ontologyComment)}"`]);
    if (versionIRI) ontoPairs.push(["owl:versionIRI", c(versionIRI)]);
    if (versionInfo) ontoPairs.push(["owl:versionInfo", `"${escLit(versionInfo)}"`]);
    for (const note of ontoEditorialNotes.filter((n) => n.value)) {
      ontoPairs.push(["skos:editorialNote", langLit(note)]);
    }
    if (ontology.metadata.created) {
      ontoPairs.push(["dcterms:created", `"${escLit(ontology.metadata.created)}"^^xsd:dateTime`]);
    }
    if (ontology.metadata.modified) {
      ontoPairs.push(["dcterms:modified", `"${escLit(ontology.metadata.modified)}"^^xsd:dateTime`]);
    }
    const ontoBlock = buildBlock(ontoPairs);
    lines.push(`${c(ontologyUri)} ${ontoBlock[0]!}`);
    for (let i = 1; i < ontoBlock.length; i++) lines.push(ontoBlock[i]!);
    lines.push("");
  }

  // ── 3. Classes ────────────────────────────────────────────────────────────
  const sortedClasses = [...ontology.classes].sort((a, b) =>
    a.localName.localeCompare(b.localName)
  );

  if (sortedClasses.length > 0) {
    lines.push("# ── Classes ─────────────────────────────────────────────────────────────");
    lines.push("");
    for (const cls of sortedClasses) {
      if (cls.uri.startsWith("_:")) continue; // anonymous class expression — inlined at point of use
      serializeClass(cls);
    }
  }

  // ── 4. Properties (grouped by type) ───────────────────────────────────────
  const objProps = sortedProps("owl:ObjectProperty");
  const datProps = sortedProps("owl:DatatypeProperty");
  const annProps = sortedProps("owl:AnnotationProperty");

  if (objProps.length > 0) {
    lines.push("# ── Object Properties ───────────────────────────────────────────────────");
    lines.push("");
    for (const prop of objProps) serializeProperty(prop);
  }
  if (datProps.length > 0) {
    lines.push("# ── Datatype Properties ─────────────────────────────────────────────────");
    lines.push("");
    for (const prop of datProps) serializeProperty(prop);
  }
  if (annProps.length > 0) {
    lines.push("# ── Annotation Properties ───────────────────────────────────────────────");
    lines.push("");
    for (const prop of annProps) serializeProperty(prop);
  }

  // ── 5. Individuals ────────────────────────────────────────────────────────
  const sortedIndividuals = [...(ontology.individuals ?? [])].sort((a, b) =>
    a.localName.localeCompare(b.localName)
  );

  if (sortedIndividuals.length > 0) {
    lines.push("# ── Individuals ─────────────────────────────────────────────────────────");
    lines.push("");
    for (const ind of sortedIndividuals) {
      serializeIndividual(ind);
    }
  }

  // ── 6. Unmapped triples ───────────────────────────────────────────────────
  // Filter out anything that's now emitted from a dedicated typed field, so we
  // never produce duplicates from migrated or freshly-imported ontologies.
  const visibleUnmapped = ontology.unmappedTriples.filter((t) => {
    if (listNodes.has(t.subject)) return false; // list cells inlined above
    if (t.predicate === SKOS_EDITORIAL) return false;
    if (t.predicate === DCT_CREATED || t.predicate === DCT_MODIFIED) return false;
    if (
      ontology.metadata.ontologyUri &&
      t.subject === ontology.metadata.ontologyUri &&
      (t.predicate === OWL_VERSION_IRI || t.predicate === OWL_VERSION_INFO)
    ) return false;
    return true;
  });
  if (visibleUnmapped.length > 0) {
    lines.push("# ── Preserved triples ────────────────────────────────────────────────────");
    lines.push("");
    for (const t of visibleUnmapped) {
      let obj: string;
      if (t.isLiteral) {
        obj = typedLit(t.object, t.datatype, t.lang);
      } else {
        const members = resolveList(t.object);
        obj = members ? `( ${members.map(c).join(" ")} )` : c(t.object);
      }
      lines.push(`${c(t.subject)} ${c(t.predicate)} ${obj} .`);
    }
    lines.push("");
  }

  return lines.join("\n");

  // ── Helpers ───────────────────────────────────────────────────────────────

  function serializeExtraTriples(extras: Array<{ predicate: string; object: string; isLiteral: boolean; lang?: string; datatype?: string }>, pairs: Array<[string, string]>) {
    for (const et of extras) {
      // Predicates emitted from dedicated typed fields are filtered to prevent duplicates
      if (et.predicate === SKOS_EDITORIAL) continue;
      if (et.predicate === DCT_CREATED) continue;
      if (et.predicate === DCT_MODIFIED) continue;
      let obj: string;
      if (et.isLiteral) {
        obj = typedLit(et.object, et.datatype, et.lang);
      } else {
        // If the object is a list head, emit as a Turtle collection ( A B … )
        const members = resolveList(et.object);
        obj = members ? `( ${members.map(c).join(" ")} )` : serializeRef(et.object);
      }
      pairs.push([c(et.predicate), obj]);
    }
  }

  function serializeClass(cls: OntologyClass) {
    const pairs: Array<[string, string]> = [["a", "owl:Class"]];
    for (const lbl of cls.labels.filter((l) => l.value)) {
      pairs.push(["rdfs:label", langLit(lbl)]);
    }
    for (const desc of cls.descriptions.filter((d) => d.value)) {
      pairs.push(["rdfs:comment", langLit(desc)]);
    }
    for (const note of (cls.editorialNotes ?? []).filter((n) => n.value)) {
      pairs.push(["skos:editorialNote", langLit(note)]);
    }
    if (cls.created) pairs.push(["dcterms:created", `"${escLit(cls.created)}"^^xsd:dateTime`]);
    if (cls.modified) pairs.push(["dcterms:modified", `"${escLit(cls.modified)}"^^xsd:dateTime`]);
    for (const parentUri of cls.subClassOf) {
      pairs.push(["rdfs:subClassOf", serializeRef(parentUri)]);
    }
    for (const disjUri of cls.disjointWith ?? []) {
      pairs.push(["owl:disjointWith", serializeRef(disjUri)]);
    }
    for (const r of cls.restrictions ?? []) {
       const rPairs: string[] = [];
       rPairs.push(`a owl:Restriction`);
       rPairs.push(`owl:onProperty ${c(r.propertyUri)}`);
       if (r.type === "someValuesFrom") rPairs.push(`owl:someValuesFrom ${c(r.value)}`);
       else if (r.type === "allValuesFrom") rPairs.push(`owl:allValuesFrom ${c(r.value)}`);
       else if (r.type === "hasValue") rPairs.push(`owl:hasValue ${c(r.value)}`);
       else if (r.type === "minCardinality") rPairs.push(`owl:minCardinality "${r.value}"^^xsd:nonNegativeInteger`);
       else if (r.type === "maxCardinality") rPairs.push(`owl:maxCardinality "${r.value}"^^xsd:nonNegativeInteger`);
       else if (r.type === "exactCardinality") rPairs.push(`owl:cardinality "${r.value}"^^xsd:nonNegativeInteger`);
       
       pairs.push(["rdfs:subClassOf", `[ ${rPairs.join(" ; ")} ]`]);
    }
    serializeExtraTriples(cls.extraTriples ?? [], pairs);
    const block = buildBlock(pairs);
    lines.push(`${c(cls.uri)} ${block[0]!}`);
    for (let i = 1; i < block.length; i++) lines.push(block[i]!);
    lines.push("");
  }

  function serializeProperty(prop: OntologyProperty) {
    const typeUri =
      prop.type === "owl:ObjectProperty"
        ? "owl:ObjectProperty"
        : prop.type === "owl:DatatypeProperty"
        ? "owl:DatatypeProperty"
        : "owl:AnnotationProperty";
    const pairs: Array<[string, string]> = [["a", typeUri]];
    for (const lbl of prop.labels.filter((l) => l.value)) {
      pairs.push(["rdfs:label", langLit(lbl)]);
    }
    for (const desc of prop.descriptions.filter((d) => d.value)) {
      pairs.push(["rdfs:comment", langLit(desc)]);
    }
    for (const note of (prop.editorialNotes ?? []).filter((n) => n.value)) {
      pairs.push(["skos:editorialNote", langLit(note)]);
    }
    if (prop.created) pairs.push(["dcterms:created", `"${escLit(prop.created)}"^^xsd:dateTime`]);
    if (prop.modified) pairs.push(["dcterms:modified", `"${escLit(prop.modified)}"^^xsd:dateTime`]);
    if (prop.domain && classExprNonEmpty(prop.domain)) {
      pairs.push(["rdfs:domain", serializeClassExpr(prop.domain)]);
    }
    for (const rangeExpr of prop.ranges ?? []) {
      if (!classExprNonEmpty(rangeExpr)) continue;
      pairs.push(["rdfs:range", serializeClassExpr(rangeExpr)]);
    }
    for (const parentUri of prop.subPropertyOf) {
      pairs.push(["rdfs:subPropertyOf", c(parentUri)]);
    }
    if (prop.inverseOf) pairs.push(["owl:inverseOf", c(prop.inverseOf)]);
    if (prop.exactCardinality !== undefined) {
      pairs.push(["owl:cardinality", `"${prop.exactCardinality}"^^xsd:nonNegativeInteger`]);
    } else {
      if (prop.minCardinality !== undefined)
        pairs.push(["owl:minCardinality", `"${prop.minCardinality}"^^xsd:nonNegativeInteger`]);
      if (prop.maxCardinality !== undefined)
        pairs.push(["owl:maxCardinality", `"${prop.maxCardinality}"^^xsd:nonNegativeInteger`]);
    }
    serializeExtraTriples(prop.extraTriples ?? [], pairs);
    const block = buildBlock(pairs);
    lines.push(`${c(prop.uri)} ${block[0]!}`);
    for (let i = 1; i < block.length; i++) lines.push(block[i]!);
    lines.push("");
  }

  function serializeIndividual(ind: Individual) {
    const pairs: Array<[string, string]> = [];
    // rdf:type assertions
    for (const typeUri of ind.typeUris) {
      pairs.push(["a", c(typeUri)]);
    }
    // Property values
    for (const pv of ind.propertyValues) {
      const pred = c(pv.propertyUri);
      const obj = pv.isLiteral
        ? typedLit(pv.value, pv.datatype, pv.lang)
        : c(pv.value);
      pairs.push([pred, obj]);
    }
    for (const note of (ind.editorialNotes ?? []).filter((n) => n.value)) {
      pairs.push(["skos:editorialNote", langLit(note)]);
    }
    if (ind.created) pairs.push(["dcterms:created", `"${escLit(ind.created)}"^^xsd:dateTime`]);
    if (ind.modified) pairs.push(["dcterms:modified", `"${escLit(ind.modified)}"^^xsd:dateTime`]);
    if (pairs.length === 0) return;
    const block = buildBlock(pairs);
    lines.push(`${c(ind.uri)} ${block[0]!}`);
    for (let i = 1; i < block.length; i++) lines.push(block[i]!);
    lines.push("");
  }

  function sortedProps(type: OntologyProperty["type"]): OntologyProperty[] {
    return ontology.properties
      .filter((p) => p.type === type)
      .sort((a, b) => a.localName.localeCompare(b.localName));
  }
}
