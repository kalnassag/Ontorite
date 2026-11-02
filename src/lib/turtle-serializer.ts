/**
 * Serializes an Ontology to valid, human-readable Turtle.
 *
 * Layout: prefixes → owl:Ontology header → Classes → Object / Datatype /
 * Annotation Properties → Individuals → Other statements. Every resource is
 * one block using `;` continuation lines indented by four spaces.
 */

import type {
  Ontology, OntologyClass, OntologyProperty, LangString, Individual, ClassExpression,
  OntologyRestriction, ExtraTriple,
} from "../types";
import { STANDARD_PREFIXES, iriRef } from "./uri-utils";
import { OWL, isBlankNode } from "./vocab";
import { allRawTriples, countReferences } from "./raw-triples";
import {
  type Pair, createNodeRenderer, createTermFormatter, escLit, formatBlock, formatLiteral, statementGroups,
} from "./turtle-format";

const RESTRICTION_PREDICATE: Record<OntologyRestriction["type"], string> = {
  someValuesFrom: "owl:someValuesFrom",
  allValuesFrom: "owl:allValuesFrom",
  hasValue: "owl:hasValue",
  minCardinality: "owl:minCardinality",
  maxCardinality: "owl:maxCardinality",
  exactCardinality: "owl:cardinality",
};
const COUNT_RESTRICTIONS = new Set<OntologyRestriction["type"]>(["minCardinality", "maxCardinality", "exactCardinality"]);

