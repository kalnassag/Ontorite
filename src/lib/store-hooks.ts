/**
 * Narrow subscriptions to the active ontology. Each returns a stable reference
 * until that slice actually changes, so components re-render only when the
 * data they show changes (e.g. editing a property doesn't re-render every
 * card's prefix-dependent labels).
 */

import type { Individual, OntologyClass, OntologyProperty } from "../types";
import { useStore, selectActiveOntology } from "./store";

const EMPTY_PREFIXES: Record<string, string> = {};
const EMPTY_CLASSES: OntologyClass[] = [];
const EMPTY_PROPERTIES: OntologyProperty[] = [];
const EMPTY_INDIVIDUALS: Individual[] = [];

export const useActivePrefixes = () =>
  useStore((s) => selectActiveOntology(s)?.metadata.prefixes ?? EMPTY_PREFIXES);

export const useActiveClasses = () =>
  useStore((s) => selectActiveOntology(s)?.classes ?? EMPTY_CLASSES);

export const useActiveProperties = () =>
  useStore((s) => selectActiveOntology(s)?.properties ?? EMPTY_PROPERTIES);

export const useActiveIndividuals = () =>
  useStore((s) => selectActiveOntology(s)?.individuals ?? EMPTY_INDIVIDUALS);
