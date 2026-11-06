# Ontorite — Claude Code Guide

## Project Overview

A browser-based OWL 2 ontology editor built for knowledge engineers who are frustrated
by tools that flatten property–class relationships into disconnected lists. The core
design principle: **every class visually displays the properties it is the domain of,
nested directly beneath it.** This is the thing that Protégé, WebVOWL, and PoolParty
all get wrong.

This is a serious professional tool for people who work with OWL 2 daily. It is not a
teaching tool or a toy. Assume the user understands OWL 2, RDF, RDFS, SKOS, and SPARQL.

## Tech Stack

- **Framework:** React 18+ with TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS 3
- **State:** Zustand (lightweight, no boilerplate)
- **Persistence:** IndexedDB via `idb` (for multi-ontology storage across sessions),
  plus write-back to the original file via the File System Access API (Chrome/Edge)
- **RDF parsing:** N3.js (Turtle, N-Triples), `jsonld`, `rdfxml-streaming-parser` —
  all normalised to `ParsedTriple[]`, then mapped by `src/lib/model-builder.ts`
- **Turtle serialization:** Custom serializer in `src/lib/turtle-serializer.ts`
  (the readable output is a feature). Other export formats go Turtle → N3 → target.
- **Graphs:** `d3-force` (layout only; rendering is React SVG)
- **Source editor:** CodeMirror 6 (`@codemirror/*`, Turtle via `@codemirror/legacy-modes`),
  lazy-loaded with the Source view — don't reintroduce Monaco (multi-MB, CDN-loaded)
- **Animation:** CSS keyframes in `tailwind.config.js` (no animation library; respect `motion-reduce`)
- **Icons:** Lucide React
- **Tests:** Vitest (`npm test`), including an RDF-isomorphism round-trip suite
- **No backend.** Fully client-side. `server/index.js` (Express) only serves the built
  `dist/` for the Docker image — it has no API and must stay that way.

## Domain Model

### Core Entities

**Ontology** — a named, versioned container. Has:
- Base URI (namespace)
- Prefix map (prefix → URI)
- owl:Ontology metadata (label, comment, versionIRI, versionInfo, `imports`
  (`owl:imports`), editorial notes, and `extraTriples` for other header statements)
- Classes, Properties, Individuals, and `unmappedTriples` ("Other statements")

All entities carry `editorialNotes` (`skos:editorialNote`), `created` / `modified`
(`dcterms:`), and `extraTriples` for anything without a typed field. An extra
triple whose object is a blank node **owns** that structure in `blankNodeTriples`
(the restriction, intersection, list… it points at), so it moves, copies, renames
and deletes with its entity.

`unmappedTriples` holds only statements with no entity to belong to: untyped or
external subjects, top-level blank-node axioms (`[] a owl:AllDisjointClasses`), and
blank nodes shared by more than one statement.

**Class** (`owl:Class`) — Has:
- URI (derived from base URI + local name)
- Labels (`rdfs:label`) — multilingual, each with value + language tag
- Descriptions (`rdfs:comment`) — multilingual, same structure
- `rdfs:subClassOf` — zero or more parent classes (from within the same ontology)
- `owl:disjointWith`, and simple `restrictions` (see decision 4)
- **Visually displays all properties where this class is the `rdfs:domain`**

**Property** — one of three OWL types:
- `owl:ObjectProperty` — range is a class URI
- `owl:DatatypeProperty` — range is an XSD datatype
- `owl:AnnotationProperty` — range is unconstrained (often a literal or URI)

Each property has:
- URI (derived from base URI + local name)
- Property type (one of the three above)
- Labels (`rdfs:label`) — multilingual
- Descriptions (`rdfs:comment`) — multilingual
- `rdfs:domain` — a `ClassExpression`: one class, or an `owl:unionOf` of classes (the
  property is shown nested under each member)
- `rdfs:range` — zero or more `ClassExpression`s (class URI, XSD type, or union)
- `rdfs:subPropertyOf` — zero or more parent properties
- `owl:inverseOf` (object properties) and simplified min/max/exact cardinality

**Individual** — an IRI typed with one or more classes, with property assertions.

### Key Design Decisions

