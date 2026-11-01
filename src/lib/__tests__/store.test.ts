import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const saved: string[] = [];
const deleted: string[] = [];
vi.mock("../persistence", () => ({
  loadAllOntologies: async () => [],
  saveOntology: async (onto: { id: string }) => { saved.push(onto.id); },
  deleteOntology: async (id: string) => { deleted.push(id); },
}));

const { useStore, selectCanUndo, flushPendingSaves } = await import("../store");

const store = () => useStore.getState();
const active = () => store().getActiveOntology()!;

beforeEach(() => {
  vi.useFakeTimers();
  saved.length = 0;
  deleted.length = 0;
  useStore.setState({ ontologies: [], activeOntologyId: null, history: {}, clipboard: null });
});
afterEach(() => vi.useRealTimers());

describe("persistence", () => {
  it("saves an edited ontology even if the user switches away before the debounce fires", async () => {
    const a = store().createOntology({ ontologyLabel: "A" });
    const b = store().createOntology({ ontologyLabel: "B" });
    store().setActiveOntology(a);
    saved.length = 0;

    store().addClass({ labels: [{ value: "Dog", lang: "en" }] });
    store().setActiveOntology(b); // within the 500 ms debounce
    await vi.runAllTimersAsync();

    expect(saved).toContain(a);
    expect(saved).not.toContain(b);
  });

  it("does not re-save an ontology that was deleted while a save was pending", async () => {
    const a = store().createOntology({ ontologyLabel: "A" });
    saved.length = 0;
    store().addClass({});
    store().deleteOntology(a);
    await vi.runAllTimersAsync();
    expect(saved).toEqual([]);
    expect(deleted).toEqual([a]);
  });

  it("flushPendingSaves writes immediately", async () => {
    const a = store().createOntology({ ontologyLabel: "A" });
    saved.length = 0;
    store().addClass({});
    await flushPendingSaves();
    expect(saved).toEqual([a]);
  });
});

describe("undo / redo", () => {
  it("keeps history per ontology", () => {
    const a = store().createOntology({ ontologyLabel: "A" });
    store().addClass({ labels: [{ value: "Dog", lang: "" }] });
    const b = store().createOntology({ ontologyLabel: "B" });

    expect(selectCanUndo(store())).toBe(false);
    store().undo(); // nothing to undo in B — must not touch A
    expect(store().ontologies.find((o) => o.id === a)!.classes).toHaveLength(1);

    store().setActiveOntology(a);
    expect(selectCanUndo(store())).toBe(true);
    store().undo();
    expect(active().classes).toHaveLength(0);
    store().redo();
    expect(active().classes).toHaveLength(1);
    expect(b).toBeTruthy();
  });

  it("drops history with the ontology so undo can't resurrect it", () => {
    const a = store().createOntology({ ontologyLabel: "A" });
    store().addClass({});
    store().createOntology({ ontologyLabel: "B" });
    store().deleteOntology(a);
    store().undo();
    expect(store().ontologies.map((o) => o.id)).not.toContain(a);
    expect(store().history[a]).toBeUndefined();
  });

  it("caps history at 50 steps", () => {
    store().createOntology({ ontologyLabel: "A" });
    for (let i = 0; i < 60; i++) store().addClass({ localName: `C${i}` });
    expect(store().history[active().id]!.past).toHaveLength(50);
  });
});

describe("cascades", () => {
  beforeEach(() => {
    store().createOntology({ ontologyLabel: "A", baseUri: "http://ex.org/" });
  });

  it("renaming a class updates subclasses, disjoints, domains and ranges", () => {
    const animal = store().addClass({ localName: "Animal" });
    store().addClass({ localName: "Dog", subClassOf: ["http://ex.org/Animal"], disjointWith: ["http://ex.org/Animal"] });
    store().addProperty({
      localName: "eats", type: "owl:ObjectProperty",
      domain: { kind: "union", uris: ["http://ex.org/Animal", "http://ex.org/Dog"] },
      ranges: [{ kind: "class", uri: "http://ex.org/Animal" }],
    });
    store().updateClass(animal, { localName: "Beast", uri: "http://ex.org/Beast" });

    const dog = active().classes.find((c) => c.localName === "Dog")!;
    expect(dog.subClassOf).toEqual(["http://ex.org/Beast"]);
    expect(dog.disjointWith).toEqual(["http://ex.org/Beast"]);
    const eats = active().properties[0]!;
    expect(eats.domain).toEqual({ kind: "union", uris: ["http://ex.org/Beast", "http://ex.org/Dog"] });
    expect(eats.ranges).toEqual([{ kind: "class", uri: "http://ex.org/Beast" }]);
  });

  it("deleting a class removes references to it", () => {
    const animal = store().addClass({ localName: "Animal" });
    store().addClass({ localName: "Dog", subClassOf: ["http://ex.org/Animal"] });
    store().addProperty({ localName: "name", domain: { kind: "class", uri: "http://ex.org/Animal" } });
    store().deleteClass(animal);
    expect(active().classes[0]!.subClassOf).toEqual([]);
    expect(active().properties[0]!.domain).toEqual({ kind: "class", uri: "" });
  });

  it("renaming a property updates restrictions, sub-properties and inverses", () => {
    const owns = store().addProperty({ localName: "owns", type: "owl:ObjectProperty" });
    store().addProperty({ localName: "ownedBy", type: "owl:ObjectProperty", inverseOf: "http://ex.org/owns", subPropertyOf: ["http://ex.org/owns"] });
    store().addClass({
      localName: "Owner",
      restrictions: [{ propertyUri: "http://ex.org/owns", type: "someValuesFrom", value: "http://ex.org/Thing" }],
    });
    store().updateProperty(owns, { localName: "has", uri: "http://ex.org/has" });

    const ownedBy = active().properties.find((p) => p.localName === "ownedBy")!;
    expect(ownedBy.inverseOf).toBe("http://ex.org/has");
    expect(ownedBy.subPropertyOf).toEqual(["http://ex.org/has"]);
    expect(active().classes[0]!.restrictions[0]!.propertyUri).toBe("http://ex.org/has");
  });
});

describe("import", () => {
  it("rejects a file with a syntax error instead of half-importing it", () => {
    expect(() => store().importOntology('@prefix : <http://ex.org/> .\n:a :b "oops .', "bad.ttl")).toThrow(/Line 2/);
    expect(store().ontologies).toHaveLength(0);
  });
});
