import { describe, it, expect } from "vitest";
import { resolveClassReference, resolveIri, repairReference } from "../class-refs";
import type { OntologyClass } from "../../types";

const cls = (localName: string, label: string): OntologyClass => ({
  id: localName, localName, uri: `http://ex.org/o#${localName}`, labels: [{ value: label, lang: "en" }],
  descriptions: [], editorialNotes: [], subClassOf: [], disjointWith: [], restrictions: [], extraTriples: [],
});
const ctx = {
  classes: [cls("Person", "Person"), cls("MotorVehicle", "Motor vehicle")],
  baseUri: "http://ex.org/o#",
  prefixes: { "": "http://ex.org/o#", foaf: "http://xmlns.com/foaf/0.1/" },
};

describe("resolveClassReference", () => {
  it("matches an existing class by label or local name, case-insensitively", () => {
    expect(resolveClassReference("person", ctx)).toEqual({ ok: true, uri: "http://ex.org/o#Person" });
    expect(resolveClassReference("Motor Vehicle", ctx)).toEqual({ ok: true, uri: "http://ex.org/o#MotorVehicle" });
  });

  it("turns an unknown name into a new local class, never bare text", () => {
    expect(resolveClassReference("Electric car", ctx)).toEqual({
      ok: true,
      uri: "http://ex.org/o#ElectricCar",
      newClass: { uri: "http://ex.org/o#ElectricCar", localName: "ElectricCar", label: "Electric car" },
    });
  });

  it("expands known prefixed names and accepts absolute IRIs", () => {
    expect(resolveClassReference("foaf:Agent", ctx)).toEqual({ ok: true, uri: "http://xmlns.com/foaf/0.1/Agent" });
    expect(resolveClassReference(":Person", ctx)).toEqual({ ok: true, uri: "http://ex.org/o#Person" });
    expect(resolveClassReference("<https://schema.org/Car>", ctx)).toEqual({ ok: true, uri: "https://schema.org/Car" });
  });

  it("rejects unknown prefixes instead of storing them", () => {
    expect(resolveClassReference("ex:Thing", ctx).ok).toBe(false);
  });
});

describe("resolveIri", () => {
  it("accepts prefixed names and IRIs, rejects free text", () => {
    expect(resolveIri("xsd:string", { xsd: "http://www.w3.org/2001/XMLSchema#" })).toEqual({ ok: true, uri: "http://www.w3.org/2001/XMLSchema#string" });
    expect(resolveIri("just some words", {}).ok).toBe(false);
  });
});

describe("repairReference", () => {
  it("fixes bare names saved by older versions", () => {
    expect(repairReference("Person", ctx)).toBe("http://ex.org/o#Person");
    expect(repairReference("Vehicle", ctx)).toBe("http://ex.org/o#Vehicle");
    expect(repairReference(":Person", ctx)).toBe("http://ex.org/o#Person");
    expect(repairReference("http://xmlns.com/foaf/0.1/Agent", ctx)).toBe("http://xmlns.com/foaf/0.1/Agent");
    expect(repairReference("_:b1", ctx)).toBe("_:b1");
  });
});
