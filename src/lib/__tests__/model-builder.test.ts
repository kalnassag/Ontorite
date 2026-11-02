import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { parseTurtle } from "../turtle-parser";
import { buildModelFromTriples } from "../model-builder";

const EX = "http://example.org/onto#";
const OWL = "http://www.w3.org/2002/07/owl#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const model = buildModelFromTriples(
  parseTurtle(fs.readFileSync(new URL("./fixtures/owl-constructs.ttl", import.meta.url), "utf-8")),
);
const cls = (local: string) => model.classes.find((c) => c.uri === EX + local);
const prop = (local: string) => model.properties.find((p) => p.uri === EX + local);

describe("parseTurtle (N3-backed)", () => {
  it("parses numeric, boolean and single-quoted literals", () => {
    const { triples, errors } = parseTurtle(`@prefix : <http://ex.org/> . :a :n 42 ; :b true ; :s 'x' .`);
    expect(errors).toEqual([]);
    expect(triples.map((t) => [t.o, t.datatype])).toEqual([
      ["42", "http://www.w3.org/2001/XMLSchema#integer"],
      ["true", "http://www.w3.org/2001/XMLSchema#boolean"],
      ["x", undefined],
    ]);
  });

  it("resolves relative IRIs against @base without touching the empty prefix", () => {
    const { triples, prefixes, baseUri } = parseTurtle(`@base <http://ex.org/onto> . <#A> <p> <B> .`);
    expect(triples[0]).toMatchObject({ s: "http://ex.org/onto#A", p: "http://ex.org/p", o: "http://ex.org/B" });
    expect(prefixes[""]).toBeUndefined();
    expect(baseUri).toBe("http://ex.org/onto");
  });

  it("reports the line of a syntax error and returns no triples", () => {
    const { triples, errors } = parseTurtle(`@prefix : <http://ex.org/> .\n:a :b :c .\n:d :e "unterminated .\n`);
    expect(triples).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBe(3);
  });
});

describe("buildModelFromTriples", () => {
  it("classifies a property whatever order its rdf:types appear in", () => {
    expect(prop("partOf")?.type).toBe("owl:ObjectProperty");
    expect(prop("partOf")?.extraTriples).toContainEqual({ predicate: RDF_TYPE, object: OWL + "TransitiveProperty", isLiteral: false });
    expect(prop("hasId")?.type).toBe("owl:DatatypeProperty");
  });

  it("never promotes external vocabulary terms to local classes", () => {
    const uris = model.classes.map((c) => c.uri);
    expect(uris).not.toContain("http://www.w3.org/2004/02/skos/core#Concept");
    expect(uris).not.toContain(OWL + "Restriction");
    expect(uris.some((u) => u.startsWith("_:"))).toBe(false);
  });

  it("keeps a second rdfs:domain instead of overwriting the first", () => {
    const hasName = prop("hasName")!;
    expect(hasName.domain).toEqual({ kind: "class", uri: EX + "Part" });
    expect(hasName.extraTriples.map((e) => e.object)).toContain(EX + "Whole");
  });

  it("hoists owl:unionOf domains and ranges into ClassExpressions", () => {
    const connects = prop("connects")!;
    expect(connects.domain).toEqual({ kind: "union", uris: [EX + "Part", EX + "Whole"] });
    expect(connects.ranges).toEqual([{ kind: "union", uris: [EX + "Part", EX + "Whole", EX + "Thing"] }]);
  });

  it("maps simple restrictions, and hoists a domain-class cardinality onto the property", () => {
    expect(cls("Part")!.restrictions).toEqual([
      { propertyUri: EX + "partOf", type: "someValuesFrom", value: EX + "Whole" },
    ]);
    expect(prop("partOf")!.exactCardinality).toBe(1);
  });

  it("keeps unmodelled blank-node structures with the statement that references them", () => {
    const part = cls("Part")!;
    const qualified = part.extraTriples.find((e) =>
      e.blankNodeTriples?.some((t) => t.predicate === OWL + "qualifiedCardinality"));
    expect(qualified?.predicate).toBe("http://www.w3.org/2000/01/rdf-schema#subClassOf");
    const equiv = cls("Whole")!.extraTriples.find((e) => e.predicate === OWL + "equivalentClass")!;
    expect(equiv.blankNodeTriples!.some((t) => t.predicate === OWL + "intersectionOf")).toBe(true);
    // the nested restriction inside the intersection list is owned too
    expect(equiv.blankNodeTriples!.some((t) => t.predicate === OWL + "minCardinality")).toBe(true);
    expect(model.unmappedTriples.some((t) => t.predicate === OWL + "intersectionOf")).toBe(false);
  });

  it("puts owl:imports and other header statements on the ontology, not in other statements", () => {
    expect(model.metadata.imports).toEqual(["http://www.w3.org/2004/02/skos/core", "http://xmlns.com/foaf/0.1/"]);
    const preds = model.metadata.extraTriples.map((e) => e.predicate.split(/[#/]/).pop());
    expect(preds).toEqual(expect.arrayContaining(["label", "license", "creator"]));
    const creator = model.metadata.extraTriples.find((e) => e.predicate.endsWith("creator"))!;
    expect(creator.blankNodeTriples!.map((t) => t.object)).toContain("Ada Lovelace");
    expect(model.metadata.ontologyLabel).toBe("Constructs");
    expect(model.metadata.ontologyLabelLang).toBe("en");
  });

  it("leaves only subject-less or shared statements in other statements", () => {
    const subjects = new Set(model.unmappedTriples.map((t) => (t.subject.startsWith("_:") ? "_:" : t.subject)));
    expect([...subjects].sort()).toEqual([
      "_:",
      EX + "untyped",
      "http://example.org/other/path/Weird%20Thing",
    ]);
    // the shared node keeps its own triples (it has two referrers)
    expect(model.unmappedTriples.some((t) => t.object === "shared note")).toBe(true);
    expect(model.unmappedTriples.some((t) => t.object === OWL + "AllDisjointClasses")).toBe(true);
  });
});

describe("language tags", () => {
  it("keeps conventional BCP 47 casing", () => {
    const { triples } = parseTurtle(
      `<http://a> <http://b> "x"@en-AU , "y"@zh-hant-tw , "z"@EN , "w"@en-x-twain .`,
    );
    expect(triples.map((t) => t.lang)).toEqual(["en-AU", "zh-Hant-TW", "en", "en-x-twain"]);
  });
});
