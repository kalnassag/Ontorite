# Ontorite

**A browser-based OWL 2 ontology editor that keeps properties nested under their domain classes — the way knowledge engineers actually think.**

Protégé, WebVOWL, and PoolParty all display properties as a flat list disconnected from the classes they describe. Ontorite fixes that by making every class show the properties it is the `rdfs:domain` of, directly beneath it. Everything runs in the browser and saves on your machine without the need for servers, or sign-ups.

<img width="1715" height="1201" alt="Screenshot 2026-05-18 at 10 06 51 am" src="https://github.com/user-attachments/assets/0d76364f-34ef-486c-963f-701c6cc523b1" />

---

## Features

### Core editing
- **Create ontologies from scratch** — set a base URI, manage prefix mappings, add multilingual labels and descriptions
- **Import + export in four formats** — Turtle (`.ttl`), JSON-LD (`.jsonld`), RDF/XML (`.rdf` / `.owl`), and N-Triples (`.nt`). Import format is auto-detected by extension with content sniffing as fallback; export picks via dropdown
- **Clean, conventional Turtle output** — proper `@prefix` declarations, grouped sections (Classes / Object Properties / Datatype Properties / Annotation Properties / Individuals), trailing-semicolon style
- **Properties nested under their domain class** — Object, Datatype, and Annotation properties colour-coded (blue / green / amber) and grouped beneath each class card
- **Unassigned properties bucket** — properties without a domain are surfaced separately, never silently lost
- **OWL/RDF vocabulary autocomplete** — searchable combobox in range, subClassOf, subPropertyOf, and annotation-predicate fields. Suggests from `owl`, `rdf`, `rdfs`, `xsd`, `skos`, `dcterms`, `foaf`, `schema.org`, `prov`, `dcat`, `void`, `vann` + your in-ontology entities. Matches on local name, label, or full URI

### Navigation
- **Class browser panel** — collapsible hierarchy tree for jumping between classes; double-click to navigate and highlight
- **Search / filter** — live filter across class labels and local names
- **Expand / collapse all** — one click to open or close every class card

### Individuals
- **Individuals view** — browse and inspect `owl:NamedIndividual` instances with their type assertions and property values

### Annotations & provenance
- **Editorial notes** — multilingual `skos:editorialNote` on every class, property, individual, and on the ontology itself. Edit in a right-side drawer; entities with notes show a persistent amber indicator
- **Ontology version metadata** — `owl:versionIRI` and `owl:versionInfo` are parsed, edited in the metadata drawer, and round-trip cleanly. `versionInfo` shows as a small `vX.Y.Z` badge next to the ontology name in the top bar and sidebar
- **Automatic timestamps** — every class, property, individual, and ontology gets `dcterms:created` stamped on add and `dcterms:modified` re-stamped on every edit. Hover any entity for "Modified 3h ago · Created 5d ago"
- **Preserved triples table** — unmapped triples kept on import (anything the model doesn't have a typed field for) are surfaced in an editable table at the bottom of the workspace. Edit subject/predicate/object inline, toggle URI/literal, delete, or promote into an entity's `extraTriples`

### Visualisation
- **Ontology graph** — full D3 force-directed graph of all classes, properties, and their relationships. Self-referencing properties (e.g. `:Person :managerOf :Person`) render as a looped arc
- **Entity graph** — click any entity to see a focused neighbourhood graph centred on it. Self-loops render here too

### Comparison
- **Ontology diff** — pick any two loaded ontologies and see exactly what was added, removed, or modified at the class and property level, with one-click merge of individual changes

### Quality
- **Validation panel** — inline errors and warnings for missing domains, duplicate URIs, type mismatches, and unlabelled entities
- **Undo / redo** — full history stack (`Ctrl+Z` / `Ctrl+Y`)
- **Clipboard** — copy a class with all its properties and paste it into the same or a different ontology

### Usability
- **Dark and light mode** — persisted per device
- **Persists across sessions** — everything is saved to IndexedDB automatically; no cloud required
- **Keyboard shortcuts** — `Ctrl+N` new class, `Ctrl+Z` undo, `Ctrl+Y` redo, `Ctrl+V` paste

---

## How it works

### Layout

```
┌─────────────────┬────────────────┬─────────────────────────────────────┐
│  Ontology list  │  Class browser │  Main panel                         │
│                 │  (hierarchy)   │                                     │
│  + New          │                │  [Classes] [Individuals] [Graph]    │
│  > Ontology A   │  > Animal      │  [Diff]    [Validate]               │
│  > Ontology B   │    > Mammal    │                                     │
│                 │    > Bird      │  ┌──────────────────────────────┐   │
│                 │  > Vehicle     │  │ Mammal                       │   │
│                 │                │  │  ● hasFurColour  (Datatype)  │   │
│                 │                │  │  ● hasHabitat    (Object)    │   │
│                 │                │  └──────────────────────────────┘   │
└─────────────────┴────────────────┴─────────────────────────────────────┘
```

### Typical workflows

**Starting a new ontology**
1. Click **+** in the ontology list sidebar
2. Set the base URI (e.g. `https://example.org/my-ontology/`) and a label
3. Add classes with **+ Add class** or `Ctrl+N`
4. Click **+ Add property** inside any class card — the domain is pre-filled
5. Pick a format from the export dropdown (Turtle / JSON-LD / RDF/XML / N-Triples) and click **↓ Export** when ready

<!-- screenshot: creating a new class -->

**Importing an existing ontology**
1. Click **Import** in the sidebar and pick a file — Turtle, JSON-LD, RDF/XML, or N-Triples. The format is auto-detected from the extension (with content sniffing as fallback)
2. The ontology loads; classes appear with their properties already nested
3. Any properties without a domain appear in the **Unassigned properties** section at the bottom; any triples without a typed mapping appear in the **Preserved triples** table below it for inline editing

<!-- screenshot: imported ontology with nested properties -->

**Comparing two versions**
1. Import both versions as separate ontologies
2. Switch to the **Diff** view and select Left and Right
3. Filter by Added / Removed / Modified / Unchanged
4. Merge individual changes with one click

<!-- screenshot: diff view -->

**Visualising the schema**
1. Switch to **Graph** for a full force-directed overview
2. Click any node to open the **Entity graph** — a focused neighbourhood view showing only that entity's direct relationships

<!-- screenshot: ontology graph -->

---

## Quick start

Requires [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/kalnassag/ontorite.git
cd ontorite
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

To build for static hosting:

```bash
npm run build
# output is in dist/
```

---

## Sample ontology

`docs/onepiece-ontology.ttl` and `docs/sample.ttl` are included for testing. Import either one to explore all features with real data.

---

## License

MIT — see [LICENSE](LICENSE).
