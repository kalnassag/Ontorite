import { describe, it, expect } from "vitest";
import { parsePredicateObjectList, parseStatements } from "../turtle-snippets";
import { formatExtraTriple } from "../turtle-format";

const prefixes = { "": "http://ex.org/" };
const OWL = "http://www.w3.org/2002/07/owl#";

describe("parsePredicateObjectList", () => {
  it("parses a nested blank-node axiom into one statement that owns its structure", () => {
    const r = parsePredicateObjectList(
      "rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:qualifiedCardinality 2 ; owl:onClass :C ]",
      prefixes,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(1);
    expect(r.value[0]!.blankNodeTriples).toHaveLength(4);
    expect(r.value[0]!.blankNodeTriples!.map((t) => t.predicate)).toContain(OWL + "qualifiedCardinality");
  });

  it("round-trips through the display format", () => {
    const text = "owl:equivalentClass [ a owl:Class ; owl:intersectionOf ( :A [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :B ] ) ]";
    const r = parsePredicateObjectList(text, prefixes);
    if (!r.ok) throw new Error(r.error);
    expect(formatExtraTriple(r.value[0]!, prefixes)).toBe(text);
  });

  it("accepts several statements separated by ';' and a trailing '.'", () => {
    const r = parsePredicateObjectList('rdfs:seeAlso :x ;\nskos:note "hi"@en .', prefixes);
    expect(r.ok && r.value.map((e) => e.object)).toEqual(["http://ex.org/x", "hi"]);
  });

  it("reports syntax errors with the line number of the user's text", () => {
    const r = parsePredicateObjectList('rdfs:seeAlso :x ;\nskos:note "unterminated', prefixes);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Line 2:/);
  });

  it("rejects statements about other subjects", () => {
    const r = parsePredicateObjectList("rdfs:seeAlso :x . :other rdfs:label \"no\"", prefixes);
    expect(r.ok).toBe(false);
  });

  it("gives blank nodes fresh labels every time", () => {
    const a = parsePredicateObjectList("rdfs:seeAlso [ rdfs:label \"x\" ]", prefixes);
    const b = parsePredicateObjectList("rdfs:seeAlso [ rdfs:label \"x\" ]", prefixes);
    if (!a.ok || !b.ok) throw new Error();
    expect(a.value[0]!.object).not.toBe(b.value[0]!.object);
  });
});

describe("parseStatements", () => {
  it("parses complete statements, including top-level blank nodes", () => {
    const r = parseStatements("[] a owl:AllDisjointClasses ; owl:members ( :A :B ) .", prefixes);
    expect(r.ok && r.value.some((t) => t.object === OWL + "AllDisjointClasses")).toBe(true);
  });
});

describe("blank-node labels in snippets", () => {
  it("keeps explicit labels (references to existing shared nodes)", () => {
    const r = parsePredicateObjectList("rdfs:seeAlso _:b12", prefixes);
    expect(r.ok && r.value[0]!.object).toBe("_:b12");
    const s = parseStatements('_:b12 rdfs:label "shared" .', prefixes);
    expect(s.ok && s.value[0]!.subject).toBe("_:b12");
  });
});
