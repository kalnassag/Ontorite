import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";

vi.mock("../persistence", () => ({
  loadAllReferences: async () => [],
  saveReference: async () => undefined,
  deleteReference: async () => undefined,
}));

const { resolveTerm, useReferences } = await import("../references/reference-store");
const { findDefinition } = await import("../references/reference-source");

const EX = "https://example.org/ns/ontology/core/";
const text = fs.readFileSync(new URL("./fixtures/gist-style.ttl", import.meta.url), "utf-8");

describe("resolveTerm", () => {
  it("falls through a blocked import to the namespace, caches what it fetched, and finds the term", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "https://example.org/ontology/core") throw new TypeError("Failed to fetch"); // CORS
      return new Response(text, { headers: { "content-type": "text/turtle" } });
    }));
    const steps: string[] = [];
    const found = await resolveTerm(EX + "Category", ["https://example.org/ontology/core"], (s) => steps.push(`${s.url} ${s.outcome}`));
    expect(found).toBe(true);
    expect(steps).toEqual([
      "https://example.org/ontology/core blocked",
      "https://example.org/ns/ontology/core/ found",
    ]);
    expect(findDefinition(EX + "Category", useReferences.getState().sources)).not.toBeNull();
    // Cached: another term from the same ontology needs no fetch
    expect(findDefinition(EX + "Person", useReferences.getState().sources)).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("rejects text that isn't RDF with a readable message", async () => {
    await expect(useReferences.getState().addFromText("x", "this is not turtle {", "notes.txt", "notes.txt")).rejects.toThrow(/Line|No RDF/);
  });
});