1. **Domain is required for visual nesting.** Every property MUST have a domain to
   appear nested under a class. Properties without a domain go into an "Unassigned
   Properties" bucket and the UI should make this visible.

2. **Multiple labels/descriptions per language.** This is standard RDF practice.
   The UI must allow adding/removing language-tagged literals for labels and comments.

3. **URI construction.** Local names are derived from the label by default (camelCase
   for properties, PascalCase for classes) but are always editable. The full URI is
   `{baseURI}{localName}`.

4. **Blank nodes only for shapes the model owns.** The model has no blank-node
   entities. Two blank-node shapes are mapped into typed fields:
   - `[ a owl:Class ; owl:unionOf ( … ) ]` as a property domain/range → `ClassExpression`
   - `[ a owl:Restriction ; owl:onProperty … ; <one value> ]` as the object of a
     class's `rdfs:subClassOf` → `OntologyClass.restrictions` (some/all/hasValue,
     min/max/exact cardinality)
   They are consumed only when the shape *and* references match exactly. Everything
   else (intersections, qualified cardinalities, property chains, oneOf, …) is kept
   verbatim as raw triples owned by the statement that references it, shown on the
   entity's card as the exact Turtle that's exported, and edited as a Turtle snippet
   (parsed with N3; a structure is always replaced whole, never half-edited).

7. **The Source view edits a projection, not a file.** It shows exactly what the
   export writes. Applying parses the text strictly and *reconciles* it into the model
   (`lib/source-apply.ts`): entities are matched by IRI (IDs survive), unchanged
   entities keep their exact object and timestamps, changed ones get a new
   `dcterms:modified`, removals need confirmation, and it's one undo step. The text is
   then regenerated, so formatting and `#` comments are **not** kept (agreed trade-off;
   the editor flags comments inline). Keeping comments would need per-entity comment
   anchoring in the model — a possible follow-up, not a reason to make text the
   source of truth. Beside the class / individual cards (split view, either side):
   clicking a card reveals its block, the cursor's block outlines its card
   (`lib/source-sync.ts`, blocks found by `lib/turtle-outline.ts` — a line scan, so it
   works on unapplied and invalid text). Cards carry `data-entity-uri` for this.

6. **Imports are references, never merged.** `owl:imports` is edited in the metadata
   drawer and exported as full IRIs. External ontologies (gist, dcat, dcterms…) live
   in the user's **library** (`lib/references/`, Settings → Library): read-only,
   kept in IndexedDB as their original text, used only to show external terms'
   definitions (hover card + Definition drawer). **Nothing is bundled** — the user
   adds what they use from a catalogue (`catalog.ts`: metadata + download URLs,
   raw GitHub first where the publisher keeps a copy), from a file or link, or via
   Find definition. Lookup is by subject IRI across: other open ontologies → the
   library (entries switched off are skipped). A term's namespace is often not its
   ontology's address (gist: terms under `…/ns/ontology/gist/`, ontology at
   `…/ontology/gistCore`), so Find definition tries the imports, then the catalogue
   entry for the namespace, then the namespace itself.
   There's no backend: when a server blocks browser reads (CORS) the user loads the
   file or a direct URL instead. Labels/descriptions are read from RDFS, SKOS, DC and
   schema.org predicates (gist uses `skos:prefLabel` / `skos:definition`). Validation
   still only reports unknown references inside the ontology's own namespace.

5. **Property cardinality is OWL restrictions on the wire.** `min/max/exactCardinality`
   on a property serialize as a restriction on each domain class (`owl:Thing` if
   unassigned), and a cardinality restriction on a property's own single domain class
   is hoisted back onto the property on import. Never write `owl:cardinality` directly
   on a property — that's not OWL 2 DL.

## Architecture

