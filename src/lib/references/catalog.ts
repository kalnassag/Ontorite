/**
 * Catalogue of commonly used ontologies the user can add to their library.
 * Nothing here is bundled: adding an entry downloads it from its source.
 *
 * `urls` are tried in order. Raw GitHub copies come first where the publisher
 * keeps one there (GitHub allows browser reads); publishers' own servers
 * may not (CORS), in which case the user loads the file instead (`homepage`).
 */

export interface CatalogEntry {
  id: string;
  name: string;
  prefix: string;
  group: "Core" | "Metadata & data" | "Upper & domain" | "Validation & policy";
  description: string;
  /** The IRI an ontology uses to owl:import it */
  ontologyIri: string;
  /** Where its terms live (often not the ontology IRI — see gist) */
  namespaces: string[];
  urls: string[];
  homepage: string;
}

const GH = "https://raw.githubusercontent.com";

export const CATALOG: CatalogEntry[] = [
  // ── Core ──
  {
    id: "rdfs", name: "RDF Schema", prefix: "rdfs", group: "Core",
    description: "Classes, properties, domains, ranges, labels and comments.",
    ontologyIri: "http://www.w3.org/2000/01/rdf-schema#",
    namespaces: ["http://www.w3.org/2000/01/rdf-schema#"],
    urls: ["https://www.w3.org/2000/01/rdf-schema.ttl"],
    homepage: "https://www.w3.org/TR/rdf-schema/",
  },
  {
    id: "owl", name: "OWL 2", prefix: "owl", group: "Core",
    description: "The OWL vocabulary itself: owl:Thing, restrictions, property characteristics.",
    ontologyIri: "http://www.w3.org/2002/07/owl",
    namespaces: ["http://www.w3.org/2002/07/owl#"],
    urls: ["https://www.w3.org/2002/07/owl.ttl"],
    homepage: "https://www.w3.org/TR/owl2-overview/",
  },
  {
    id: "skos", name: "SKOS", prefix: "skos", group: "Core",
    description: "Concepts, concept schemes, broader/narrower, preferred and alternative labels.",
    ontologyIri: "http://www.w3.org/2004/02/skos/core",
    namespaces: ["http://www.w3.org/2004/02/skos/core#"],
    urls: ["https://www.w3.org/2004/02/skos/core.rdf"],
    homepage: "https://www.w3.org/TR/skos-reference/",
  },

  // ── Metadata & data ──
  {
    id: "dcterms", name: "DCMI Metadata Terms", prefix: "dcterms", group: "Metadata & data",
    description: "Dublin Core terms: title, creator, created, license, subject…",
    ontologyIri: "http://purl.org/dc/terms/",
    namespaces: ["http://purl.org/dc/terms/"],
    urls: ["https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl"],
    homepage: "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/",
  },
  {
    id: "dcat", name: "DCAT 3", prefix: "dcat", group: "Metadata & data",
    description: "Data catalogues: datasets, distributions, data services.",
    ontologyIri: "http://www.w3.org/ns/dcat",
    namespaces: ["http://www.w3.org/ns/dcat#"],
    urls: ["https://www.w3.org/ns/dcat3.ttl", "https://www.w3.org/ns/dcat.ttl"],
    homepage: "https://www.w3.org/TR/vocab-dcat-3/",
  },
  {
    id: "prov", name: "PROV-O", prefix: "prov", group: "Metadata & data",
    description: "Provenance: entities, activities, agents and how they relate.",
    ontologyIri: "http://www.w3.org/ns/prov-o",
    namespaces: ["http://www.w3.org/ns/prov#"],
    urls: [`${GH}/w3c/prov/main/ontology/prov-o.ttl`, "https://www.w3.org/ns/prov-o.ttl"],
    homepage: "https://www.w3.org/TR/prov-o/",
  },
  {
    id: "schema", name: "Schema.org", prefix: "schema", group: "Metadata & data",
    description: "The schema.org vocabulary (large: about 1 MB, 17,000 statements).",
    ontologyIri: "https://schema.org/",
    namespaces: ["https://schema.org/", "http://schema.org/"],
    urls: [
      "https://schema.org/version/latest/schemaorg-current-https.ttl",
      `${GH}/schemaorg/schemaorg/main/data/releases/29.1/schemaorg-current-https.ttl`,
    ],
    homepage: "https://schema.org/docs/developers.html",
  },
  {
    id: "foaf", name: "FOAF", prefix: "foaf", group: "Metadata & data",
    description: "People, agents, organisations, documents and how they're connected.",
    ontologyIri: "http://xmlns.com/foaf/0.1/",
    namespaces: ["http://xmlns.com/foaf/0.1/"],
    urls: ["http://xmlns.com/foaf/spec/index.rdf"],
    homepage: "http://xmlns.com/foaf/spec/",
  },
  {
    id: "org", name: "W3C Organization Ontology", prefix: "org", group: "Metadata & data",
    description: "Organisations, units, posts, memberships and roles.",
    ontologyIri: "http://www.w3.org/ns/org",
    namespaces: ["http://www.w3.org/ns/org#"],
    urls: ["https://www.w3.org/ns/org.ttl"],
    homepage: "https://www.w3.org/TR/vocab-org/",
  },
  {
    id: "vcard", name: "vCard", prefix: "vcard", group: "Metadata & data",
    description: "Contact details: names, addresses, phone numbers, emails.",
    ontologyIri: "http://www.w3.org/2006/vcard/ns",
    namespaces: ["http://www.w3.org/2006/vcard/ns#"],
    urls: ["https://www.w3.org/2006/vcard/ns.ttl"],
    homepage: "https://www.w3.org/TR/vcard-rdf/",
  },

  // ── Upper & domain ──
  {
    id: "gist", name: "gist (core)", prefix: "gist", group: "Upper & domain",
    description: "Semantic Arts' minimalist upper ontology for the enterprise.",
    ontologyIri: "https://w3id.org/semanticarts/ontology/gistCore",
    namespaces: ["https://w3id.org/semanticarts/ns/ontology/gist/"],
    urls: [`${GH}/semanticarts/gist/master/ontologies/gistCore.ttl`],
    homepage: "https://github.com/semanticarts/gist",
  },
  {
    id: "bfo", name: "BFO 2020", prefix: "obo", group: "Upper & domain",
    description: "Basic Formal Ontology (ISO/IEC 21838-2), the OBO Foundry's upper ontology.",
    ontologyIri: "http://purl.obolibrary.org/obo/bfo.owl",
    namespaces: ["http://purl.obolibrary.org/obo/BFO_"],
    urls: [`${GH}/BFO-ontology/BFO-2020/master/21838-2/owl/bfo-core.ttl`],
    homepage: "https://github.com/BFO-ontology/BFO-2020",
  },
  {
    id: "time", name: "OWL-Time", prefix: "time", group: "Upper & domain",
    description: "Instants, intervals, durations and temporal positions.",
    ontologyIri: "http://www.w3.org/2006/time",
    namespaces: ["http://www.w3.org/2006/time#"],
    urls: ["https://www.w3.org/2006/time.ttl"],
    homepage: "https://www.w3.org/TR/owl-time/",
  },
  {
    id: "geosparql", name: "GeoSPARQL 1.1", prefix: "geo", group: "Upper & domain",
    description: "Spatial objects, features and geometries.",
    ontologyIri: "http://www.opengis.net/ont/geosparql",
    namespaces: ["http://www.opengis.net/ont/geosparql#"],
    urls: ["https://opengeospatial.github.io/ogc-geosparql/geosparql11/geo.ttl"],
    homepage: "https://docs.ogc.org/is/22-047r1/22-047r1.html",
  },
  {
    id: "sosa", name: "SOSA", prefix: "sosa", group: "Upper & domain",
    description: "Sensors, observations, samples and actuators (lightweight core).",
    ontologyIri: "http://www.w3.org/ns/sosa/",
    namespaces: ["http://www.w3.org/ns/sosa/"],
    urls: [`${GH}/w3c/sdw/gh-pages/ssn/integrated/sosa.ttl`, "https://www.w3.org/ns/sosa.ttl"],
    homepage: "https://www.w3.org/TR/vocab-ssn/",
  },
  {
    id: "ssn", name: "SSN", prefix: "ssn", group: "Upper & domain",
    description: "Semantic Sensor Network: systems, deployments and capabilities (extends SOSA).",
    ontologyIri: "http://www.w3.org/ns/ssn/",
    namespaces: ["http://www.w3.org/ns/ssn/"],
    urls: [`${GH}/w3c/sdw/gh-pages/ssn/integrated/ssn.ttl`, "https://www.w3.org/ns/ssn.ttl"],
    homepage: "https://www.w3.org/TR/vocab-ssn/",
  },

  // ── Validation & policy ──
  {
    id: "shacl", name: "SHACL", prefix: "sh", group: "Validation & policy",
    description: "The SHACL vocabulary: shapes, constraints and validation reports.",
    ontologyIri: "http://www.w3.org/ns/shacl#",
    namespaces: ["http://www.w3.org/ns/shacl#"],
    urls: [`${GH}/w3c/data-shapes/gh-pages/shacl/shacl.ttl`, "https://www.w3.org/ns/shacl.ttl"],
    homepage: "https://www.w3.org/TR/shacl/",
  },
  {
    id: "odrl", name: "ODRL 2.2", prefix: "odrl", group: "Validation & policy",
    description: "Policies: permissions, prohibitions, duties and constraints.",
    ontologyIri: "http://www.w3.org/ns/odrl/2/",
    namespaces: ["http://www.w3.org/ns/odrl/2/"],
    urls: ["https://www.w3.org/ns/odrl/2/ODRL22.ttl"],
    homepage: "https://www.w3.org/TR/odrl-vocab/",
  },
];

/** The catalogue entry a term or ontology IRI belongs to (by namespace or ontology IRI). */
export function catalogEntryFor(iri: string): CatalogEntry | undefined {
  const bare = iri.replace(/[#/]$/, "");
  return CATALOG.find((entry) =>
    entry.ontologyIri.replace(/[#/]$/, "") === bare || entry.namespaces.some((ns) => iri.startsWith(ns) || ns.replace(/[#/]$/, "") === bare));
}
