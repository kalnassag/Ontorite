import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";

vi.mock("../persistence", () => ({
  loadAllReferences: async () => [],
  saveReference: async () => undefined,
  deleteReference: async () => undefined,
}));

const { useReferences, enabledLibrarySources, isCatalogEntryInstalled } = await import("../references/reference-store");
const { resolveTerm } = await import("../references/resolve-term");
const { CATALOG } = await import("../references/catalog");
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
    await expect(useReferences.getState().addFromText("this is not turtle {", "notes.txt", "notes.txt")).rejects.toThrow(/Line|No RDF/);
  });
});

const GIST_NS = "https://w3id.org/semanticarts/ns/ontology/gist/";
const gistLike = `@prefix gist: <${GIST_NS}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<https://w3id.org/semanticarts/ontology/gistCore> a owl:Ontology ; skos:prefLabel "gist" .
gist:Organization a owl:Class ; skos:prefLabel "Organization" ; skos:definition "A generic organization." .
`;
const gist = CATALOG.find((e) => e.id === "gist")!;

describe("library", () => {
  it("adds a catalogue entry, trying its URLs in order, and files it under the catalogue's name", async () => {
    useReferences.setState({ stored: [], sources: [] });
    const tried: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      tried.push(url);
      return new Response(gistLike, { headers: { "content-type": "text/plain" } });
    }));
    const outcome = await useReferences.getState().addFromCatalog(gist);
    expect(outcome.ok).toBe(true);
    expect(tried).toEqual([gist.urls[0]]);
    const [record] = useReferences.getState().stored;
    expect(record).toMatchObject({ catalogId: "gist", name: "gist (core)", prefix: "gist", iri: gist.ontologyIri });
    expect(isCatalogEntryInstalled(gist, useReferences.getState().stored, useReferences.getState().sources)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("explains a catalogue entry every URL of which is blocked", async () => {
    useReferences.setState({ stored: [], sources: [] });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const dcat = CATALOG.find((e) => e.id === "dcat")!;
    const outcome = await useReferences.getState().addFromCatalog(dcat);
    expect(outcome).toMatchObject({ ok: false, reason: "blocked" });
    expect(!outcome.ok && outcome.message).toMatch(/homepage/);
    vi.unstubAllGlobals();
  });

  it("replaces, rather than duplicates, the same ontology added again (by its owl:Ontology IRI)", async () => {
    useReferences.setState({ stored: [], sources: [] });
    const store = useReferences.getState();
    await store.addFromText(gistLike, "gistCore.ttl", "gistCore.ttl", { iri: gist.ontologyIri, catalogId: "gist", name: gist.name });
    await store.addFromText(gistLike, "https://example.org/copy.ttl", "copy.ttl"); // no options: matched by owl:Ontology IRI
    expect(useReferences.getState().stored).toHaveLength(1);
    expect(useReferences.getState().stored[0]).toMatchObject({ origin: "https://example.org/copy.ttl", name: gist.name });
  });

  it("skips switched-off entries when looking terms up", async () => {
    const [record] = useReferences.getState().stored;
    await useReferences.getState().setEnabled(record!.id, false);
    const { stored, sources } = useReferences.getState();
    expect(findDefinition(GIST_NS + "Organization", enabledLibrarySources(stored, sources))).toBeNull();
    await useReferences.getState().setEnabled(record!.id, true);
    const after = useReferences.getState();
    expect(findDefinition(GIST_NS + "Organization", enabledLibrarySources(after.stored, after.sources))).not.toBeNull();
  });

  it("finds a term through the catalogue when its import is blocked (gist: namespace ≠ ontology address)", async () => {
    useReferences.setState({ stored: [], sources: [] });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url !== gist.urls[0]) throw new TypeError("Failed to fetch");
      return new Response(gistLike, { headers: { "content-type": "text/plain" } });
    }));
    const steps: string[] = [];
    const found = await resolveTerm(GIST_NS + "Organization", ["https://example.org/ontology/blocked"], (s) => steps.push(`${s.url} ${s.outcome}`));
    expect(found).toBe(true);
    expect(steps).toEqual(["https://example.org/ontology/blocked blocked", `${gist.urls[0]} found`]);
    expect(useReferences.getState().stored[0]?.catalogId).toBe("gist");
    vi.unstubAllGlobals();
  });
});