```
src/
  components/
    layout/   App (root layout + shortcuts), TopBar (title, file, view tabs, actions —
              never clips: labels → icons → wrap, measured), OntologyList (sidebar),
              ClassBrowserPanel, ResizeHandle + usePaneWidth (resizable panes),
              split view: ViewPane (renders any view), SplitPane (side pane + its
              view picker), usePaneViews (which view each pane shows; never the
              same in both — picking the other pane's view swaps), views.ts,
              useSourceCardSync (cards ↔ Source follow each other),
              Drawer, Toast, KeyboardHelp, ErrorBoundary, ViewLoadError
    core/     ClassesView, IndividualsView (the card lists, usable in either pane),
              ClassCard, PropertyRow, IndividualCard, UnassignedProperties,
              TurtleStatementList (an entity's "Other axioms" as Turtle),
              OtherStatements (subject-less statements), ClassHierarchyTree,
              ValidationPanel, OntologyDiff, ImportExport, TimestampFooter
    forms/    ClassForm, PropertyForm, LabelEditor, ExtraTripleEditor, ImportsEditor,
              CharacteristicsEditor, VocabAutocomplete
    dialogs/  OntologyMetadataDrawer, EditorialNotesDrawer, CreateEntityDialog, CreateEdgeDialog
    settings/ SettingsDrawer (lazy; tabs: Library, New ontologies, Display &
              accessibility, Data), LibrarySettings + LibraryCatalog, Choice
    graph/    OntologyGraph (force), TreeGraph (hierarchy), EntityGraph (neighbourhood)
    source/   SourceEditor (Turtle editing view), turtle-editor-setup (CodeMirror config),
              block-highlight (reveal + highlight a block)
    hover/    ClassHover (wrap any class / property name) + HoverCardHost (the single
              app-wide hover card, mounted once in App; state in lib/hover-card.ts),
              DefinitionDrawer (a term's full definition from its source, as linked
              Turtle; FindDefinition fetches / loads it when it isn't loaded yet).
              Wrap new places that render a class/property name in ClassHover rather
              than adding `title=` attributes or per-component popovers.
  lib/
    turtle-parser.ts      Turtle/N-Triples → ParsedTriple[] (N3.js adapter, strict)
    model-builder.ts      ParsedTriple[] → domain model (see decision 4)
    turtle-serializer.ts  domain model → Turtle
    turtle-format.ts      shared Turtle rendering (serializer + UI show identical text)
    turtle-snippets.ts    parse user-typed Turtle (predicate lists, statements)
    raw-triples.ts        blank-node ownership, routing, renaming, relabelling
    source-apply.ts       reconcile edited Turtle into the model (Source view)
    turtle-comments.ts    find `#` comments (outside IRIs/strings) to warn about
    turtle-outline.ts     subject blocks of Turtle text by offset (split-view sync)
    source-sync.ts        split view: reveal-in-source requests, entity under the cursor
    class-refs.ts         resolve picker text to class IRIs; create unknown classes
    references/           the user's library of read-only external ontologies:
                          catalog (common ontologies to add), reference-source (index,
                          summarise, format), reference-fetch (CORS-aware fetch),
                          reference-store (library + lookup), resolve-term (Find definition)
    settings.ts           app settings (localStorage): display, accessibility, defaults
                          for new ontologies; applied to <html> before first paint
    formats/              JSON-LD / RDF/XML / N-Triples adapters (lazy-loaded)
    store.ts              Zustand store, composed from store/*-slice.ts
    store/                internals.ts (commit: undo + persistence), migrations.ts, slices
    selectors.ts          pure derivations (domainUris, propertiesByDomain, …)
    vocab.ts              RDF/OWL/RDFS/SKOS/DCTERMS IRIs — don't redeclare them
    persistence.ts        IndexedDB via idb
    file-access.ts        File System Access API handles
    uri-utils.ts          compact (always valid Turtle), expand, local names
    validation.ts         model validation
  types/index.ts          domain model interfaces
```

### Store rules

- Every domain mutation goes through `commit(updater)` in `store/internals.ts`. It
  records an undo snapshot for **that ontology** (history is per ontology), clears its
  redo stack, and schedules saves **by ontology ID**. Don't hand-roll `set()` for edits.
- Components select narrowly (`selectActiveOntology`, a single entity, a memoised
  derivation). Never call a function inside a selector that returns a new array/map.

## Testing

- `npm test` runs Vitest; `npm run lint` and `npx tsc -b` must be clean.
- `src/lib/__tests__/roundtrip.test.ts` requires every fixture and `docs/*.ttl` file
  to be **graph-isomorphic** (RDFC-1.0) after import → export, and the
  export to be stable. Add a fixture whenever you touch parsing or serialization.

## Feature Requirements (Priority Order)

### P0 — Must Have

1. **Create new ontology from scratch**
   - Set base URI, ontology label, default language
   - Manage prefix map (add/remove/edit)
   - Auto-generates standard prefixes (owl, rdf, rdfs, xsd, skos, dcterms)

2. **Import existing ontology from .ttl file**
   - Parse Turtle into internal model
   - Handle: prefixed names, `a` shorthand, language-tagged literals, datatype literals,
     `;` and `,` shorthand, multi-line strings, comments
   - Gracefully handle parse errors with line-level feedback

3. **Visual class list with nested properties**
   - Each class renders as an expandable card
   - Properties where `rdfs:domain` = this class appear nested beneath it
   - Properties grouped by type (Object, Datatype, Annotation)
   - Show property type icon, label, range, and description inline
   - Expand a property to see full details / edit

4. **Create/edit classes**
   - Set local name (auto-derived from label, editable)
   - Add multilingual labels and descriptions
   - Set subClassOf from dropdown of existing classes

5. **Create/edit properties within a class context**
   - When creating a property from inside a ClassCard, domain is pre-set to that class
   - Choose property type (Object, Datatype, Annotation)
   - Set local name, multilingual labels, descriptions
   - Set range: class picker for ObjectProperty, XSD type picker for DatatypeProperty,
     free text/URI for AnnotationProperty
   - Set subPropertyOf from dropdown of existing properties of same type

6. **Export to .ttl**
   - Serialize entire ontology to valid Turtle
   - Proper prefix declarations, grouped by type, human-readable formatting
   - Download as file

7. **Persist across sessions**
   - Save to IndexedDB automatically on change (debounced)
   - List saved ontologies on sidebar, switch between them
   - Delete ontologies

### P1 — Should Have

8. **Unassigned properties bucket**
   - Show properties with no domain in a separate section
   - Allow dragging them into a class to assign domain

9. **Validation panel**
   - Flag: classes with no labels, properties with no domain, duplicate URIs,
     object properties with non-class ranges, datatype properties with non-XSD ranges

10. **Search/filter**
    - Filter classes and properties by label text
    - Highlight matches

11. **Undo/redo**
    - Track state history, allow stepping back

### P2 — Nice to Have

12. **Class hierarchy tree view**
    - Render subClassOf as a collapsible tree in the sidebar

13. **Drag-and-drop reordering of properties within a class**

14. **Dark mode**

15. **Keyboard shortcuts**
    - `Ctrl+N` new class, `Ctrl+Shift+N` new property, `Ctrl+S` export, `Ctrl+Z` undo
    - In the Source view: `Ctrl+Enter` apply, `Ctrl+S` apply then save, `Ctrl+F` find
    - `Ctrl+\` split view (a second view side by side), `Ctrl+,` Settings

## Import Requirements

Parsing is delegated to N3.js — don't reintroduce a hand-rolled tokenizer. It is strict:
a syntax error rejects the file with its line number (a half-parsed file linked to a file
handle would otherwise be auto-saved over the original). Blank nodes are relabelled
`_:b0…` per document.

The model builder (`model-builder.ts`) must:
- classify subjects by **all** their `rdf:type`s (a property may be declared
  `a owl:TransitiveProperty, owl:ObjectProperty` in either order); types beyond the
  one the serializer emits go to `extraTriples`
- never promote external vocabulary terms (`skos:Concept`, `owl:Restriction`, …) to
  local classes — only undeclared terms in the ontology's own namespace
- keep any triple it can't represent exactly (second `rdfs:domain`, typed labels,
  extra ontology labels, …) in `extraTriples` / `unmappedTriples`

## Turtle Serializer Requirements

The serializer in `src/lib/turtle-serializer.ts` must produce:

- Properly formatted `@prefix` declarations
- `owl:Ontology` declaration block
- Sections: Classes, Object / Datatype / Annotation Properties, Property cardinalities
  (for properties with no local domain class), Individuals, Other statements
- `owl:imports` as full IRIs in the `owl:Ontology` block
- Predicate-object lists (`;`), objects of the same predicate grouped with `,`
- Language-tagged and datatype literals; `1`, `2.5`, `true` shorthand where lossless
- Prefixed names only when the local part is a valid `PN_LOCAL` (`compact()` handles
  this — otherwise `<IRI>`)
- Blank nodes referenced once written inline (`[ … ]`, `( … )`); others labelled and
  numbered in output order so exports are stable
- Clean, human-readable indentation (4-space indent for continuation lines)

## UI/UX Principles

- **Information density over whitespace.** This is a power-user tool. Don't waste
  screen real estate on padding and margins. Think VS Code, not Notion.
- **Keyboard navigable.** Tab through fields, Enter to confirm, Escape to cancel.
- **Inline editing preferred.** Minimise modals. Expand-in-place is better.
- **Colour-code property types.** Use consistent, distinguishable colours for
  Object (blue), Datatype (green), Annotation (amber) across the entire UI.
- **Show URIs on demand.** Default to showing labels; show full URI on hover or
  in an expanded detail view.
- **Error states are visible.** Validation issues surface inline, not in a hidden panel.
- **Both themes, always.** Colours come from the `--th-*` variables in `index.css`, or
  Tailwind colours with an explicit `dark:` pair (e.g. `text-amber-800 dark:text-amber-300`).
  Never a dark-only shade like `text-amber-300` on its own — it washes out in light mode.
  Text inputs get a visible border from the base layer (`--th-input-border`).
- **Accessible by default.** Icon-only buttons get an `aria-label`; single choices use
  `settings/Choice` (a radio group with arrow keys); drawers take and return focus.
  Keyboard focus is outlined globally (`:focus-visible` in `index.css`) — don't remove
  it. Text sizes are `rem` so Settings' text size scales them (avoid `text-[Npx]`).
  Animations must also stop under `html.reduce-motion` (handled globally for CSS
  animations/transitions); the contrast setting only remaps `--th-*` variables, so
  colours that bypass them won't follow it.

## Coding Standards

- TypeScript strict mode. No `any` unless absolutely unavoidable (and commented why).
- Components are functional with hooks. No class components.
- One component per file. Keep files under 300 lines; extract when they grow.
- All state mutations go through the Zustand store. No local component state for
  domain data (local UI state like "is this panel expanded" is fine).
- Name files in PascalCase for components, kebab-case for lib modules.
- Use descriptive variable names. `cls` not `c`, `property` not `p`.
- Handle edge cases: empty strings, missing fields, duplicate URIs.

## Common Pitfalls to Avoid

1. **Don't flatten multilingual labels.** Every label is a `{value, lang}` pair.
   A class can have `"Dog"@en` and `"Hund"@de` simultaneously.
2. **Don't confuse URI with local name.** The URI is `{baseURI}{localName}`.
   Display the local name in the UI; use the full URI in serialization.
3. **Don't lose unrecognised triples on round-trip.** Triples the model can't
   represent exactly go to the subject entity's `extraTriples` (the ontology's own
   for header statements), or to `unmappedTriples` when the subject isn't an entity,
   and are re-serialized verbatim. The round-trip test suite enforces this. Use the
   helpers in `raw-triples.ts` (`addRawTriples`, `freshenExtras`,
   `renameIriInRawTriples`) rather than editing those arrays by hand.
4. **Don't auto-assign language tags.** PoolParty's blanket `@en` tagging is
   a known antipattern. Only tag with a language when the user explicitly sets one:
   new labels use the ontology's `defaultLanguage`, which is empty (untagged) unless
   the user sets it in the metadata drawer or Settings → New ontologies.
5. **Prefix collisions.** When importing, merge prefixes with existing ones.
   Flag conflicts (same prefix, different URI) to the user.

## Known Tech Debt

- Files over the 300-line guideline: `OntologyGraph.tsx`, `EntityGraph.tsx`,
  `App.tsx`, `PropertyForm.tsx`, `TreeGraph.tsx`, `OntologyList.tsx`. The three graph views duplicate pan/zoom/hover logic and
  should share a core.
- The empty domain is the sentinel `{ kind: "class", uri: "" }`; use `domainUris()` /
  `hasDomain()` from `selectors.ts` rather than inspecting it directly.

