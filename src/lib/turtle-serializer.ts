/**
 * Serializes an Ontology to valid, human-readable Turtle.
 *
 * Layout: prefixes → owl:Ontology header → Classes → Object / Datatype /
 * Annotation Properties → Individuals → Preserved triples. Every resource is
 * one block using `;` continuation lines indented by four spaces.
 */

import type {
  Ontology, OntologyClass, OntologyProperty, LangString, Individual, ClassExpression,
  OntologyRestriction, ExtraTriple,
} from "../types";
import { compact, STANDARD_PREFIXES } from "./uri-utils";
import { OWL, RDF, XSD, isBlankNode } from "./vocab";

type Pair = [predicate: string, object: string];

const RESTRICTION_PREDICATE: Record<OntologyRestriction["type"], string> = {
  someValuesFrom: "owl:someValuesFrom",
  allValuesFrom: "owl:allValuesFrom",
  hasValue: "owl:hasValue",
  minCardinality: "owl:minCardinality",
  maxCardinality: "owl:maxCardinality",
  exactCardinality: "owl:cardinality",
};
/** Datatypes with a Turtle shorthand form, and the lexical forms that round-trip exactly. */
const SHORTHAND_LITERAL: Record<string, RegExp> = {
  [XSD.integer]: /^[+-]?\d+$/,
  [XSD.decimal]: /^[+-]?\d*\.\d+$/,
  [XSD.boolean]: /^(true|false)$/,
};
const COUNT_RESTRICTIONS = new Set<OntologyRestriction["type"]>(["minCardinality", "maxCardinality", "exactCardinality"]);

const escLit = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");

