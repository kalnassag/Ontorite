/**
 * Round-trip fidelity: import → export must produce an RDF graph isomorphic
 * to the input (compared via RDFC-1.0 canonical N-Quads, so blank-node
 * labels don't matter). This is the guard against silent data loss.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { Parser, Writer } from "n3";
import { canonize } from "rdf-canonize";
import { parseTurtle } from "../turtle-parser";
import { buildModelFromTriples } from "../model-builder";
import { serializeToTurtle } from "../turtle-serializer";
import { STANDARD_PREFIXES } from "../uri-utils";
import type { Ontology } from "../../types";

async function canonical(turtle: string): Promise<string> {
  const quads = new Parser().parse(turtle);
  const writer = new Writer({ format: "N-Quads" });
  writer.addQuads(quads);
  const nquads = await new Promise<string>((resolve, reject) =>
    writer.end((err, out) => (err ? reject(err) : resolve(out))));
  return canonize(nquads, { algorithm: "RDFC-1.0", inputFormat: "application/n-quads" });
}

export function importExport(turtle: string): string {
  const parsed = parseTurtle(turtle);
  expect(parsed.errors).toEqual([]);
  const model = buildModelFromTriples(parsed);
  const ontology: Ontology = {
    id: "test",
    ...model,
    metadata: { ...model.metadata, prefixes: { ...STANDARD_PREFIXES, ...model.metadata.prefixes } },
    createdAt: "",
    updatedAt: "",
  };
  return serializeToTurtle(ontology);
}

const fixture = (name: string) =>
  fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf-8");
const doc = (name: string) =>
  fs.readFileSync(new URL(`../../../docs/${name}`, import.meta.url), "utf-8");

const cases: Array<[string, string]> = [
  ["fixtures/owl-constructs.ttl", fixture("owl-constructs.ttl")],
  ["fixtures/gist-style.ttl", fixture("gist-style.ttl")],
  ["docs/sample.ttl", doc("sample.ttl")],
  ["docs/onepiece-ontology.ttl", doc("onepiece-ontology.ttl")],
];

describe("round-trip fidelity", () => {
  it.each(cases)("%s is graph-isomorphic after import → export", async (_name, turtle) => {
    const exported = importExport(turtle);
    expect(await canonical(exported)).toBe(await canonical(turtle));
  });

  it.each(cases)("%s export is stable (export → import → export)", (_name, turtle) => {
    const once = importExport(turtle);
    expect(importExport(once)).toBe(once);
  });
});
