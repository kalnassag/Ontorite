/**
 * OWL property characteristics (owl:FunctionalProperty, owl:TransitiveProperty, …).
 *
 * They're stored as `rdf:type` entries in a property's extraTriples, so they
 * round-trip losslessly with no model change; these helpers give the UI a
 * typed view over them.
 */

import type { ExtraTriple, OntologyProperty, PropertyType } from "../types";
import { OWL, RDF } from "./vocab";

export interface Characteristic {
  iri: string;
  label: string;
  /** One-letter badge shown in property rows */
  short: string;
  appliesTo: PropertyType[];
}

const OBJECT: PropertyType[] = ["owl:ObjectProperty"];

export const CHARACTERISTICS: Characteristic[] = [
  { iri: OWL.FunctionalProperty, label: "Functional", short: "F", appliesTo: ["owl:ObjectProperty", "owl:DatatypeProperty"] },
  { iri: OWL.InverseFunctionalProperty, label: "Inverse functional", short: "IF", appliesTo: OBJECT },
  { iri: OWL.TransitiveProperty, label: "Transitive", short: "T", appliesTo: OBJECT },
  { iri: OWL.SymmetricProperty, label: "Symmetric", short: "S", appliesTo: OBJECT },
  { iri: OWL.AsymmetricProperty, label: "Asymmetric", short: "AS", appliesTo: OBJECT },
  { iri: OWL.ReflexiveProperty, label: "Reflexive", short: "R", appliesTo: OBJECT },
  { iri: OWL.IrreflexiveProperty, label: "Irreflexive", short: "IR", appliesTo: OBJECT },
];

const isTypeTriple = (et: ExtraTriple, iri: string, expand: (s: string) => string) =>
  !et.isLiteral && expand(et.predicate) === RDF.type && expand(et.object) === iri;

/** Characteristics declared on a property (extraTriples hold full IRIs). */
export function characteristicsOf(prop: OntologyProperty): Characteristic[] {
  return CHARACTERISTICS.filter((ch) => prop.extraTriples.some((et) => isTypeTriple(et, ch.iri, (s) => s)));
}

/** Whether a characteristic is set in an extra-triples list (possibly in prefixed form). */
export function hasCharacteristic(extras: ExtraTriple[], iri: string, expand: (s: string) => string): boolean {
  return extras.some((et) => isTypeTriple(et, iri, expand));
}

/** Add or remove a characteristic's rdf:type triple. `typeTriple` is written in the list's own form. */
export function toggleCharacteristic(
  extras: ExtraTriple[],
  iri: string,
  on: boolean,
  expand: (s: string) => string,
  typeTriple: ExtraTriple,
): ExtraTriple[] {
  const without = extras.filter((et) => !isTypeTriple(et, iri, expand));
  return on ? [...without, typeTriple] : without;
}
