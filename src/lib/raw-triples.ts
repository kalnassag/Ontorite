/**
 * Helpers for triples the model has no typed field for.
 *
 * Two homes exist for them:
 *  - an entity's `extraTriples` (subject = that class / property / the ontology),
 *    where a blank-node object owns its structure in `blankNodeTriples`
 *  - `ontology.unmappedTriples` ("other statements"): subjects that aren't
 *    entities, plus blank nodes shared by several statements
 *
 * All functions here are pure — they return new objects and never mutate input.
 */

import type { ExtraTriple, Ontology, UnmappedTriple } from "../types";
import { OWL, isBlankNode } from "./vocab";

// ── References ─────────────────────────────────────────────────────────────

/** How many times each term is used as an object anywhere in the ontology. */
export function countReferences(onto: Ontology): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (term: string) => counts.set(term, (counts.get(term) ?? 0) + 1);
  const bumpRaw = (triples: UnmappedTriple[] | undefined) => {
    for (const t of triples ?? []) if (!t.isLiteral) bump(t.object);
  };
  const bumpExtras = (extras: ExtraTriple[] | undefined) => {
    for (const et of extras ?? []) {
      if (!et.isLiteral) bump(et.object);
      bumpRaw(et.blankNodeTriples);
    }
  };
  bumpRaw(onto.unmappedTriples);
  bumpExtras(onto.metadata.extraTriples);
  for (const cls of onto.classes) {
    bumpExtras(cls.extraTriples);
    cls.subClassOf.forEach(bump);
    (cls.disjointWith ?? []).forEach(bump);
  }
  for (const prop of onto.properties) bumpExtras(prop.extraTriples);
  for (const ind of onto.individuals ?? []) {
    for (const pv of ind.propertyValues) if (!pv.isLiteral) bump(pv.value);
    ind.typeUris.forEach(bump);
  }
  return counts;
}

/** Every raw triple in the ontology: other statements plus all owned blank-node structures. */
export function allRawTriples(onto: Ontology): UnmappedTriple[] {
  const out = [...onto.unmappedTriples];
  const add = (extras: ExtraTriple[] | undefined) => {
    for (const et of extras ?? []) if (et.blankNodeTriples) out.push(...et.blankNodeTriples);
  };
  add(onto.metadata.extraTriples);
  onto.classes.forEach((cls) => add(cls.extraTriples));
  onto.properties.forEach((prop) => add(prop.extraTriples));
  return out;
}

// ── Ownership of blank-node structures ─────────────────────────────────────

/**
 * Move blank-node structures out of `unmappedTriples` into the extra triple
 * that references them, when that extra is their only way in (a tree of blank
 * nodes each referenced exactly once). Shared or cyclic structures stay put.
 */
export function attachBlankNodeClosures(onto: Ontology): Ontology {
  const refCount = countReferences(onto);
  const bySubject = new Map<string, UnmappedTriple[]>();
  for (const t of onto.unmappedTriples) {
    if (!isBlankNode(t.subject)) continue;
    const list = bySubject.get(t.subject) ?? [];
    list.push(t);
    bySubject.set(t.subject, list);
  }
  const taken = new Set<UnmappedTriple>();

  const closureOf = (root: string): UnmappedTriple[] | null => {
    const out: UnmappedTriple[] = [];
    const seen = new Set<string>();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (seen.has(node) || refCount.get(node) !== 1) return null;
      seen.add(node);
      for (const t of bySubject.get(node) ?? []) {
        if (taken.has(t)) return null;
        out.push(t);
        if (!t.isLiteral && isBlankNode(t.object)) stack.push(t.object);
      }
    }
    return out.length > 0 ? out : null;
  };

  const attach = (extras: ExtraTriple[]): ExtraTriple[] => {
    let changed = false;
    const next = extras.map((et) => {
      if (et.isLiteral || !isBlankNode(et.object) || et.blankNodeTriples?.length) return et;
      const closure = closureOf(et.object);
      if (!closure) return et;
      closure.forEach((t) => taken.add(t));
      changed = true;
      return { ...et, blankNodeTriples: closure };
    });
    return changed ? next : extras;
  };

  const metadataExtras = attach(onto.metadata.extraTriples ?? []);
  const classes = onto.classes.map((cls) => {
    const extraTriples = attach(cls.extraTriples);
    return extraTriples === cls.extraTriples ? cls : { ...cls, extraTriples };
  });
  const properties = onto.properties.map((prop) => {
    const extraTriples = attach(prop.extraTriples);
    return extraTriples === prop.extraTriples ? prop : { ...prop, extraTriples };
  });
  if (taken.size === 0) return onto;
  return {
    ...onto,
    metadata: { ...onto.metadata, extraTriples: metadataExtras },
    classes,
    properties,
    unmappedTriples: onto.unmappedTriples.filter((t) => !taken.has(t)),
  };
}

// ── Relabelling and renaming ───────────────────────────────────────────────

let freshCounter = 0;
/** A blank-node label that can't collide with labels from an import (`_:bN`). */
export function freshBlankNodeLabel(): string {
  freshCounter += 1;
  return `_:n${Date.now().toString(36)}${freshCounter.toString(36)}`;
}

