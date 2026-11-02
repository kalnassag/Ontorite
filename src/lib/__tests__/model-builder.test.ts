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

  it("leaves shapes the model can't represent as raw triples", () => {
    // qualified cardinality and the intersection are referenced via blank nodes
    expect(cls("Part")!.extraTriples.some((e) => e.object.startsWith("_:"))).toBe(true);
    expect(cls("Whole")!.extraTriples.some((e) => e.predicate === OWL + "equivalentClass")).toBe(true);
    expect(model.unmappedTriples.some((t) => t.predicate === OWL + "intersectionOf")).toBe(true);
  });

  it("keeps extra ontology labels rather than discarding them", () => {
    expect(model.metadata.ontologyLabel).toBe("Constructs");
    expect(model.metadata.ontologyLabelLang).toBe("en");
    expect(model.unmappedTriples.some((t) => t.object === "Konstrukte")).toBe(true);
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
