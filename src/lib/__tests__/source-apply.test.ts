import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { Parser, Writer } from "n3";
import { canonize } from "rdf-canonize";
import { applyTurtleSource, describeSummary } from "../source-apply";
import { parseTurtle } from "../turtle-parser";
import { buildModelFromTriples } from "../model-builder";
import { serializeToTurtle } from "../turtle-serializer";
import { STANDARD_PREFIXES } from "../uri-utils";
import type { Ontology } from "../../types";

async function canonical(turtle: string): Promise<string> {
  const writer = new Writer({ format: "N-Quads" });
  writer.addQuads(new Parser().parse(turtle));
  const nq = await new Promise<string>((res, rej) => writer.end((e, out) => (e ? rej(e) : res(out))));
  return canonize(nq, { algorithm: "RDFC-1.0", inputFormat: "application/n-quads" });
}

function load(turtle: string): Ontology {
  const model = buildModelFromTriples(parseTurtle(turtle));
  return {
    id: "o", createdAt: "", updatedAt: "", ...model,
    metadata: { ...model.metadata, prefixes: { ...STANDARD_PREFIXES, ...model.metadata.prefixes } },
  };
}

const fixture = fs.readFileSync(new URL("./fixtures/owl-constructs.ttl", import.meta.url), "utf-8");

describe("applyTurtleSource", () => {
  it("is a no-op when the exported text is applied unchanged", () => {
    const onto = load(fixture);
    const result = applyTurtleSource(serializeToTurtle(onto), onto);
    expect(result.ok && result.unchanged).toBe(true);
    if (result.ok) expect(result.next).toBe(onto);
  });

  it("keeps IDs and untouched objects, and stamps only the changed entity", () => {
    const onto = load(fixture);
    const text = serializeToTurtle(onto).replace('rdfs:label "Part"@en', 'rdfs:label "Component"@en');
    const result = applyTurtleSource(text, onto);
    if (!result.ok) throw new Error(result.error);
    expect(describeSummary(result.summary)).toBe("1 class changed");
    const before = (uri: string) => onto.classes.find((c) => c.uri.endsWith(uri))!;
    const after = (uri: string) => result.next.classes.find((c) => c.uri.endsWith(uri))!;
    expect(after("#Part").id).toBe(before("#Part").id);
    expect(after("#Part").labels[0]!.value).toBe("Component");
    expect(after("#Part").modified).toBeTruthy();
    expect(after("#Thing")).toBe(before("#Thing")); // same object: no re-render, no new timestamp
    // :Whole is linked to a blank node shared with other statements, so it's re-created —
    // but its content didn't change, so it keeps its timestamp
    expect(after("#Whole").modified).toBe(before("#Whole").modified);
  });

  it("reports added and removed entities", () => {
    const onto = load(fixture);
    const text = serializeToTurtle(onto)
      .replace(/:chain a owl:ObjectProperty[\s\S]*?\.\n/, "")
      + "\n:Engine a owl:Class ; rdfs:label \"Engine\"@en .\n";
    const result = applyTurtleSource(text, onto);
    if (!result.ok) throw new Error(result.error);
    expect(result.summary.classes.added).toEqual(["Engine"]);
    expect(result.summary.properties.removed).toEqual(["chain"]);
    expect(describeSummary(result.summary)).toBe("1 class added, 1 property removed");
  });

  it("produces exactly the graph that was typed, blank nodes included", async () => {
    const onto = load(fixture);
    // Edit a class that owns blank-node axioms while others keep their stored labels
    const text = serializeToTurtle(onto).replace("owl:disjointWith :Part", "owl:disjointWith :Part , :Colour");
    const result = applyTurtleSource(text, onto);
    if (!result.ok) throw new Error(result.error);
    // Identical apart from the new dcterms:modified stamps on what changed
    const unstamped = (t: string) => t.replace(/\s*dcterms:modified "[^"]*"\^\^xsd:dateTime ;/g, "")
      .replace(/ ;\s*dcterms:modified "[^"]*"\^\^xsd:dateTime \./g, " .");
    expect(await canonical(unstamped(serializeToTurtle(result.next)))).toBe(await canonical(unstamped(text)));
    const stamped = result.next.classes.filter((c) => c.modified).map((c) => c.localName);
    expect(stamped).toEqual(["Whole"]);
  });

  it("rejects invalid Turtle with its line and leaves the ontology alone", () => {
    const onto = load(fixture);
    const result = applyTurtleSource('@prefix : <http://ex.org/> .\n:a :b "oops .\n', onto);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.line).toBe(2);
  });
});