/** Give every blank node in these triples a fresh label (shared nodes stay shared). */
export function freshenTriples(triples: UnmappedTriple[], labels = new Map<string, string>()): UnmappedTriple[] {
  const relabel = (term: string) => {
    if (!isBlankNode(term)) return term;
    let label = labels.get(term);
    if (!label) labels.set(term, (label = freshBlankNodeLabel()));
    return label;
  };
  return triples.map((t) => ({ ...t, subject: relabel(t.subject), object: t.isLiteral ? t.object : relabel(t.object) }));
}

/** Fresh blank-node labels for a list of extras and their owned structures (used on paste). */
export function freshenExtras(extras: ExtraTriple[]): ExtraTriple[] {
  const labels = new Map<string, string>();
  return extras.map((et) => {
    if (!et.blankNodeTriples) return et;
    const [root] = freshenTriples([{ subject: "", predicate: "", object: et.object, isLiteral: false }], labels);
    return { ...et, object: root!.object, blankNodeTriples: freshenTriples(et.blankNodeTriples, labels) };
  });
}

const swap = (term: string, oldIri: string, newIri: string) => (term === oldIri ? newIri : term);

function renameInRaw(triples: UnmappedTriple[], oldIri: string, newIri: string): UnmappedTriple[] {
  if (!triples.some((t) => t.subject === oldIri || t.predicate === oldIri || (!t.isLiteral && t.object === oldIri))) {
    return triples;
  }
  return triples.map((t) => ({
    ...t,
    subject: swap(t.subject, oldIri, newIri),
    predicate: swap(t.predicate, oldIri, newIri),
    object: t.isLiteral ? t.object : swap(t.object, oldIri, newIri),
  }));
}

export function renameInExtras(extras: ExtraTriple[], oldIri: string, newIri: string): ExtraTriple[] {
  return extras.map((et) => ({
    ...et,
    predicate: swap(et.predicate, oldIri, newIri),
    object: et.isLiteral ? et.object : swap(et.object, oldIri, newIri),
    blankNodeTriples: et.blankNodeTriples && renameInRaw(et.blankNodeTriples, oldIri, newIri),
  }));
}

/** Rename an IRI everywhere it can appear outside the typed fields. */
export function renameIriInRawTriples(onto: Ontology, oldIri: string, newIri: string): Ontology {
  return {
    ...onto,
    unmappedTriples: renameInRaw(onto.unmappedTriples, oldIri, newIri),
    metadata: { ...onto.metadata, extraTriples: renameInExtras(onto.metadata.extraTriples ?? [], oldIri, newIri) },
    classes: onto.classes.map((cls) => ({ ...cls, extraTriples: renameInExtras(cls.extraTriples, oldIri, newIri) })),
    properties: onto.properties.map((prop) => ({ ...prop, extraTriples: renameInExtras(prop.extraTriples, oldIri, newIri) })),
    individuals: onto.individuals.map((ind) => ({
      ...ind,
      typeUris: ind.typeUris.map((u) => swap(u, oldIri, newIri)),
      propertyValues: ind.propertyValues.map((pv) => ({
        ...pv,
        propertyUri: swap(pv.propertyUri, oldIri, newIri),
        value: pv.isLiteral ? pv.value : swap(pv.value, oldIri, newIri),
      })),
    })),
  };
}

// ── Routing new raw triples ────────────────────────────────────────────────

const toExtra = (t: UnmappedTriple): ExtraTriple => ({
  predicate: t.predicate, object: t.object, isLiteral: t.isLiteral, lang: t.lang, datatype: t.datatype,
});

/**
 * Add raw triples to the ontology, sending each to its proper home: statements
 * about a class / property become its extra triples, statements about the
 * ontology go to its header (owl:imports → `imports`), the rest become other
 * statements. Blank-node structures are then attached to their owners.
 */
export function addRawTriples(onto: Ontology, triples: UnmappedTriple[]): Ontology {
  const classIdx = new Map(onto.classes.map((cls, i) => [cls.uri, i]));
  const propIdx = new Map(onto.properties.map((prop, i) => [prop.uri, i]));
  const classes = [...onto.classes];
  const properties = [...onto.properties];
  const metadata = { ...onto.metadata, imports: [...(onto.metadata.imports ?? [])], extraTriples: [...(onto.metadata.extraTriples ?? [])] };
  const unmappedTriples = [...onto.unmappedTriples];

  for (const t of triples) {
    const ci = classIdx.get(t.subject);
    const pi = propIdx.get(t.subject);
    if (ci !== undefined) {
      classes[ci] = { ...classes[ci]!, extraTriples: [...classes[ci]!.extraTriples, toExtra(t)] };
    } else if (pi !== undefined) {
      properties[pi] = { ...properties[pi]!, extraTriples: [...properties[pi]!.extraTriples, toExtra(t)] };
    } else if (t.subject && t.subject === metadata.ontologyUri) {
      if (t.predicate === OWL.imports && !t.isLiteral && !isBlankNode(t.object)) {
        if (!metadata.imports.includes(t.object)) metadata.imports.push(t.object);
      } else {
        metadata.extraTriples.push(toExtra(t));
      }
    } else {
      unmappedTriples.push(t);
    }
  }
  return attachBlankNodeClosures({ ...onto, classes, properties, metadata, unmappedTriples });
}
