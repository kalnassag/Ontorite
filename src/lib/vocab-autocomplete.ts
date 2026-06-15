/**
 * Curated autocomplete index for standard RDF/OWL vocabularies and well-known
 * community vocabularies. Used by VocabAutocomplete to suggest classes,
 * properties, and datatypes as the user types.
 *
 * Coverage: owl, rdf, rdfs, xsd, skos, dcterms, foaf, schema.org, prov, dcat,
 * void, vann. Each entry includes a prefix-style URI for compact display.
 *
 * Source-of-truth note: kept small on purpose. Add terms here when they come
 * up repeatedly in real ontologies — not for completeness' sake.
 */

export type VocabKind = "class" | "property" | "datatype" | "ontology";

export interface VocabEntry {
  prefix: string;
  localName: string;
  uri: string;
  label: string;
  kind: VocabKind;
}

export interface VocabFilter {
  /** Restrict to these kinds. */
  kinds?: VocabKind[];
  /** Restrict to these vocabulary prefixes. */
  prefixes?: string[];
}

const OWL_NS  = "http://www.w3.org/2002/07/owl#";
const RDF_NS  = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#";
const XSD_NS  = "http://www.w3.org/2001/XMLSchema#";
const SKOS_NS = "http://www.w3.org/2004/02/skos/core#";
const DCT_NS  = "http://purl.org/dc/terms/";
const FOAF_NS = "http://xmlns.com/foaf/0.1/";
const SCH_NS  = "https://schema.org/";
const PROV_NS = "http://www.w3.org/ns/prov#";
const DCAT_NS = "http://www.w3.org/ns/dcat#";
const VOID_NS = "http://rdfs.org/ns/void#";
const VANN_NS = "http://purl.org/vocab/vann/";

/** Well-known prefix → namespace mapping for the prefix-editor autocomplete. */
export const WELL_KNOWN_PREFIXES: Record<string, string> = {
  owl: OWL_NS,
  rdf: RDF_NS,
  rdfs: RDFS_NS,
  xsd: XSD_NS,
  skos: SKOS_NS,
  dcterms: DCT_NS,
  dc: "http://purl.org/dc/elements/1.1/",
  foaf: FOAF_NS,
  schema: SCH_NS,
  prov: PROV_NS,
  dcat: DCAT_NS,
  void: VOID_NS,
  vann: VANN_NS,
  vcard: "http://www.w3.org/2006/vcard/ns#",
  sioc: "http://rdfs.org/sioc/ns#",
  geo: "http://www.w3.org/2003/01/geo/wgs84_pos#",
  org: "http://www.w3.org/ns/org#",
  qb: "http://purl.org/linked-data/cube#",
};

function E(prefix: string, ns: string, local: string, label: string, kind: VocabKind): VocabEntry {
  return { prefix, localName: local, uri: ns + local, label, kind };
}

