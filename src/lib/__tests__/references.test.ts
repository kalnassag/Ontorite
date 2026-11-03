import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import { parseTurtle } from "../turtle-parser";
import { buildSource, findDefinition, formatDefinition, labelFor, summarizeTerm } from "../references/reference-source";
import { candidateUrls, fetchOntology } from "../references/reference-fetch";

const EX = "https://example.org/ns/ontology/core/";
const text = fs.readFileSync(new URL("./fixtures/gist-style.ttl", import.meta.url), "utf-8");
const parsed = parseTurtle(text);
const source = buildSource({ id: "s", kind: "reference", iri: "https://example.org/ontology/core", origin: "gist-style.ttl" }, parsed.triples, parsed.prefixes);

describe("reference sources", () => {
  it("names the source from its owl:Ontology label (skos:prefLabel too)", () => {
    expect(source.name).toBe("Example core");
  });

  it("finds a term by IRI even though its namespace differs from the ontology IRI", () => {
    expect(findDefinition(EX + "Organization", [source])?.source).toBe(source);
    expect(findDefinition(EX + "Nope", [source])).toBeNull();
  });

  it("summarises with SKOS labels and definitions, preferring English", () => {
    const person = summarizeTerm(findDefinition(EX + "Person", [source])!.triples);
    expect(person).toMatchObject({ label: "Person", description: "A human being.", kind: "Class" });
    const org = summarizeTerm(findDefinition(EX + "Organization", [source])!.triples);
    expect(org.facts).toEqual([["Disjoint with", [EX + "Person"]]]);
    expect(labelFor(EX + "isAllocatedBy", [source])).toBe("is allocated by");
  });

  it("renders the definition as Turtle with nested axioms inline, in the source's prefixes", () => {
    expect(formatDefinition(EX + "Category", source)).toBe(
      'ex:Category a owl:Class ;\n' +
      '    skos:prefLabel "Category" ;\n' +
      "    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ex:isAllocatedBy ; owl:someValuesFrom [ a owl:Class ; owl:unionOf ( ex:Organization ex:Person ) ] ] .",
    );
  });

  it("uses the first source that defines the term", () => {
    const other = buildSource({ id: "o", kind: "workspace", iri: "x", origin: "x" }, parseTurtle(`<${EX}Person> <http://www.w3.org/2000/01/rdf-schema#label> "Mine" .`).triples, {});
    expect(findDefinition(EX + "Person", [other, source])?.source).toBe(other);
  });
});

describe("fetching", () => {
  it("tries imports first, then the term's namespace document", () => {
    expect(candidateUrls(EX + "Organization", ["https://example.org/ontology/core"])).toEqual([
      "https://example.org/ontology/core",
      "https://example.org/ns/ontology/core/",
    ]);
    expect(candidateUrls("http://www.w3.org/ns/dcat#Dataset", [])).toEqual(["http://www.w3.org/ns/dcat", "http://www.w3.org/ns/dcat#"]);
  });

  beforeEach(() => vi.unstubAllGlobals());

  it("classifies a CORS block, an HTTP error, a web page, and an ontology", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await fetchOntology("https://a.example/o")).toMatchObject({ ok: false, reason: "blocked" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404, statusText: "Not Found" })));
    expect(await fetchOntology("https://a.example/o")).toMatchObject({ ok: false, reason: "http", message: "HTTP 404 Not Found" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<!DOCTYPE html><html></html>", { headers: { "content-type": "text/html" } })));
    expect(await fetchOntology("https://a.example/o")).toMatchObject({ ok: false, reason: "not-rdf" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text, { headers: { "content-type": "text/turtle" } })));
    expect(await fetchOntology("https://a.example/o")).toMatchObject({ ok: true, formatHint: "source.ttl" });
  });
});
