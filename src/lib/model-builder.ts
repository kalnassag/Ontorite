/**
 * Triples → Ontorite domain model.
 *
 * Guiding rule: a triple is only "consumed" into a typed field when the model
 * can represent it exactly. Anything else is kept verbatim — as an entity's
 * `extraTriples` when its subject is a known entity, otherwise in
 * `unmappedTriples` — so import → export never loses or invents data.
 *
 * Blank-node structures are consumed only when they match a shape the model
 * owns and are referenced exactly where the model expects them:
 *   - `[ a owl:Class ; owl:unionOf ( :A :B ) ]` used as a property domain/range
 *   - `[ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :C ]`
 *     (or allValuesFrom / hasValue / min / max / cardinality) used as the
 *     object of exactly one `rdfs:subClassOf` from a class
 * Every other blank node (intersections, qualified cardinalities, property
 * chains, …) round-trips through the preserved-triples bucket.
 */

import type {
  ParseResult, ParsedTriple, OntologyClass, OntologyProperty, OntologyMetadata,
  UnmappedTriple, Individual, ExtraTriple, OntologyRestriction, ClassExpression,
  LangString, PropertyType,
} from "../types";
import { localName as extractLocalName, namespace } from "./uri-utils";
import {
  RDF, RDFS, OWL, SKOS, DCT, XSD, OBJECT_PROPERTY_CHARACTERISTICS, WELL_KNOWN_NAMESPACES, isBlankNode,
} from "./vocab";

export interface BuiltModel {
  metadata: OntologyMetadata;
  classes: OntologyClass[];
  properties: OntologyProperty[];
  individuals: Individual[];
  unmappedTriples: UnmappedTriple[];
}

const genId = () => crypto.randomUUID().slice(0, 8);

const PROPERTY_TYPES: Record<string, PropertyType> = {
  [OWL.ObjectProperty]: "owl:ObjectProperty",
  [OWL.DatatypeProperty]: "owl:DatatypeProperty",
  [OWL.AnnotationProperty]: "owl:AnnotationProperty",
};
const PROPERTY_TYPE_IRI: Record<PropertyType, string> = {
  "owl:ObjectProperty": OWL.ObjectProperty,
  "owl:DatatypeProperty": OWL.DatatypeProperty,
  "owl:AnnotationProperty": OWL.AnnotationProperty,
};

const RESTRICTION_IRI_VALUES: Record<string, OntologyRestriction["type"]> = {
  [OWL.someValuesFrom]: "someValuesFrom",
  [OWL.allValuesFrom]: "allValuesFrom",
  [OWL.hasValue]: "hasValue",
};
const RESTRICTION_COUNT_VALUES: Record<string, OntologyRestriction["type"]> = {
  [OWL.minCardinality]: "minCardinality",
  [OWL.maxCardinality]: "maxCardinality",
  [OWL.cardinality]: "exactCardinality",
};
const CARDINALITY_FIELD = {
  minCardinality: "minCardinality",
  maxCardinality: "maxCardinality",
  exactCardinality: "exactCardinality",
} as const;

const toExtra = (t: ParsedTriple): ExtraTriple => ({
  predicate: t.p, object: t.o, isLiteral: t.isLiteral, lang: t.lang, datatype: t.datatype,
});
const toLangString = (t: ParsedTriple): LangString => ({ value: t.o, lang: t.lang ?? "" });
const isIri = (t: ParsedTriple): boolean => !t.isLiteral && !isBlankNode(t.o);