const ENTRIES: VocabEntry[] = [
  // ── XSD datatypes ──────────────────────────────────────────────────
  E("xsd", XSD_NS, "string",             "String",                "datatype"),
  E("xsd", XSD_NS, "integer",            "Integer",               "datatype"),
  E("xsd", XSD_NS, "decimal",            "Decimal",               "datatype"),
  E("xsd", XSD_NS, "float",              "Float",                 "datatype"),
  E("xsd", XSD_NS, "double",             "Double",                "datatype"),
  E("xsd", XSD_NS, "boolean",            "Boolean",               "datatype"),
  E("xsd", XSD_NS, "date",               "Date",                  "datatype"),
  E("xsd", XSD_NS, "dateTime",           "DateTime",              "datatype"),
  E("xsd", XSD_NS, "time",               "Time",                  "datatype"),
  E("xsd", XSD_NS, "anyURI",             "Any URI",               "datatype"),
  E("xsd", XSD_NS, "nonNegativeInteger", "Non-negative integer",  "datatype"),
  E("xsd", XSD_NS, "positiveInteger",    "Positive integer",      "datatype"),
  E("xsd", XSD_NS, "gYear",              "Year (gYear)",          "datatype"),
  E("xsd", XSD_NS, "duration",           "Duration",              "datatype"),
  E("xsd", XSD_NS, "language",           "Language tag",          "datatype"),
  E("xsd", XSD_NS, "base64Binary",       "Base64 binary",         "datatype"),

  // ── RDF / RDFS top-level ───────────────────────────────────────────
  E("rdfs", RDFS_NS, "Resource", "Resource",       "class"),
  E("rdfs", RDFS_NS, "Class",    "RDFS Class",     "class"),
  E("rdfs", RDFS_NS, "Literal",  "Literal",        "datatype"),
  E("rdfs", RDFS_NS, "Datatype", "Datatype",       "class"),
  E("rdf",  RDF_NS,  "Property", "RDF Property",   "class"),
  E("rdf",  RDF_NS,  "langString","Language-tagged string", "datatype"),
  E("rdfs", RDFS_NS, "label",       "rdfs:label",       "property"),
  E("rdfs", RDFS_NS, "comment",     "rdfs:comment",     "property"),
  E("rdfs", RDFS_NS, "seeAlso",     "rdfs:seeAlso",     "property"),
  E("rdfs", RDFS_NS, "isDefinedBy", "rdfs:isDefinedBy", "property"),
  E("rdfs", RDFS_NS, "domain",      "rdfs:domain",      "property"),
  E("rdfs", RDFS_NS, "range",       "rdfs:range",       "property"),
  E("rdfs", RDFS_NS, "subClassOf",  "rdfs:subClassOf",  "property"),
  E("rdfs", RDFS_NS, "subPropertyOf","rdfs:subPropertyOf","property"),

  // ── OWL ────────────────────────────────────────────────────────────
  E("owl", OWL_NS, "Thing",              "owl:Thing",            "class"),
  E("owl", OWL_NS, "Nothing",            "owl:Nothing",          "class"),
  E("owl", OWL_NS, "Class",              "owl:Class",            "class"),
  E("owl", OWL_NS, "Ontology",           "owl:Ontology",         "ontology"),
  E("owl", OWL_NS, "ObjectProperty",     "owl:ObjectProperty",   "class"),
  E("owl", OWL_NS, "DatatypeProperty",   "owl:DatatypeProperty", "class"),
  E("owl", OWL_NS, "AnnotationProperty", "owl:AnnotationProperty","class"),
  E("owl", OWL_NS, "sameAs",       "owl:sameAs",       "property"),
  E("owl", OWL_NS, "differentFrom","owl:differentFrom","property"),
  E("owl", OWL_NS, "equivalentClass","owl:equivalentClass","property"),
  E("owl", OWL_NS, "disjointWith", "owl:disjointWith", "property"),
  E("owl", OWL_NS, "inverseOf",    "owl:inverseOf",    "property"),
  E("owl", OWL_NS, "deprecated",   "owl:deprecated",   "property"),
  E("owl", OWL_NS, "versionInfo",  "owl:versionInfo",  "property"),
  E("owl", OWL_NS, "versionIRI",   "owl:versionIRI",   "property"),
  E("owl", OWL_NS, "imports",      "owl:imports",      "property"),

  // ── SKOS ───────────────────────────────────────────────────────────
  E("skos", SKOS_NS, "Concept",       "Concept",        "class"),
  E("skos", SKOS_NS, "ConceptScheme", "Concept Scheme", "class"),
  E("skos", SKOS_NS, "Collection",    "Collection",     "class"),
  E("skos", SKOS_NS, "prefLabel",    "preferred label",     "property"),
  E("skos", SKOS_NS, "altLabel",     "alternative label",   "property"),
  E("skos", SKOS_NS, "hiddenLabel",  "hidden label",        "property"),
  E("skos", SKOS_NS, "definition",   "definition",          "property"),
  E("skos", SKOS_NS, "notation",     "notation",            "property"),
  E("skos", SKOS_NS, "note",         "note",                "property"),
  E("skos", SKOS_NS, "scopeNote",    "scope note",          "property"),
  E("skos", SKOS_NS, "editorialNote","editorial note",      "property"),
  E("skos", SKOS_NS, "changeNote",   "change note",         "property"),
  E("skos", SKOS_NS, "historyNote",  "history note",        "property"),
  E("skos", SKOS_NS, "example",      "example",             "property"),
  E("skos", SKOS_NS, "broader",      "has broader",         "property"),
  E("skos", SKOS_NS, "narrower",     "has narrower",        "property"),
  E("skos", SKOS_NS, "related",      "has related",         "property"),
  E("skos", SKOS_NS, "inScheme",     "is in scheme",        "property"),
  E("skos", SKOS_NS, "hasTopConcept","has top concept",     "property"),
  E("skos", SKOS_NS, "exactMatch",   "exact match",         "property"),
  E("skos", SKOS_NS, "closeMatch",   "close match",         "property"),
  E("skos", SKOS_NS, "broadMatch",   "broad match",         "property"),
  E("skos", SKOS_NS, "narrowMatch",  "narrow match",        "property"),
  E("skos", SKOS_NS, "relatedMatch", "related match",       "property"),

  // ── Dublin Core Terms ──────────────────────────────────────────────
  E("dcterms", DCT_NS, "Agent",            "Agent",                 "class"),
  E("dcterms", DCT_NS, "BibliographicResource", "Bibliographic Resource","class"),
  E("dcterms", DCT_NS, "title",       "title",        "property"),
  E("dcterms", DCT_NS, "description", "description",  "property"),
  E("dcterms", DCT_NS, "identifier",  "identifier",   "property"),
  E("dcterms", DCT_NS, "creator",     "creator",      "property"),
  E("dcterms", DCT_NS, "contributor", "contributor",  "property"),
  E("dcterms", DCT_NS, "publisher",   "publisher",    "property"),
  E("dcterms", DCT_NS, "date",        "date",         "property"),
  E("dcterms", DCT_NS, "created",     "date created", "property"),
  E("dcterms", DCT_NS, "modified",    "date modified","property"),
  E("dcterms", DCT_NS, "issued",      "date issued",  "property"),
  E("dcterms", DCT_NS, "license",     "license",      "property"),
  E("dcterms", DCT_NS, "rights",      "rights",       "property"),
  E("dcterms", DCT_NS, "subject",     "subject",      "property"),
  E("dcterms", DCT_NS, "source",      "source",       "property"),
  E("dcterms", DCT_NS, "language",    "language",     "property"),
  E("dcterms", DCT_NS, "isPartOf",    "is part of",   "property"),
  E("dcterms", DCT_NS, "hasPart",     "has part",     "property"),
  E("dcterms", DCT_NS, "references",  "references",   "property"),
  E("dcterms", DCT_NS, "replaces",    "replaces",     "property"),

  // ── FOAF ───────────────────────────────────────────────────────────
  E("foaf", FOAF_NS, "Agent",        "Agent",        "class"),
  E("foaf", FOAF_NS, "Person",       "Person",       "class"),
  E("foaf", FOAF_NS, "Organization", "Organization", "class"),
  E("foaf", FOAF_NS, "Group",        "Group",        "class"),
  E("foaf", FOAF_NS, "Document",     "Document",     "class"),
  E("foaf", FOAF_NS, "OnlineAccount","Online Account","class"),
  E("foaf", FOAF_NS, "name",         "name",         "property"),
  E("foaf", FOAF_NS, "firstName",    "first name",   "property"),
  E("foaf", FOAF_NS, "lastName",     "last name",    "property"),
  E("foaf", FOAF_NS, "nick",         "nickname",     "property"),
  E("foaf", FOAF_NS, "mbox",         "mailbox",      "property"),
  E("foaf", FOAF_NS, "homepage",     "homepage",     "property"),
  E("foaf", FOAF_NS, "knows",        "knows",        "property"),
  E("foaf", FOAF_NS, "member",       "member",      "property"),
  E("foaf", FOAF_NS, "img",          "image",        "property"),
  E("foaf", FOAF_NS, "account",      "account",      "property"),
  E("foaf", FOAF_NS, "based_near",   "based near",   "property"),
  E("foaf", FOAF_NS, "age",          "age",          "property"),

  // ── schema.org core ────────────────────────────────────────────────
  E("schema", SCH_NS, "Thing",        "Thing",        "class"),
  E("schema", SCH_NS, "Person",       "Person",       "class"),
  E("schema", SCH_NS, "Organization", "Organization", "class"),
  E("schema", SCH_NS, "Event",        "Event",        "class"),
  E("schema", SCH_NS, "Place",        "Place",        "class"),
  E("schema", SCH_NS, "Product",      "Product",      "class"),
  E("schema", SCH_NS, "CreativeWork", "Creative Work","class"),
  E("schema", SCH_NS, "Article",      "Article",      "class"),
  E("schema", SCH_NS, "name",         "name",         "property"),
  E("schema", SCH_NS, "description",  "description",  "property"),
  E("schema", SCH_NS, "url",          "url",          "property"),
  E("schema", SCH_NS, "identifier",   "identifier",   "property"),
  E("schema", SCH_NS, "image",        "image",        "property"),
  E("schema", SCH_NS, "email",        "email",        "property"),
  E("schema", SCH_NS, "telephone",    "telephone",    "property"),
  E("schema", SCH_NS, "address",      "address",      "property"),
  E("schema", SCH_NS, "knows",        "knows",        "property"),
  E("schema", SCH_NS, "memberOf",     "member of",    "property"),
  E("schema", SCH_NS, "author",       "author",       "property"),
  E("schema", SCH_NS, "datePublished","date published","property"),

  // ── PROV-O ─────────────────────────────────────────────────────────
  E("prov", PROV_NS, "Entity",        "Entity",        "class"),
  E("prov", PROV_NS, "Activity",      "Activity",      "class"),
  E("prov", PROV_NS, "Agent",         "Agent",         "class"),
  E("prov", PROV_NS, "SoftwareAgent", "Software Agent","class"),
  E("prov", PROV_NS, "Person",        "Person",        "class"),
  E("prov", PROV_NS, "Organization",  "Organization",  "class"),
  E("prov", PROV_NS, "wasGeneratedBy",   "was generated by",  "property"),
  E("prov", PROV_NS, "wasDerivedFrom",   "was derived from",  "property"),
  E("prov", PROV_NS, "wasAttributedTo",  "was attributed to", "property"),
  E("prov", PROV_NS, "wasAssociatedWith","was associated with","property"),
  E("prov", PROV_NS, "used",             "used",              "property"),
  E("prov", PROV_NS, "actedOnBehalfOf",  "acted on behalf of","property"),
  E("prov", PROV_NS, "startedAtTime",    "started at time",   "property"),
  E("prov", PROV_NS, "endedAtTime",      "ended at time",     "property"),
  E("prov", PROV_NS, "generatedAtTime",  "generated at time", "property"),

  // ── DCAT ───────────────────────────────────────────────────────────
  E("dcat", DCAT_NS, "Catalog",      "Catalog",      "class"),
  E("dcat", DCAT_NS, "Dataset",      "Dataset",      "class"),
  E("dcat", DCAT_NS, "Distribution", "Distribution", "class"),
  E("dcat", DCAT_NS, "DataService",  "Data Service", "class"),
  E("dcat", DCAT_NS, "theme",        "theme",        "property"),
  E("dcat", DCAT_NS, "keyword",      "keyword",      "property"),
  E("dcat", DCAT_NS, "downloadURL",  "download URL", "property"),
  E("dcat", DCAT_NS, "accessURL",    "access URL",   "property"),
  E("dcat", DCAT_NS, "mediaType",    "media type",   "property"),
  E("dcat", DCAT_NS, "distribution", "distribution", "property"),

  // ── VoID ──────────────────────────────────────────────────────────
  E("void", VOID_NS, "Dataset",  "VoID Dataset", "class"),
  E("void", VOID_NS, "triples",  "triples count","property"),
  E("void", VOID_NS, "entities", "entities count","property"),
  E("void", VOID_NS, "sparqlEndpoint", "SPARQL endpoint","property"),
  E("void", VOID_NS, "vocabulary", "vocabulary",  "property"),

  // ── VANN ───────────────────────────────────────────────────────────
  E("vann", VANN_NS, "preferredNamespacePrefix", "preferred namespace prefix", "property"),
  E("vann", VANN_NS, "preferredNamespaceUri",    "preferred namespace URI",    "property"),
];

