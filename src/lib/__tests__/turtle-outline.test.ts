import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { parseTurtle } from "../turtle-parser";
import { buildModelFromTriples } from "../model-builder";
import { serializeToTurtle } from "../turtle-serializer";
import { outlineTurtle, blockAt } from "../turtle-outline";
import type { Ontology } from "../../types";

const sources: Array<[string, string]> = [
  ["fixtures/owl-constructs.ttl", fs.readFileSync(new URL("./fixtures/owl-constructs.ttl", import.meta.url), "utf-8")],
  ["fixtures/gist-style.ttl", fs.readFileSync(new URL("./fixtures/gist-style.ttl", import.meta.url), "utf-8")],
  ["docs/sample.ttl", fs.readFileSync(new URL("../../../docs/sample.ttl", import.meta.url), "utf-8")],
  ["docs/onepiece-ontology.ttl", fs.readFileSync(new URL("../../../docs/onepiece-ontology.ttl", import.meta.url), "utf-8")],
];

function load(text: string): Ontology {
  const model = buildModelFromTriples(parseTurtle(text));
  return { id: "x", ...model, createdAt: "", updatedAt: "" } as Ontology;
}

describe("outlineTurtle", () => {
  it.each(sources)("finds a block for every entity the serializer writes (%s)", (_name, text) => {
    const onto = load(text);
    const exported = serializeToTurtle(onto);
    const blocks = outlineTurtle(exported);
    const iris = new Set(blocks.map((b) => b.iri));
    for (const entity of [...onto.classes, ...onto.properties, ...onto.individuals]) {
      expect(iris, entity.uri).toContain(entity.uri);
    }
    // Each block ends with its statement's terminating "."
    for (const block of blocks) expect(exported.slice(block.from, block.to).trimEnd()).toMatch(/\.$/);
  });

  it("maps a position to the block containing it", () => {
    const text = `@prefix ex: <http://example.org/> .\n\nex:A a ex:C ;\n    ex:p "x" .\n\n# comment\nex:B a ex:C .\n`;
    const blocks = outlineTurtle(text);
    expect(blocks.map((b) => b.iri)).toEqual(["http://example.org/A", "http://example.org/B"]);
    expect(blockAt(blocks, text.indexOf('"x"'))?.iri).toBe("http://example.org/A");
    expect(blockAt(blocks, text.indexOf("# comment"))).toBeUndefined();
    expect(blockAt(blocks, text.indexOf("ex:B") + 2)?.iri).toBe("http://example.org/B");
  });

  it("ignores column-0 lines inside multi-line strings, and unescapes local names", () => {
    const text = `@prefix ex: <http://example.org/> .\nex:A ex:note """first\nex:NotASubject is prose\nend""" .\n<http://example.org/full> a ex:C .\nex:a\\.b a ex:C .\n`;
    const blocks = outlineTurtle(text);
    expect(blocks.map((b) => b.iri)).toEqual(["http://example.org/A", "http://example.org/full", "http://example.org/a.b"]);
    expect(text.slice(blocks[0]!.from, blocks[0]!.to)).toContain('end""" .');
  });

  it("still outlines text with syntax errors", () => {
    const blocks = outlineTurtle(`@prefix ex: <http://example.org/> .\nex:A a ex:C ;;; oops\nex:B a`);
    expect(blocks.map((b) => b.iri)).toEqual(["http://example.org/A", "http://example.org/B"]);
  });
});
