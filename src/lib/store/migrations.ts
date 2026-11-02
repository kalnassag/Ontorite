/**
 * Migrations for ontologies persisted by older versions of Ontorite.
 *
 * Everything here is idempotent: running it on already-current data is a no-op,
 * so `migrateOntology` runs on every load.
 */

import type { Ontology, OntologyProperty, ClassExpression } from "../../types";
import { RDF, OWL, SKOS, DCT } from "../vocab";
import { attachBlankNodeClosures } from "../raw-triples";

/** Bring a persisted ontology up to the current shape. Mutates in place. */
export function migrateOntology(onto: Ontology): void {
  if (!onto.individuals) onto.individuals = [];
  if (!onto.unmappedTriples) onto.unmappedTriples = [];
  for (const cls of onto.classes) {
    if (!cls.subClassOf) cls.subClassOf = [];
    if (!cls.disjointWith) cls.disjointWith = [];
    if (!cls.restrictions) cls.restrictions = [];
    if (!cls.extraTriples) cls.extraTriples = [];
    if (!cls.editorialNotes) cls.editorialNotes = [];
  }
  for (const prop of onto.properties) {
    if (!prop.extraTriples) prop.extraTriples = [];
    if (!prop.editorialNotes) prop.editorialNotes = [];
    // v1 single `range` string → v2 ranges array (turned into ClassExpression[] by hoistClassExpressions)
    if (!prop.ranges) {
      const legacy = (prop as unknown as { range?: string }).range;
      prop.ranges = legacy ? [legacy as unknown as ClassExpression] : [];
    }
  }
  for (const ind of onto.individuals) {
    if (!ind.editorialNotes) ind.editorialNotes = [];
  }
  if (onto.metadata.versionIRI === undefined) onto.metadata.versionIRI = "";
  if (onto.metadata.versionInfo === undefined) onto.metadata.versionInfo = "";
  if (!onto.metadata.editorialNotes) onto.metadata.editorialNotes = [];
  if (!onto.metadata.imports) onto.metadata.imports = [];
  if (!onto.metadata.extraTriples) onto.metadata.extraTriples = [];
  sweepLegacyTriples(onto);
  hoistClassExpressions(onto);
  moveHeaderTriples(onto);
  // Blank-node structures referenced from one statement move in with it
  Object.assign(onto, attachBlankNodeClosures(onto));
}

/**
 * Older versions left statements about the ontology itself (owl:imports,
 * dcterms:license, …) in unmappedTriples; they belong to its header.
 */
export function moveHeaderTriples(onto: Ontology): void {
  const ontoUri = onto.metadata.ontologyUri;
  if (!ontoUri) return;
  const keep: typeof onto.unmappedTriples = [];
  for (const t of onto.unmappedTriples) {
    if (t.subject !== ontoUri) { keep.push(t); continue; }
    if (t.predicate === OWL.imports && !t.isLiteral && !t.object.startsWith("_:")) {
      if (!onto.metadata.imports.includes(t.object)) onto.metadata.imports.push(t.object);
    } else {
      onto.metadata.extraTriples.push({
        predicate: t.predicate, object: t.object, isLiteral: t.isLiteral, lang: t.lang, datatype: t.datatype,
      });
    }
  }
  onto.unmappedTriples = keep;
}

/**
 * One-time migration: convert legacy `domainUri: string` and `ranges: string[]`
 * to ClassExpression shape, hoisting blank-node owl:unionOf classes into
 * union expressions on the properties that reference them.
 *
 * Safe to re-run — once the blank-node class is removed and shapes are
 * already ClassExpression, the function is a no-op.
 *
 * Exported for unit tests.
 */