/**
 * Search the vocab pack. Matches against local name, label, and full URI.
 * Returns at most 12 results, ranked by:
 *  1. exact local-name match
 *  2. local-name prefix match
 *  3. label substring match
 *  4. URI substring match
 */
export function searchVocab(query: string, filter?: VocabFilter): VocabEntry[] {
  const q = query.trim().toLowerCase();
  const pool = ENTRIES.filter((e) => {
    if (filter?.kinds && !filter.kinds.includes(e.kind)) return false;
    if (filter?.prefixes && !filter.prefixes.includes(e.prefix)) return false;
    return true;
  });
  if (!q) return pool.slice(0, 12);

  const scored: Array<{ entry: VocabEntry; score: number }> = [];
  for (const e of pool) {
    const ln = e.localName.toLowerCase();
    const lbl = e.label.toLowerCase();
    const uri = e.uri.toLowerCase();
    let score = 0;
    if (ln === q) score = 100;
    else if (ln.startsWith(q)) score = 80;
    else if (ln.includes(q)) score = 60;
    else if (lbl.includes(q)) score = 40;
    else if (uri.includes(q)) score = 20;
    if (score > 0) scored.push({ entry: e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.localName.localeCompare(b.entry.localName));
  return scored.slice(0, 12).map((s) => s.entry);
}

/** Lookup the namespace URI for a well-known prefix. */
export function lookupPrefixNamespace(prefix: string): string | undefined {
  return WELL_KNOWN_PREFIXES[prefix.toLowerCase()];
}
