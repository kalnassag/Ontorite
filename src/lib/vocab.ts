/**
 * Shared RDF / OWL / RDFS / SKOS / DCTERMS vocabulary IRIs.
 *
 * Single source for the full IRIs the parser, model builder, serializer,
 * migrations and validation all need. Import from here rather than
 * re-declaring string constants per module.
 */

export const NS = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  dcterms: "http://purl.org/dc/terms/",
} as const;

export const RDF = {
  type: NS.rdf + "type",
  first: NS.rdf + "first",
  rest: NS.rdf + "rest",
  nil: NS.rdf + "nil",
  Property: NS.rdf + "Property",
  langString: NS.rdf + "langString",
} as const;

export const RDFS = {
  Class: NS.rdfs + "Class",
  label: NS.rdfs + "label",
  comment: NS.rdfs + "comment",
  domain: NS.rdfs + "domain",
  range: NS.rdfs + "range",
  subClassOf: NS.rdfs + "subClassOf",
  subPropertyOf: NS.rdfs + "subPropertyOf",
} as const;

export const OWL = {
  Ontology: NS.owl + "Ontology",
  Class: NS.owl + "Class",
  Thing: NS.owl + "Thing",
  Restriction: NS.owl + "Restriction",
  NamedIndividual: NS.owl + "NamedIndividual",
  ObjectProperty: NS.owl + "ObjectProperty",
  DatatypeProperty: NS.owl + "DatatypeProperty",
  AnnotationProperty: NS.owl + "AnnotationProperty",
  FunctionalProperty: NS.owl + "FunctionalProperty",
  InverseFunctionalProperty: NS.owl + "InverseFunctionalProperty",
  TransitiveProperty: NS.owl + "TransitiveProperty",
  SymmetricProperty: NS.owl + "SymmetricProperty",
  AsymmetricProperty: NS.owl + "AsymmetricProperty",
  ReflexiveProperty: NS.owl + "ReflexiveProperty",
  IrreflexiveProperty: NS.owl + "IrreflexiveProperty",
  unionOf: NS.owl + "unionOf",
  equivalentClass: NS.owl + "equivalentClass",
  disjointWith: NS.owl + "disjointWith",
  inverseOf: NS.owl + "inverseOf",
  onProperty: NS.owl + "onProperty",
  someValuesFrom: NS.owl + "someValuesFrom",
  allValuesFrom: NS.owl + "allValuesFrom",
  hasValue: NS.owl + "hasValue",
  minCardinality: NS.owl + "minCardinality",
  maxCardinality: NS.owl + "maxCardinality",
  cardinality: NS.owl + "cardinality",
  versionIRI: NS.owl + "versionIRI",
  versionInfo: NS.owl + "versionInfo",
  imports: NS.owl + "imports",
} as const;

export const XSD = {
  string: NS.xsd + "string",
  integer: NS.xsd + "integer",
  decimal: NS.xsd + "decimal",
  boolean: NS.xsd + "boolean",
  dateTime: NS.xsd + "dateTime",
  nonNegativeInteger: NS.xsd + "nonNegativeInteger",
} as const;

export const SKOS = {
  editorialNote: NS.skos + "editorialNote",
} as const;

export const DCT = {
  created: NS.dcterms + "created",
  modified: NS.dcterms + "modified",
} as const;

/**
 * OWL property characteristics that only apply to object properties in OWL 2 DL.
 * A subject typed with one of these (and no explicit property type) is an
 * owl:ObjectProperty.
 */
export const OBJECT_PROPERTY_CHARACTERISTICS: ReadonlySet<string> = new Set([
  OWL.InverseFunctionalProperty,
  OWL.TransitiveProperty,
  OWL.SymmetricProperty,
  OWL.AsymmetricProperty,
  OWL.ReflexiveProperty,
  OWL.IrreflexiveProperty,
]);

/** Namespaces of well-known vocabularies — never promoted to local classes. */
export const WELL_KNOWN_NAMESPACES: readonly string[] = [
  NS.rdf, NS.rdfs, NS.owl, NS.xsd, NS.skos, NS.dcterms,
];

export const isBlankNode = (term: string): boolean => term.startsWith("_:");