export function hoistClassExpressions(onto: Ontology): void {
  // Build a list-cell map from unmappedTriples so we can resolve owl:unionOf lists
  const firstMap = new Map<string, string>();
  const restMap  = new Map<string, string>();
  for (const t of onto.unmappedTriples) {
    if (t.isLiteral) continue;
    if (t.predicate === RDF.first) firstMap.set(t.subject, t.object);
    if (t.predicate === RDF.rest)  restMap.set(t.subject, t.object);
  }
  const resolveList = (head: string): string[] => {
    const members: string[] = [];
    const seen = new Set<string>();
    let cur = head;
    while (cur !== RDF.nil) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const m = firstMap.get(cur);
      if (m === undefined) break;
      members.push(m);
      cur = restMap.get(cur) ?? RDF.nil;
    }
    return members;
  };

  // bnode class URI → union member URIs
  const unionByBNode = new Map<string, string[]>();
  const consumedListCells = new Set<string>();
  for (const cls of onto.classes) {
    if (!cls.uri.startsWith("_:")) continue;
    const unionEt = cls.extraTriples.find((et) => !et.isLiteral && et.predicate === OWL.unionOf);
    if (!unionEt) continue;
    const members = resolveList(unionEt.object);
    if (members.length === 0) continue;
    unionByBNode.set(cls.uri, members);
    // Mark list cells starting at unionEt.object as consumed
    let cur = unionEt.object;
    while (cur !== RDF.nil && !consumedListCells.has(cur)) {
      consumedListCells.add(cur);
      cur = restMap.get(cur) ?? RDF.nil;
    }
  }

  /** Convert a legacy URI (possibly a blank-node union ref) to a ClassExpression. */
  const toClassExpr = (uri: string): ClassExpression => {
    const u = unionByBNode.get(uri);
    if (u) return { kind: "union", uris: u };
    return { kind: "class", uri };
  };

  // Migrate each property — legacy `domainUri` / array-of-string `ranges`
  // get translated to ClassExpression. Already-migrated properties are
  // detected by `domain` being defined and skipped.
  for (const prop of onto.properties) {
    const legacy = prop as unknown as { domainUri?: string; ranges?: unknown };
    if (legacy.domainUri !== undefined && !(prop as Partial<OntologyProperty>).domain) {
      prop.domain = toClassExpr(legacy.domainUri);
      delete legacy.domainUri;
    }
    if (Array.isArray(legacy.ranges)) {
      const arr = legacy.ranges as unknown[];
      const allStrings = arr.every((r) => typeof r === "string");
      if (allStrings) {
        prop.ranges = (arr as string[]).map(toClassExpr);
      }
    }
    if (!prop.domain) prop.domain = { kind: "class", uri: "" };
    if (!Array.isArray(prop.ranges)) prop.ranges = [];
  }

  // Drop blank-node union classes — they no longer have a UI representation
  if (unionByBNode.size > 0) {
    onto.classes = onto.classes.filter((c) => !unionByBNode.has(c.uri));
    onto.unmappedTriples = onto.unmappedTriples.filter((t) => {
      if (consumedListCells.has(t.subject) && (t.predicate === RDF.first || t.predicate === RDF.rest)) return false;
      return true;
    });
  }
}

/**
 * One-time migration helper: hoist legacy skos:editorialNote and
 * owl:versionIRI/versionInfo triples out of extraTriples/unmappedTriples
 * into the new typed fields. Safe to re-run — once the buckets no longer
 * contain those predicates, the function is a no-op.
 *
 * Exported for unit tests.
 */
export function sweepLegacyTriples(onto: Ontology): void {
  // Classes: move skos:editorialNote + dcterms:created/modified from extraTriples
  for (const cls of onto.classes) {
    const keep: typeof cls.extraTriples = [];
    for (const et of cls.extraTriples) {
      if (et.predicate === SKOS.editorialNote && et.isLiteral) {
        cls.editorialNotes.push({ value: et.object, lang: et.lang ?? "" });
      } else if (et.predicate === DCT.created && et.isLiteral) {
        if (!cls.created) cls.created = et.object;
      } else if (et.predicate === DCT.modified && et.isLiteral) {
        if (!cls.modified) cls.modified = et.object;
      } else {
        keep.push(et);
      }
    }
    cls.extraTriples = keep;
  }
  // Properties: same
  for (const prop of onto.properties) {
    const keep: typeof prop.extraTriples = [];
    for (const et of prop.extraTriples) {
      if (et.predicate === SKOS.editorialNote && et.isLiteral) {
        prop.editorialNotes.push({ value: et.object, lang: et.lang ?? "" });
      } else if (et.predicate === DCT.created && et.isLiteral) {
        if (!prop.created) prop.created = et.object;
      } else if (et.predicate === DCT.modified && et.isLiteral) {
        if (!prop.modified) prop.modified = et.object;
      } else {
        keep.push(et);
      }
    }
    prop.extraTriples = keep;
  }
  // Ontology-level: sweep unmappedTriples for editorial notes / version triples
  // whose subject is the ontology URI.
  const ontoUri = onto.metadata.ontologyUri;
  const keepUnmapped: typeof onto.unmappedTriples = [];
  for (const t of onto.unmappedTriples) {
    if (t.subject && ontoUri && t.subject === ontoUri) {
      if (t.predicate === OWL.versionIRI && !t.isLiteral) {
        if (!onto.metadata.versionIRI) onto.metadata.versionIRI = t.object;
        continue;
      }
      if (t.predicate === OWL.versionInfo && t.isLiteral) {
        if (!onto.metadata.versionInfo) onto.metadata.versionInfo = t.object;
        continue;
      }
      if (t.predicate === SKOS.editorialNote && t.isLiteral) {
        onto.metadata.editorialNotes.push({ value: t.object, lang: t.lang ?? "" });
        continue;
      }
      if (t.predicate === DCT.created && t.isLiteral) {
        if (!onto.metadata.created) onto.metadata.created = t.object;
        continue;
      }
      if (t.predicate === DCT.modified && t.isLiteral) {
        if (!onto.metadata.modified) onto.metadata.modified = t.object;
        continue;
      }
    }
    keepUnmapped.push(t);
  }
  onto.unmappedTriples = keepUnmapped;
}
