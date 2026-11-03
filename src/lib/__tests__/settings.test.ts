import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../persistence", () => ({
  loadAllOntologies: async () => [],
  saveOntology: async () => undefined,
  deleteOntology: async () => undefined,
}));

const { DEFAULT_SETTINGS, baseUriFor, normalizeSettings, useSettings } = await import("../settings");
const { useStore } = await import("../store");
const { serializeToTurtle } = await import("../turtle-serializer");

beforeEach(() => {
  useSettings.setState({ settings: DEFAULT_SETTINGS });
  useStore.setState({ ontologies: [], activeOntologyId: null, history: {}, clipboard: null });
});

describe("settings", () => {
  it("keeps valid values and replaces malformed ones with defaults", () => {
    const settings = normalizeSettings({
      theme: "dark", textSize: "huge", contrast: "always",
      newOntology: { defaultLanguage: " de ", prefixes: { gist: "https://w3id.org/semanticarts/ns/ontology/gist/", bad: 3 } },
    });
    expect(settings.theme).toBe("dark");
    expect(settings.textSize).toBe("default");
    expect(settings.contrast).toBe("always");
    expect(settings.newOntology.defaultLanguage).toBe("de");
    expect(settings.newOntology.prefixes).toEqual({ gist: "https://w3id.org/semanticarts/ns/ontology/gist/" });
    expect(settings.newOntology.baseUriPattern).toBe(DEFAULT_SETTINGS.newOntology.baseUriPattern);
  });

  it("builds base URIs from the pattern", () => {
    expect(baseUriFor("My Ontology", "https://example.com/ont/{name}#")).toBe("https://example.com/ont/my-ontology#");
    expect(baseUriFor("  ", "http://example.org/{name}/")).toBe("http://example.org/ontology/");
    expect(baseUriFor("X", "https://fixed.example/")).toBe("https://fixed.example/");
  });

  it("creates ontologies with untagged labels by default, and the configured prefixes", () => {
    useSettings.getState().updateNewOntology({ prefixes: { gist: "https://w3id.org/semanticarts/ns/ontology/gist/" } });
    useStore.getState().createOntology({ ontologyLabel: "Pets" });
    const onto = useStore.getState().getActiveOntology()!;
    expect(onto.metadata.defaultLanguage).toBe("");
    expect(onto.metadata.baseUri).toBe("http://example.org/pets/");
    expect(onto.metadata.prefixes.gist).toBe("https://w3id.org/semanticarts/ns/ontology/gist/");
    // The label editor tags new labels with the ontology's default language — here, none
    useStore.getState().addClass({ localName: "Dog", labels: [{ value: "Dog", lang: onto.metadata.defaultLanguage }] });
    const turtle = serializeToTurtle(useStore.getState().getActiveOntology()!);
    expect(turtle).toMatch(/rdfs:label "Dog"\s*[;.]/);
  });

  it("tags new labels when a default language is set", () => {
    useSettings.getState().updateNewOntology({ defaultLanguage: "en" });
    useStore.getState().createOntology({ ontologyLabel: "Pets" });
    expect(useStore.getState().getActiveOntology()!.metadata.defaultLanguage).toBe("en");
  });

  it("gives imported ontologies the configured default language", () => {
    useStore.getState().importOntology("@prefix ex: <http://example.org/> . ex:A a <http://www.w3.org/2002/07/owl#Class> .", "a.ttl");
    expect(useStore.getState().getActiveOntology()!.metadata.defaultLanguage).toBe("");
  });
});