export function serializeToTurtle(ontology: Ontology): string {
  const lines: string[] = [];
  const prefixes = { ...STANDARD_PREFIXES, ...ontology.metadata.prefixes };
  // Blank nodes are renumbered in order of first appearance, so exporting the
  // same graph always yields the same text. Single-use blank nodes (owned
  // structures, lists) are written inline — see turtle-format.ts.
  const c = createTermFormatter(prefixes);
  const langLit = (ls: LangString): string =>
    ls.lang ? `"${escLit(ls.value)}"@${ls.lang}` : `"${escLit(ls.value)}"`;
  const typedLit = (value: string, datatype?: string, lang?: string) => formatLiteral(value, datatype, lang, c);
  const dateTime = (value: string) => `"${escLit(value)}"^^xsd:dateTime`;
  const count = (n: number | string) => `"${n}"^^xsd:nonNegativeInteger`;

  const bnodes = createNodeRenderer(allRawTriples(ontology), countReferences(ontology), c);
  const { renderNode, triplePair } = bnodes;

  // Legacy: blank-node union classes stored as OntologyClass (pre-ClassExpression
  // data that skipped migration). Inline them where referenced.
  const legacyUnionMembers = (uri: string): string[] | null => {
    if (!isBlankNode(uri)) return null;
    const cls = ontology.classes.find((k) => k.uri === uri);
    const head = cls?.extraTriples.find((et) => !et.isLiteral && et.predicate === OWL.unionOf)?.object;
    return head ? bnodes.lists.get(head) ?? null : null;
  };
  const unionLiteral = (uris: string[]) => `[ a owl:Class ; owl:unionOf ( ${uris.map(c).join(" ")} ) ]`;
  const serializeRef = (uri: string): string => {
    const members = legacyUnionMembers(uri);
    return members ? unionLiteral(members) : renderNode(uri);
  };
  const serializeClassExpr = (expr: ClassExpression): string => {
    if (expr.kind === "class") return serializeRef(expr.uri);
    return expr.uris.length === 1 ? serializeRef(expr.uris[0]!) : unionLiteral(expr.uris);
  };
  const classExprNonEmpty = (expr: ClassExpression): boolean =>
    expr.kind === "class" ? !!expr.uri : expr.uris.some(Boolean);

  const restrictionLiteral = (r: OntologyRestriction): string => {
    const value = COUNT_RESTRICTIONS.has(r.type) ? count(r.value) : c(r.value);
    return `[ a owl:Restriction ; owl:onProperty ${c(r.propertyUri)} ; ${RESTRICTION_PREDICATE[r.type]} ${value} ]`;
  };

  // Property cardinalities are encoded the OWL 2 DL way: a restriction on each
  // domain class (owl:Thing when the property has no domain).
  const cardinalityByClass = new Map<string, OntologyRestriction[]>();
  for (const prop of ontology.properties) {
    const restrictions = propertyCardinalityRestrictions(prop);
    if (restrictions.length === 0) continue;
    const domainUris = prop.domain.kind === "class" ? [prop.domain.uri] : prop.domain.uris;
    const targets = domainUris.filter(Boolean);
    for (const target of targets.length > 0 ? targets : [OWL.Thing]) {
      const list = cardinalityByClass.get(target) ?? [];
      list.push(...restrictions);
      cardinalityByClass.set(target, list);
    }
  }

  const emitBlock = (subject: string, pairs: Pair[]) => {
    const block = formatBlock(subject, pairs);
    if (block.length === 0) return;
    lines.push(...block, "");
  };
  const sectionLines = (title: string) => [`# ── ${title} ${"─".repeat(Math.max(3, 70 - title.length))}`, ""];
  const section = (title: string) => lines.push(...sectionLines(title));

  const pushLangStrings = (pairs: Pair[], predicate: string, values: LangString[] | undefined) => {
    for (const v of values ?? []) if (v.value) pairs.push([predicate, langLit(v)]);
  };
  const pushTimestamps = (pairs: Pair[], entity: { created?: string; modified?: string }) => {
    if (entity.created) pairs.push(["dcterms:created", dateTime(entity.created)]);
    if (entity.modified) pairs.push(["dcterms:modified", dateTime(entity.modified)]);
  };
  const pushExtras = (pairs: Pair[], extras: ExtraTriple[] | undefined) => {
    for (const et of extras ?? []) {
      const members = !et.isLiteral ? legacyUnionMembers(et.object) : null;
      pairs.push(members ? [c(et.predicate), unionLiteral(members)] : triplePair(et));
    }
  };

  // ── 1. Prefixes ─────────────────────────────────────────────────────────
  for (const [prefix, uri] of Object.entries(prefixes).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`@prefix ${prefix}: <${uri}> .`);
  }
  lines.push("");

  // ── 2. Ontology header ──────────────────────────────────────────────────
  const meta = ontology.metadata;
  if (meta.ontologyUri) {
    const pairs: Pair[] = [["a", "owl:Ontology"]];
    if (meta.ontologyLabel) pairs.push(["rdfs:label", langLit({ value: meta.ontologyLabel, lang: meta.ontologyLabelLang ?? "" })]);
    if (meta.ontologyComment) pairs.push(["rdfs:comment", langLit({ value: meta.ontologyComment, lang: meta.ontologyCommentLang ?? "" })]);
    if (meta.versionIRI) pairs.push(["owl:versionIRI", c(meta.versionIRI)]);
    if (meta.versionInfo) pairs.push(["owl:versionInfo", `"${escLit(meta.versionInfo)}"`]);
    // Imports are always written as full IRIs — `foaf:` alone is valid but obscure
    for (const imported of meta.imports ?? []) pairs.push(["owl:imports", iriRef(imported)]);
    pushLangStrings(pairs, "skos:editorialNote", meta.editorialNotes);
    pushTimestamps(pairs, meta);
    pushExtras(pairs, meta.extraTriples);
    emitBlock(c(meta.ontologyUri), pairs);
  }

  // ── 3. Classes ──────────────────────────────────────────────────────────
  const classes = [...ontology.classes]
    .filter((cls) => !legacyUnionMembers(cls.uri)) // inlined at point of use
    .sort((a, b) => a.localName.localeCompare(b.localName));
  if (classes.length > 0) {
    section("Classes");
    for (const cls of classes) emitBlock(c(cls.uri), classPairs(cls));
  }

  // ── 4. Properties ───────────────────────────────────────────────────────
  const groups: Array<[OntologyProperty["type"], string]> = [
    ["owl:ObjectProperty", "Object Properties"],
    ["owl:DatatypeProperty", "Datatype Properties"],
    ["owl:AnnotationProperty", "Annotation Properties"],
  ];
  for (const [type, title] of groups) {
    const props = ontology.properties
      .filter((p) => p.type === type)
      .sort((a, b) => a.localName.localeCompare(b.localName));
    if (props.length === 0) continue;
    section(title);
    for (const prop of props) emitBlock(c(prop.uri), propertyPairs(prop));
  }

  // Cardinalities of properties whose domain is not a class in this ontology
  const classUris = new Set(classes.map((k) => k.uri));
  const orphanTargets = [...cardinalityByClass.keys()].filter((uri) => !classUris.has(uri));
  if (orphanTargets.length > 0) {
    section("Property cardinalities");
    for (const target of orphanTargets) {
      emitBlock(c(target), cardinalityByClass.get(target)!.map((r) => ["rdfs:subClassOf", restrictionLiteral(r)]));
    }
  }

  // ── 5. Individuals ──────────────────────────────────────────────────────
  const individuals = [...(ontology.individuals ?? [])].sort((a, b) => a.localName.localeCompare(b.localName));
  if (individuals.length > 0) {
    section("Individuals");
    for (const ind of individuals) emitBlock(c(ind.uri), individualPairs(ind));
  }

  // ── 6. Other statements ─────────────────────────────────────────────────
  // Raw triples whose subject isn't an entity. Anything still unwritten after
  // them (an owned structure that somehow wasn't inlined) is emitted too, so
  // nothing can be lost.
  const unmapped = new Set(ontology.unmappedTriples);
  const leftovers = allRawTriples(ontology).filter((t) => !unmapped.has(t) && !bnodes.rendered.has(t.subject));
  const otherGroups = statementGroups([...ontology.unmappedTriples, ...leftovers], bnodes, c);
  if (otherGroups.length > 0) {
    section("Other statements");
    for (const group of otherGroups) lines.push(...group.lines, "");
  }

  return lines.join("\n");

  // ── Entity blocks ───────────────────────────────────────────────────────

  function classPairs(cls: OntologyClass): Pair[] {
    const pairs: Pair[] = [["a", "owl:Class"]];
    pushLangStrings(pairs, "rdfs:label", cls.labels);
    pushLangStrings(pairs, "rdfs:comment", cls.descriptions);
    pushLangStrings(pairs, "skos:editorialNote", cls.editorialNotes);
    pushTimestamps(pairs, cls);
    for (const parent of cls.subClassOf) pairs.push(["rdfs:subClassOf", serializeRef(parent)]);
    for (const disj of cls.disjointWith ?? []) pairs.push(["owl:disjointWith", serializeRef(disj)]);
    for (const r of [...(cls.restrictions ?? []), ...(cardinalityByClass.get(cls.uri) ?? [])]) {
      pairs.push(["rdfs:subClassOf", restrictionLiteral(r)]);
    }
    pushExtras(pairs, cls.extraTriples);
    return pairs;
  }

  function propertyPairs(prop: OntologyProperty): Pair[] {
    const pairs: Pair[] = [["a", prop.type]];
    pushLangStrings(pairs, "rdfs:label", prop.labels);
    pushLangStrings(pairs, "rdfs:comment", prop.descriptions);
    pushLangStrings(pairs, "skos:editorialNote", prop.editorialNotes);
    pushTimestamps(pairs, prop);
    if (prop.domain && classExprNonEmpty(prop.domain)) pairs.push(["rdfs:domain", serializeClassExpr(prop.domain)]);
    for (const range of prop.ranges ?? []) {
      if (classExprNonEmpty(range)) pairs.push(["rdfs:range", serializeClassExpr(range)]);
    }
    for (const parent of prop.subPropertyOf) pairs.push(["rdfs:subPropertyOf", c(parent)]);
    if (prop.inverseOf) pairs.push(["owl:inverseOf", c(prop.inverseOf)]);
    pushExtras(pairs, prop.extraTriples);
    return pairs;
  }

  function individualPairs(ind: Individual): Pair[] {
    const pairs: Pair[] = ind.typeUris.map((t): Pair => ["a", serializeRef(t)]);
    for (const pv of ind.propertyValues) {
      pairs.push([c(pv.propertyUri), pv.isLiteral ? typedLit(pv.value, pv.datatype, pv.lang) : serializeRef(pv.value)]);
    }
    pushLangStrings(pairs, "skos:editorialNote", ind.editorialNotes);
    pushTimestamps(pairs, ind);
    return pairs;
  }
}

/** Owl restrictions equivalent to a property's simplified cardinality fields. */
function propertyCardinalityRestrictions(prop: OntologyProperty): OntologyRestriction[] {
  const out: OntologyRestriction[] = [];
  const add = (type: OntologyRestriction["type"], n: number | undefined) => {
    if (n !== undefined && Number.isInteger(n) && n >= 0) out.push({ propertyUri: prop.uri, type, value: String(n) });
  };
  if (prop.exactCardinality !== undefined) {
    add("exactCardinality", prop.exactCardinality);
  } else {
    add("minCardinality", prop.minCardinality);
    add("maxCardinality", prop.maxCardinality);
  }
  return out;
}
