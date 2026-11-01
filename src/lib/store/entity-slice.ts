/**
 * Class, property, individual and preserved-triple edits on the active ontology.
 * Every action goes through `commit`, which handles undo + persistence.
 */

import type { ClassExpression, ExtraTriple, Individual, OntologyClass, OntologyProperty } from "../../types";
import { classExprReplace, classExprRemove } from "../../types";
import { buildUri, toPascalCase, toCamelCase } from "../uri-utils";
import { genId, nowIso } from "./ids";
import type { Slice } from "./types";

type EntityKeys =
  | "addClass" | "updateClass" | "deleteClass"
  | "addProperty" | "updateProperty" | "deleteProperty"
  | "addIndividual" | "updateIndividual" | "deleteIndividual"
  | "updateIndividualProperty" | "addIndividualProperty" | "removeIndividualProperty"
  | "updateUnmappedTriple" | "deleteUnmappedTriple" | "promoteUnmappedTriple";

const renameIn = (uris: string[], oldUri: string, newUri: string) => uris.map((u) => (u === oldUri ? newUri : u));
const EMPTY_DOMAIN: ClassExpression = { kind: "class", uri: "" };

export const entitySlice: Slice<EntityKeys> = (_set, get, { commit }) => {
  /** Map one individual of the active ontology. */
  const mapIndividual = (id: string, fn: (ind: Individual) => Individual) =>
    commit((o) => ({ ...o, individuals: o.individuals.map((ind) => (ind.id === id ? fn(ind) : ind)) }));

  return {
    // ── Classes ──────────────────────────────────────────────────────────
    addClass: (partial) => {
      const id = genId();
      const onto = get().getActiveOntology();
      if (!onto) return id;
      const lang = onto.metadata.defaultLanguage;
      const label = partial.labels?.[0]?.value || "NewClass";
      const localName = partial.localName || toPascalCase(label);
      const now = nowIso();
      const cls: OntologyClass = {
        id,
        localName,
        uri: partial.uri || buildUri(onto.metadata.baseUri, localName),
        labels: partial.labels || [{ value: label, lang }],
        descriptions: partial.descriptions || [{ value: "", lang }],
        editorialNotes: partial.editorialNotes || [],
        created: partial.created ?? now,
        modified: partial.modified ?? now,
        subClassOf: partial.subClassOf || [],
        disjointWith: partial.disjointWith || [],
        restrictions: partial.restrictions || [],
        extraTriples: partial.extraTriples || [],
      };
      commit((o) => ({ ...o, classes: [...o.classes, cls] }));
      return id;
    },

    updateClass: (id, patch) => {
      const stamp = nowIso();
      commit((o) => {
        const oldUri = o.classes.find((c) => c.id === id)?.uri;
        const newUri = patch.uri ?? oldUri;
        const renamed = !!oldUri && !!newUri && oldUri !== newUri;
        return {
          ...o,
          classes: o.classes.map((c) => {
            if (c.id === id) return { ...c, ...patch, modified: patch.modified ?? stamp };
            if (!renamed) return c;
            return { ...c, subClassOf: renameIn(c.subClassOf, oldUri, newUri), disjointWith: renameIn(c.disjointWith, oldUri, newUri) };
          }),
          properties: !renamed ? o.properties : o.properties.map((p) => ({
            ...p,
            domain: classExprReplace(p.domain, oldUri, newUri),
            ranges: p.ranges.map((r) => classExprReplace(r, oldUri, newUri)),
          })),
        };
      });
    },

    deleteClass: (id) => {
      commit((o) => {
        const cls = o.classes.find((c) => c.id === id);
        if (!cls) return o;
        return {
          ...o,
          classes: o.classes
            .filter((c) => c.id !== id)
            .map((c) => ({
              ...c,
              subClassOf: c.subClassOf.filter((u) => u !== cls.uri),
              disjointWith: c.disjointWith.filter((u) => u !== cls.uri),
            })),
          properties: o.properties.map((p) => ({
            ...p,
            domain: classExprRemove(p.domain, cls.uri) ?? EMPTY_DOMAIN,
            ranges: p.ranges.map((r) => classExprRemove(r, cls.uri)).filter((r): r is ClassExpression => r !== null),
          })),
        };
      });
    },

    // ── Properties ───────────────────────────────────────────────────────
    addProperty: (partial) => {
      const id = genId();
      const onto = get().getActiveOntology();
      if (!onto) return id;
      const lang = onto.metadata.defaultLanguage;
      const label = partial.labels?.[0]?.value || "newProperty";
      const localName = partial.localName || toCamelCase(label);
      const now = nowIso();
      const prop: OntologyProperty = {
        id,
        localName,
        uri: partial.uri || buildUri(onto.metadata.baseUri, localName),
        type: partial.type || "owl:DatatypeProperty",
        labels: partial.labels || [{ value: label, lang }],
        descriptions: partial.descriptions || [{ value: "", lang }],
        editorialNotes: partial.editorialNotes || [],
        created: partial.created ?? now,
        modified: partial.modified ?? now,
        domain: partial.domain ?? EMPTY_DOMAIN,
        ranges: partial.ranges ?? [],
        subPropertyOf: partial.subPropertyOf || [],
        inverseOf: partial.inverseOf,
        minCardinality: partial.minCardinality,
        maxCardinality: partial.maxCardinality,
        exactCardinality: partial.exactCardinality,
        extraTriples: partial.extraTriples || [],
      };
      commit((o) => ({ ...o, properties: [...o.properties, prop] }));
      return id;
    },

    updateProperty: (id, patch) => {
      const stamp = nowIso();
      commit((o) => {
        const oldUri = o.properties.find((p) => p.id === id)?.uri;
        const newUri = patch.uri ?? oldUri;
        const renamed = !!oldUri && !!newUri && oldUri !== newUri;
        return {
          ...o,
          properties: o.properties.map((p) => {
            if (p.id === id) return { ...p, ...patch, modified: patch.modified ?? stamp };
            if (!renamed) return p;
            return {
              ...p,
              subPropertyOf: renameIn(p.subPropertyOf, oldUri, newUri),
              inverseOf: p.inverseOf === oldUri ? newUri : p.inverseOf,
            };
          }),
          // Restrictions reference properties by URI too
          classes: !renamed ? o.classes : o.classes.map((c) =>
            c.restrictions.some((r) => r.propertyUri === oldUri)
              ? { ...c, restrictions: c.restrictions.map((r) => (r.propertyUri === oldUri ? { ...r, propertyUri: newUri } : r)) }
              : c),
        };
      });
    },

    deleteProperty: (id) => {
      commit((o) => {
        const prop = o.properties.find((p) => p.id === id);
        if (!prop) return o;
        return {
          ...o,
          properties: o.properties
            .filter((p) => p.id !== id)
            .map((p) => ({
              ...p,
              subPropertyOf: p.subPropertyOf.filter((u) => u !== prop.uri),
              inverseOf: p.inverseOf === prop.uri ? undefined : p.inverseOf,
            })),
        };
      });
    },

    // ── Individuals ──────────────────────────────────────────────────────
    addIndividual: (label, typeUri) => {
      const id = genId();
      const onto = get().getActiveOntology();
      if (!onto) return id;
      const localName = toCamelCase(label) || id;
      const now = nowIso();
      const individual: Individual = {
        id,
        uri: buildUri(onto.metadata.baseUri, localName),
        localName,
        typeUris: [typeUri],
        propertyValues: [],
        editorialNotes: [],
        created: now,
        modified: now,
      };
      commit((o) => ({ ...o, individuals: [...o.individuals, individual] }));
      return id;
    },

    updateIndividual: (id, patch) => {
      const stamp = nowIso();
      commit((o) => {
        const oldUri = o.individuals.find((i) => i.id === id)?.uri;
        const newUri = patch.uri ?? oldUri;
        const renamed = !!oldUri && !!newUri && oldUri !== newUri;
        return {
          ...o,
          individuals: o.individuals.map((ind) => {
            if (ind.id === id) return { ...ind, ...patch, modified: patch.modified ?? stamp };
            if (!renamed) return ind;
            // Cascade the rename into other individuals' object-property values
            return {
              ...ind,
              propertyValues: ind.propertyValues.map((pv) => (!pv.isLiteral && pv.value === oldUri ? { ...pv, value: newUri } : pv)),
            };
          }),
        };
      });
    },

    deleteIndividual: (id) => commit((o) => ({ ...o, individuals: o.individuals.filter((ind) => ind.id !== id) })),

    updateIndividualProperty: (individualId, index, patch) =>
      mapIndividual(individualId, (ind) => ({
        ...ind,
        propertyValues: ind.propertyValues.map((pv, i) => (i === index ? { ...pv, ...patch } : pv)),
      })),

    addIndividualProperty: (individualId, propVal) =>
      mapIndividual(individualId, (ind) => ({ ...ind, propertyValues: [...ind.propertyValues, propVal] })),

    removeIndividualProperty: (individualId, index) =>
      mapIndividual(individualId, (ind) => ({ ...ind, propertyValues: ind.propertyValues.filter((_, i) => i !== index) })),

    // ── Preserved (unmapped) triples ─────────────────────────────────────
    updateUnmappedTriple: (index, patch) =>
      commit((o) => ({ ...o, unmappedTriples: o.unmappedTriples.map((t, i) => (i === index ? { ...t, ...patch } : t)) })),

    deleteUnmappedTriple: (index) =>
      commit((o) => ({ ...o, unmappedTriples: o.unmappedTriples.filter((_, i) => i !== index) })),

    promoteUnmappedTriple: (index, targetEntityId) =>
      commit((o) => {
        const t = o.unmappedTriples[index];
        if (!t) return o;
        const extra: ExtraTriple = { predicate: t.predicate, object: t.object, isLiteral: t.isLiteral, lang: t.lang, datatype: t.datatype };
        const unmappedTriples = o.unmappedTriples.filter((_, i) => i !== index);
        if (o.classes.some((c) => c.id === targetEntityId)) {
          return {
            ...o,
            unmappedTriples,
            classes: o.classes.map((c) => (c.id === targetEntityId ? { ...c, extraTriples: [...c.extraTriples, extra] } : c)),
          };
        }
        if (o.properties.some((p) => p.id === targetEntityId)) {
          return {
            ...o,
            unmappedTriples,
            properties: o.properties.map((p) => (p.id === targetEntityId ? { ...p, extraTriples: [...p.extraTriples, extra] } : p)),
          };
        }
        return o;
      }),
  };
};
