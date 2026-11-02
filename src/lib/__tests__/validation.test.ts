import { describe, it, expect } from "vitest";
import { validate } from "../validation";
import { parseTurtle } from "../turtle-parser";
import { buildModelFromTriples } from "../model-builder";

const load = (ttl: string) => ({ id: "v", createdAt: "", updatedAt: "", ...buildModelFromTriples(parseTurtle(ttl)) });

describe("validate — external references", () => {
  const onto = load(`@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<http://ex.org/onto> a owl:Ontology ; owl:imports <http://xmlns.com/foaf/0.1/> .
:Employee a owl:Class ; rdfs:label "Employee" ; rdfs:subClassOf foaf:Person , :Missing .
:worksFor a owl:ObjectProperty ; rdfs:label "works for" ; rdfs:domain foaf:Person ; rdfs:range foaf:Organization .`);
  const messages = validate(onto).map((i) => i.message);

  it("doesn't flag terms from other namespaces (imports / external vocabularies)", () => {
    expect(messages.some((m) => m.includes("foaf"))).toBe(false);
  });

  it("still flags undefined terms in the ontology's own namespace", () => {
    expect(messages).toContain("rdfs:subClassOf references unknown class: http://ex.org/Missing");
  });
});

describe("validate — references must be IRIs", () => {
  it("errors on a bare name stored as a range", () => {
    const onto = load(`@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
<http://ex.org/onto> a owl:Ontology .
:p a owl:ObjectProperty .`);
    onto.properties[0]!.ranges = [{ kind: "class", uri: "Vehicle" }];
    expect(validate(onto).some((i) => i.severity === "error" && i.message === 'ranges "Vehicle" is not an IRI')).toBe(true);
  });
});