export function buildModelFromTriples(parsed: ParseResult): BuiltModel {
  const { triples, prefixes } = parsed;

  // ── Indexes ─────────────────────────────────────────────────────────────
  const bySubject = new Map<string, number[]>();
  const refsTo = new Map<string, number[]>(); // non-literal object → referencing triple indexes
  const typesOf = new Map<string, string[]>();
  triples.forEach((t, idx) => {
    push(bySubject, t.s, idx);
    if (!t.isLiteral) push(refsTo, t.o, idx);
    if (t.p === RDF.type && !t.isLiteral) push(typesOf, t.s, t.o);
  });
  const subjectTriples = (s: string) => (bySubject.get(s) ?? []).map((i) => triples[i]!);

  // ── Ontology header + base URI ──────────────────────────────────────────
  let ontologyUri = "";
  for (const [subj, types] of typesOf) {
    if (!isBlankNode(subj) && types.includes(OWL.Ontology)) { ontologyUri = subj; break; }
  }
  const baseUri = parsed.baseUri || prefixes[""] || (ontologyUri ? namespace(ontologyUri) : "");

  // ── Classify IRI subjects by rdf:type ───────────────────────────────────
  const classMap = new Map<string, OntologyClass>();
  const propMap = new Map<string, OntologyProperty>();
  const individualMap = new Map<string, Individual>();
  /** rdf:type objects the serializer re-emits for an entity (so not kept as extras) */
  const emittedType = new Map<string, string>();

  for (const [uri, types] of typesOf) {
    if (isBlankNode(uri) || uri === ontologyUri) continue;
    const explicitProp = types.find((t) => PROPERTY_TYPES[t]);
    const impliedObjectProp = types.some((t) => OBJECT_PROPERTY_CHARACTERISTICS.has(t));
    if (explicitProp || impliedObjectProp) {
      const type = explicitProp ? PROPERTY_TYPES[explicitProp]! : "owl:ObjectProperty";
      propMap.set(uri, newProperty(uri, type));
      emittedType.set(uri, PROPERTY_TYPE_IRI[type]);
    } else if (types.includes(OWL.Class) || types.includes(RDFS.Class)) {
      classMap.set(uri, newClass(uri));
      emittedType.set(uri, OWL.Class);
    }
  }

  // Implicit classes: IRI subjects described with rdfs:subClassOf …
  for (const t of triples) {
    if (t.p !== RDFS.subClassOf || isBlankNode(t.s)) continue;
    if (!classMap.has(t.s) && !propMap.has(t.s) && t.s !== ontologyUri) {
      classMap.set(t.s, newClass(t.s));
      emittedType.set(t.s, OWL.Class);
    }
  }
  // … and undeclared local terms used as an rdf:type. External vocabularies
  // (skos:Concept, schema:Person, owl:Restriction …) are never promoted.
  const isLocal = (uri: string) =>
    !!baseUri && uri.startsWith(baseUri) && !WELL_KNOWN_NAMESPACES.some((ns) => uri.startsWith(ns));
  for (const types of typesOf.values()) {
    for (const typeUri of types) {
      if (isBlankNode(typeUri) || classMap.has(typeUri) || propMap.has(typeUri)) continue;
      if (typeUri !== ontologyUri && isLocal(typeUri)) {
        classMap.set(typeUri, newClass(typeUri));
        emittedType.set(typeUri, OWL.Class);
      }
    }
  }

  // Individuals: every remaining typed IRI subject.
  for (const [uri, types] of typesOf) {
    if (isBlankNode(uri) || uri === ontologyUri || classMap.has(uri) || propMap.has(uri)) continue;
    individualMap.set(uri, {
      id: genId(), uri, localName: extractLocalName(uri),
      typeUris: [...types], propertyValues: [], editorialNotes: [],
    });
  }

  // ── Blank-node structures the model owns ────────────────────────────────
  const consumed = new Set<number>();

  /** Read a well-formed RDF list of IRI members whose cells are referenced exactly once. */
  const readIriList = (head: string): { members: string[]; cells: number[] } | null => {
    const members: string[] = [];
    const cells: number[] = [];
    const seen = new Set<string>();
    for (let cur = head; cur !== RDF.nil;) {
      if (!isBlankNode(cur) || seen.has(cur) || (refsTo.get(cur)?.length ?? 0) !== 1) return null;
      seen.add(cur);
      const own = bySubject.get(cur) ?? [];
      if (own.length !== 2) return null;
      const first = own.find((i) => triples[i]!.p === RDF.first);
      const rest = own.find((i) => triples[i]!.p === RDF.rest);
      if (first === undefined || rest === undefined) return null;
      const ft = triples[first]!;
      const rt = triples[rest]!;
      if (!isIri(ft) || rt.isLiteral) return null;
      members.push(ft.o);
      cells.push(first, rest);
      cur = rt.o;
    }
    return members.length > 0 ? { members, cells } : null;
  };

  // Unions used as property domain / range
  const unionExprs = new Map<string, string[]>();
  for (const [bnode, own] of bySubject) {
    if (!isBlankNode(bnode)) continue;
    const ts = own.map((i) => triples[i]!);
    const unionIdx = own.find((i) => triples[i]!.p === OWL.unionOf);
    if (unionIdx === undefined) continue;
    const shapeOk = ts.every((t) =>
      t.p === OWL.unionOf || (t.p === RDF.type && t.o === OWL.Class)) && ts.length <= 2;
    // Every reference must land in a typed field: a property's range, or its
    // *only* rdfs:domain (extra domains are kept as raw triples).
    const refs = refsTo.get(bnode) ?? [];
    const refsOk = refs.length > 0 && refs.every((i) => {
      const r = triples[i]!;
      if (!propMap.has(r.s)) return false;
      if (r.p === RDFS.range) return true;
      return r.p === RDFS.domain && subjectTriples(r.s).filter((x) => x.p === RDFS.domain).length === 1;
    });
    const list = shapeOk && refsOk ? readIriList(triples[unionIdx]!.o) : null;
    if (!list) continue;
    unionExprs.set(bnode, list.members);
    own.forEach((i) => consumed.add(i));
    list.cells.forEach((i) => consumed.add(i));
  }

  // Restrictions used as the object of exactly one rdfs:subClassOf
  const restrictionExprs = new Map<string, OntologyRestriction>();
  for (const [bnode, own] of bySubject) {
    if (!isBlankNode(bnode) || own.length !== 3) continue;
    const ts = own.map((i) => triples[i]!);
    if (!ts.some((t) => t.p === RDF.type && t.o === OWL.Restriction)) continue;
    const onProp = ts.find((t) => t.p === OWL.onProperty);
    const valueT = ts.find((t) => t !== onProp && t.p !== RDF.type);
    if (!onProp || !isIri(onProp) || !valueT) continue;
    let restriction: OntologyRestriction | null = null;
    if (RESTRICTION_IRI_VALUES[valueT.p] && isIri(valueT)) {
      restriction = { propertyUri: onProp.o, type: RESTRICTION_IRI_VALUES[valueT.p]!, value: valueT.o };
    } else if (RESTRICTION_COUNT_VALUES[valueT.p] && valueT.isLiteral && /^\d+$/.test(valueT.o)) {
      restriction = { propertyUri: onProp.o, type: RESTRICTION_COUNT_VALUES[valueT.p]!, value: valueT.o };
    }
    const refs = refsTo.get(bnode) ?? [];
    const ref = refs.length === 1 ? triples[refs[0]!]! : undefined;
    if (!restriction || !ref || ref.p !== RDFS.subClassOf || !classMap.has(ref.s)) continue;
    restrictionExprs.set(bnode, restriction);
    own.forEach((i) => consumed.add(i));
  }

  const toClassExpr = (uri: string): ClassExpression | null => {
    const union = unionExprs.get(uri);
    if (union) return union.length === 1 ? { kind: "class", uri: union[0]! } : { kind: "union", uris: union };
    return isBlankNode(uri) ? null : { kind: "class", uri };
  };

  // ── Ontology header fields ──────────────────────────────────────────────
  const metadata: OntologyMetadata = {
    baseUri: baseUri || "http://example.org/ontology/",
    ontologyUri,
    ontologyLabel: "",
    ontologyComment: "",
    versionIRI: "",
    versionInfo: "",
    editorialNotes: [],
    prefixes,
    defaultLanguage: "en",
  };
  const unmappedTriples: UnmappedTriple[] = [];
  const keepUnmapped = (t: ParsedTriple) => unmappedTriples.push({
    subject: t.s, predicate: t.p, object: t.o, isLiteral: t.isLiteral, lang: t.lang, datatype: t.datatype,
  });

  if (ontologyUri) {
    let typeSeen = false;
    for (const t of subjectTriples(ontologyUri)) {
      if (t.p === RDF.type && t.o === OWL.Ontology && !typeSeen) { typeSeen = true; continue; }
      if (t.isLiteral && t.p === RDFS.label && !metadata.ontologyLabel && t.o) {
        metadata.ontologyLabel = t.o; metadata.ontologyLabelLang = t.lang; continue;
      }
      if (t.isLiteral && t.p === RDFS.comment && !metadata.ontologyComment && t.o) {
        metadata.ontologyComment = t.o; metadata.ontologyCommentLang = t.lang; continue;
      }
      if (isIri(t) && t.p === OWL.versionIRI && !metadata.versionIRI) { metadata.versionIRI = t.o; continue; }
      if (isPlainLiteral(t) && t.p === OWL.versionInfo && !metadata.versionInfo) { metadata.versionInfo = t.o; continue; }
      if (t.isLiteral && t.p === SKOS.editorialNote) { metadata.editorialNotes.push(toLangString(t)); continue; }
      if (isTimestamp(t) && t.p === DCT.created && !metadata.created) { metadata.created = t.o; continue; }
      if (isTimestamp(t) && t.p === DCT.modified && !metadata.modified) { metadata.modified = t.o; continue; }
      keepUnmapped(t);
    }
  }

  // ── Map entity triples ──────────────────────────────────────────────────
  const pendingRestrictions: Array<{ cls: OntologyClass; r: OntologyRestriction }> = [];

  triples.forEach((t, idx) => {
    if (consumed.has(idx) || t.s === ontologyUri) return;

    const cls = classMap.get(t.s);
    if (cls) {
      if (t.p === RDF.type) {
        if (t.o !== emittedType.get(t.s)) cls.extraTriples.push(toExtra(t));
      } else if (!mapCommon(cls, t)) {
        if (t.p === RDFS.subClassOf && restrictionExprs.has(t.o)) {
          pendingRestrictions.push({ cls, r: restrictionExprs.get(t.o)! });
        } else if (t.p === RDFS.subClassOf && isIri(t)) {
          if (!cls.subClassOf.includes(t.o)) cls.subClassOf.push(t.o);
        } else if (t.p === OWL.disjointWith && isIri(t)) {
          if (!cls.disjointWith.includes(t.o)) cls.disjointWith.push(t.o);
        } else {
          cls.extraTriples.push(toExtra(t));
        }
      }
      return;
    }

    const prop = propMap.get(t.s);
    if (prop) {
      if (t.p === RDF.type) {
        if (t.o !== emittedType.get(t.s)) prop.extraTriples.push(toExtra(t));
      } else if (!mapCommon(prop, t)) {
        const expr = !t.isLiteral ? toClassExpr(t.o) : null;
        if (t.p === RDFS.domain && expr && isEmptyExpr(prop.domain)) {
          prop.domain = expr;
        } else if (t.p === RDFS.range && expr) {
          const key = JSON.stringify(expr);
          if (!prop.ranges.some((r) => JSON.stringify(r) === key)) prop.ranges.push(expr);
        } else if (t.p === RDFS.subPropertyOf && isIri(t)) {
          if (!prop.subPropertyOf.includes(t.o)) prop.subPropertyOf.push(t.o);
        } else if (t.p === OWL.inverseOf && isIri(t) && !prop.inverseOf) {
          prop.inverseOf = t.o;
        } else if (!mapLegacyCardinality(prop, t)) {
          prop.extraTriples.push(toExtra(t));
        }
      }
      return;
    }

    const individual = individualMap.get(t.s);
    if (individual) {
      if (t.p === RDF.type) return; // captured in typeUris
      if (t.isLiteral && t.p === SKOS.editorialNote) { individual.editorialNotes.push(toLangString(t)); return; }
      if (isTimestamp(t) && t.p === DCT.created && !individual.created) { individual.created = t.o; return; }
      if (isTimestamp(t) && t.p === DCT.modified && !individual.modified) { individual.modified = t.o; return; }
      individual.propertyValues.push({
        propertyUri: t.p, value: t.o, isLiteral: t.isLiteral, lang: t.lang, datatype: t.datatype,
      });
      return;
    }

    keepUnmapped(t);
  });

  // Cardinality restrictions on a property's own (single) domain class are the
  // OWL encoding of the property's cardinality fields — hoist them back.
  for (const { cls, r } of pendingRestrictions) {
    const prop = propMap.get(r.propertyUri);
    const field = r.type in CARDINALITY_FIELD ? CARDINALITY_FIELD[r.type as keyof typeof CARDINALITY_FIELD] : null;
    if (field && prop && prop.domain.kind === "class" && prop.domain.uri === cls.uri && prop[field] === undefined) {
      prop[field] = parseInt(r.value, 10);
    } else {
      cls.restrictions.push(r);
    }
  }

  return {
    metadata,
    classes: Array.from(classMap.values()),
    properties: Array.from(propMap.values()),
    individuals: Array.from(individualMap.values()),
    unmappedTriples,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const isPlainLiteral = (t: ParsedTriple) => t.isLiteral && !t.datatype && !t.lang;
/** Timestamps are stored as plain strings and re-emitted as xsd:dateTime. */
const isTimestamp = (t: ParsedTriple) =>
  t.isLiteral && !t.lang && (!t.datatype || t.datatype === XSD.dateTime);
const isEmptyExpr = (e: ClassExpression) => e.kind === "class" && !e.uri;

/** Labels, comments, editorial notes and timestamps — shared by classes and properties. */
function mapCommon(entity: OntologyClass | OntologyProperty, t: ParsedTriple): boolean {
  // Typed literals (e.g. "x"^^xsd:token) don't fit LangString — keep them as extras.
  if (!t.isLiteral || t.datatype) return isTimestampField(entity, t);
  if (t.p === RDFS.label) { entity.labels.push(toLangString(t)); return true; }
  if (t.p === RDFS.comment) { entity.descriptions.push(toLangString(t)); return true; }
  if (t.p === SKOS.editorialNote) { entity.editorialNotes.push(toLangString(t)); return true; }
  return isTimestampField(entity, t);
}

function isTimestampField(entity: OntologyClass | OntologyProperty, t: ParsedTriple): boolean {
  if (t.p === DCT.created && isTimestamp(t) && !entity.created) { entity.created = t.o; return true; }
  if (t.p === DCT.modified && isTimestamp(t) && !entity.modified) { entity.modified = t.o; return true; }
  return false;
}

/** Older Ontorite exports wrote cardinality directly on the property — read it back. */
function mapLegacyCardinality(prop: OntologyProperty, t: ParsedTriple): boolean {
  if (!t.isLiteral || !/^\d+$/.test(t.o)) return false;
  const field = t.p === OWL.minCardinality ? "minCardinality"
    : t.p === OWL.maxCardinality ? "maxCardinality"
    : t.p === OWL.cardinality ? "exactCardinality" : null;
  if (!field || prop[field] !== undefined) return false;
  prop[field] = parseInt(t.o, 10);
  return true;
}

function newClass(uri: string): OntologyClass {
  return {
    id: genId(), localName: extractLocalName(uri), uri,
    labels: [], descriptions: [], editorialNotes: [],
    subClassOf: [], disjointWith: [], restrictions: [], extraTriples: [],
  };
}

function newProperty(uri: string, type: PropertyType): OntologyProperty {
  return {
    id: genId(), localName: extractLocalName(uri), uri, type,
    labels: [], descriptions: [], editorialNotes: [],
    domain: { kind: "class", uri: "" }, ranges: [], subPropertyOf: [], extraTriples: [],
  };
}