export function serializeToTurtle(ontology: Ontology): string {
  const lines: string[] = [];
  const prefixes = { ...STANDARD_PREFIXES, ...ontology.metadata.prefixes };
  // Blank nodes are renumbered in order of first appearance in the output, so
  // exporting the same graph always yields the same text.
  const bnodeLabels = new Map<string, string>();
  const c = (uri: string): string => {
    if (!isBlankNode(uri)) return compact(uri, prefixes);
    let label = bnodeLabels.get(uri);
    if (!label) bnodeLabels.set(uri, (label = `_:b${bnodeLabels.size}`));
    return label;
  };

  const langLit = (ls: LangString): string =>
    ls.lang ? `"${escLit(ls.value)}"@${ls.lang}` : `"${escLit(ls.value)}"`;
  const typedLit = (value: string, datatype?: string, lang?: string): string => {
    if (lang) return `"${escLit(value)}"@${lang}`;
    const shorthand = datatype ? SHORTHAND_LITERAL[datatype] : undefined;
    if (shorthand?.test(value)) return value;
    if (datatype) return `"${escLit(value)}"^^${c(datatype)}`;
    return `"${escLit(value)}"`;
  };
  const dateTime = (value: string) => `"${escLit(value)}"^^xsd:dateTime`;
  const count = (n: number | string) => `"${n}"^^xsd:nonNegativeInteger`;

  // ── Blank nodes in preserved triples ────────────────────────────────────
  // A blank node referenced exactly once is written inline at that reference —
  // as ( a b c ) for a well-formed RDF list, otherwise as [ p o ; … ]. Others
  // keep a label and get their own block in the preserved section.
  const bnodes = buildBlankNodeIndex(ontology);
  const rendered = new Set<string>();
  const renderNode = (term: string): string => {
    const members = bnodes.lists.get(term);
    if (members && !rendered.has(term)) {
      bnodes.listCells.get(term)!.forEach((cell) => rendered.add(cell));
      return `( ${members.map(renderNode).join(" ")} )`;
    }
    const own = bnodes.own.get(term);
    if (own && bnodes.refCount.get(term) === 1 && !rendered.has(term)) {
      rendered.add(term);
      return `[ ${groupPairs(own.map(triplePair)).map(([p, objs]) => `${p} ${objs.join(" , ")}`).join(" ; ")} ]`;
    }
    return c(term);
  };
  const triplePair = (t: { predicate: string; object: string; isLiteral: boolean; lang?: string; datatype?: string }): Pair =>
    [t.predicate === RDF.type ? "a" : c(t.predicate), t.isLiteral ? typedLit(t.object, t.datatype, t.lang) : renderNode(t.object)];

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
    const groups = groupPairs(pairs);
    if (groups.length === 0) return;
    groups.forEach(([predicate, objects], i) => {
      const lead = i === 0 ? `${subject} ` : "    ";
      const end = i === groups.length - 1 ? " ." : " ;";
      const oneLine = `${lead}${predicate} ${objects.join(" , ")}${end}`;
      if (objects.length === 1 || oneLine.length <= 100) {
        lines.push(oneLine);
      } else {
        lines.push(`${lead}${predicate} ${objects[0]} ,`);
        objects.slice(1).forEach((obj, j) => lines.push(`        ${obj}${j === objects.length - 2 ? end : " ,"}`));
      }
    });
    lines.push("");
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
    pushLangStrings(pairs, "skos:editorialNote", meta.editorialNotes);
    pushTimestamps(pairs, meta);
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

  // ── 6. Preserved triples ────────────────────────────────────────────────
  // Roots first (IRIs and multiply-referenced / unreferenced blank nodes);
  // single-reference blank nodes are inlined into whichever block renders them.
  const preservedBySubject = new Map<string, typeof ontology.unmappedTriples>();
  for (const t of ontology.unmappedTriples) {
    const list = preservedBySubject.get(t.subject) ?? [];
    list.push(t);
    preservedBySubject.set(t.subject, list);
  }
  const preservedLines = lines.length;
  const emitPreserved = (subject: string) => {
    if (rendered.has(subject)) return;
    rendered.add(subject);
    const label = isBlankNode(subject) && (bnodes.refCount.get(subject) ?? 0) === 0 ? "[]" : c(subject);
    emitBlock(label, preservedBySubject.get(subject)!.map(triplePair));
  };
  const isInlineable = (subject: string) => isBlankNode(subject) && bnodes.refCount.get(subject) === 1;
  for (const subject of preservedBySubject.keys()) if (!isInlineable(subject)) emitPreserved(subject);
  // Anything left is only reachable from a cycle of blank nodes — give it a label.
  for (const subject of preservedBySubject.keys()) emitPreserved(subject);
  if (lines.length > preservedLines) {
    lines.splice(preservedLines, 0, ...sectionLines("Preserved triples"));
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

/** Group pairs by predicate (first-seen order), with `a` always first. */
function groupPairs(pairs: Pair[]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const [predicate, object] of pairs) {
    const objects = groups.get(predicate) ?? [];
    if (!objects.includes(object)) objects.push(object);
    groups.set(predicate, objects);
  }
  const entries = [...groups.entries()];
  const typeIdx = entries.findIndex(([p]) => p === "a");
  if (typeIdx > 0) entries.unshift(entries.splice(typeIdx, 1)[0]!);
  return entries;
}

interface BlankNodeIndex {
  /** Preserved triples per blank-node subject */
  own: Map<string, Ontology["unmappedTriples"]>;
  /** Number of references to each term (as an object) across the whole ontology */
  refCount: Map<string, number>;
  /** Well-formed RDF list head → members */
  lists: Map<string, string[]>;
  /** List head → all of its cells */
  listCells: Map<string, string[]>;
}

/**
 * Index blank nodes among the preserved triples. A list qualifies for inline
 * ( … ) syntax when every cell is a blank node with exactly one rdf:first and
 * one rdf:rest, nothing else, and is referenced exactly once.
 */
function buildBlankNodeIndex(ontology: Ontology): BlankNodeIndex {
  const own = new Map<string, Ontology["unmappedTriples"]>();
  const refCount = new Map<string, number>();
  const bump = (term: string) => refCount.set(term, (refCount.get(term) ?? 0) + 1);

  for (const t of ontology.unmappedTriples) {
    if (isBlankNode(t.subject)) {
      const list = own.get(t.subject) ?? [];
      list.push(t);
      own.set(t.subject, list);
    }
    if (!t.isLiteral) bump(t.object);
  }
  const bumpExtras = (extras: ExtraTriple[] | undefined) => { for (const et of extras ?? []) if (!et.isLiteral) bump(et.object); };
  for (const cls of ontology.classes) {
    bumpExtras(cls.extraTriples);
    cls.subClassOf.forEach(bump);
    (cls.disjointWith ?? []).forEach(bump);
  }
  for (const prop of ontology.properties) bumpExtras(prop.extraTriples);
  for (const ind of ontology.individuals ?? []) {
    for (const pv of ind.propertyValues) if (!pv.isLiteral) bump(pv.value);
    ind.typeUris.forEach(bump);
  }

  const isCell = (term: string): boolean => {
    const ts = own.get(term);
    return !!ts && ts.length === 2 && refCount.get(term) === 1
      && ts.some((t) => t.predicate === RDF.first)
      && ts.some((t) => t.predicate === RDF.rest && !t.isLiteral);
  };

  const restObjects = new Set(ontology.unmappedTriples.filter((t) => t.predicate === RDF.rest).map((t) => t.object));
  const lists = new Map<string, string[]>();
  const listCells = new Map<string, string[]>();
  for (const head of own.keys()) {
    // Tails are reached through their head; only heads are rendered inline.
    if (restObjects.has(head) || !isCell(head)) continue;
    const members: string[] = [];
    const cells: string[] = [];
    let ok = true;
    for (let cur = head; cur !== RDF.nil;) {
      if (!isCell(cur) || cells.includes(cur)) { ok = false; break; }
      const ts = own.get(cur)!;
      const first = ts.find((t) => t.predicate === RDF.first)!;
      if (first.isLiteral) { ok = false; break; }
      members.push(first.object);
      cells.push(cur);
      cur = ts.find((t) => t.predicate === RDF.rest)!.object;
    }
    if (!ok) continue;
    lists.set(head, members);
    listCells.set(head, cells);
  }
  return { own, refCount, lists, listCells };
}
