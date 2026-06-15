// ── Core Domain Types ──────────────────────────────────────────────────

/** A language-tagged string value (e.g., "Dog"@en) */
export interface LangString {
  value: string;
  lang: string; // BCP 47 tag or empty string for untagged
}

/** An additional triple attached to an entity that the model doesn't have a dedicated field for.
 *  E.g., prov:wasQuotedFrom, skos:prefLabel, dcterms:creator, owl:disjointWith, etc. */
export interface ExtraTriple {
  predicate: string;
  object: string;
  isLiteral: boolean;
  lang?: string;
  datatype?: string;
}

/** Property type discriminator */
export type PropertyType =
  | "owl:ObjectProperty"
  | "owl:DatatypeProperty"
  | "owl:AnnotationProperty";

/** An OWL 2 Restriction (e.g. owl:someValuesFrom) */
export interface OntologyRestriction {
  propertyUri: string; // e.g. owl:onProperty -> :hasTopping
  type: "someValuesFrom" | "allValuesFrom" | "hasValue" | "minCardinality" | "maxCardinality" | "exactCardinality";
  value: string; // Target URI or literal
}

/** An OWL class in the ontology */
export interface OntologyClass {
  id: string;
  localName: string; // PascalCase fragment after base URI
  uri: string; // Full URI = baseUri + localName
  labels: LangString[];
  descriptions: LangString[];
  /** Multilingual editorial notes (skos:editorialNote) */
  editorialNotes: LangString[];
  subClassOf: string[]; // URIs of parent classes
  disjointWith: string[]; // URIs of disjoint classes (owl:disjointWith)
  /** Logical restrictions defining this class */
  restrictions: OntologyRestriction[];
  /** Additional triples not mapped to dedicated fields (e.g., prov:wasQuotedFrom) */
  extraTriples: ExtraTriple[];
}

/** An OWL property (object, datatype, or annotation) */
export interface OntologyProperty {
  id: string;
  localName: string; // camelCase fragment after base URI
  uri: string;
  type: PropertyType;
  labels: LangString[];
  descriptions: LangString[];
  /** Multilingual editorial notes (skos:editorialNote) */
  editorialNotes: LangString[];
  domainUri: string; // URI of the class this property belongs to (rdfs:domain)
  ranges: string[]; // One or more range URIs (rdfs:range); was single string in v1
  subPropertyOf: string[]; // URIs of parent properties
  /** URI of the inverse property (owl:inverseOf) — ObjectProperty only */
  inverseOf?: string;
  /** Simplified cardinality constraints (not OWL 2 restriction blank nodes) */
  minCardinality?: number;
  maxCardinality?: number;
  exactCardinality?: number;
  /** Additional triples not mapped to dedicated fields */
  extraTriples: ExtraTriple[];
}

/** Ontology-level metadata */
export interface OntologyMetadata {
  baseUri: string; // Namespace URI (e.g., "http://example.org/ontology/")
  ontologyUri: string; // The owl:Ontology subject URI
  ontologyLabel: string;
  ontologyComment: string;
  /** owl:versionIRI — full IRI identifying this specific version */
  versionIRI: string;
  /** owl:versionInfo — human-readable version string (e.g. "1.2.0") */
  versionInfo: string;
  /** Multilingual editorial notes on the ontology itself (skos:editorialNote) */
  editorialNotes: LangString[];
  prefixes: Record<string, string>; // prefix → URI
  defaultLanguage: string; // Default lang tag for new labels (user pref, not auto-applied)
}

/** A property value on an individual */
export interface IndividualPropertyValue {
  propertyUri: string;
  value: string; // URI for object properties, literal value for datatype/annotation
  isLiteral: boolean;
  lang?: string;
  datatype?: string;
}

/** An individual (instance of a class) — used for example data */
export interface Individual {
  id: string;
  uri: string;
  localName: string;
  /** rdf:type URIs — the classes this individual is an instance of */
  typeUris: string[];
  /** All property assertions on this individual */
  propertyValues: IndividualPropertyValue[];
  /** Multilingual editorial notes (skos:editorialNote) */
  editorialNotes: LangString[];
}

/** A triple that the parser found but the model doesn't explicitly support */
export interface UnmappedTriple {
  subject: string;
  predicate: string;
  object: string;
  isLiteral: boolean;
  lang?: string;
  datatype?: string;
}

/** A complete ontology */
export interface Ontology {
  id: string;
  metadata: OntologyMetadata;
  classes: OntologyClass[];
  properties: OntologyProperty[];
  individuals: Individual[];
  unmappedTriples: UnmappedTriple[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// ── UI State Types ─────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: "error" | "warning";
  entityId: string;
  entityType: "class" | "property" | "ontology";
  message: string;
  field?: string;
}

/** What the store exposes */
export interface OntologyStore {
  // Data
  ontologies: Ontology[];
  activeOntologyId: string | null;

  // Computed (derived in selectors, not stored)
  // activeOntology, classesSorted, propertiesByDomain, unassignedProperties, validationIssues

  // Actions — ontology lifecycle
  createOntology: (meta: Partial<OntologyMetadata>) => string; // returns new ID
  importOntology: (turtleText: string, fileName: string) => string; // returns new ID
  deleteOntology: (id: string) => void;
  setActiveOntology: (id: string) => void;
  updateMetadata: (patch: Partial<OntologyMetadata>) => void;

  // Actions — classes
  addClass: (cls: Partial<OntologyClass>) => string;
  updateClass: (id: string, patch: Partial<OntologyClass>) => void;
  deleteClass: (id: string) => void;

  // Actions — properties
  addProperty: (prop: Partial<OntologyProperty>) => string;
  updateProperty: (id: string, patch: Partial<OntologyProperty>) => void;
  deleteProperty: (id: string) => void;

  // Actions — individuals
  addIndividual: (label: string, typeUri: string) => string;
  deleteIndividual: (id: string) => void;

  // Actions — export
  exportTurtle: () => string;

  // Actions — history
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// ── Clipboard Types ────────────────────────────────────────────────────

/**
 * What's currently on the internal clipboard.
 * Persists in Zustand memory (not IndexedDB) — survives ontology switching
 * within a session so classes/properties can be pasted into a different ontology.
 */
export type ClipboardItem =
  | { type: "class"; cls: OntologyClass; properties: OntologyProperty[] }
  | { type: "property"; property: OntologyProperty };

// ── Parser Types ───────────────────────────────────────────────────────

export interface ParsedTriple {
  s: string;
  p: string;
  o: string;
  isLiteral: boolean;
  lang?: string;
  datatype?: string;
}

export interface ParseResult {
  prefixes: Record<string, string>;
  baseUri: string;
  triples: ParsedTriple[];
  errors: ParseError[];
  /** Number of blank-node subjects encountered and skipped (data loss warning) */
  blankNodeCount: number;
}

export interface ParseError {
  line?: number;
  message: string;
}
