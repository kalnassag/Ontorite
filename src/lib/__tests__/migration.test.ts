import { describe, it, expect } from 'vitest';
import { sweepLegacyTriples, hoistClassExpressions } from '../store';
import type { Ontology, OntologyClass, OntologyProperty } from '../../types';

const SKOS_EDITORIAL = 'http://www.w3.org/2004/02/skos/core#editorialNote';
const OWL_VERSION_IRI = 'http://www.w3.org/2002/07/owl#versionIRI';
const OWL_VERSION_INFO = 'http://www.w3.org/2002/07/owl#versionInfo';
const DCT_CREATED = 'http://purl.org/dc/terms/created';
const DCT_MODIFIED = 'http://purl.org/dc/terms/modified';

function makeOntology(): Ontology {
  return {
    id: 'o1',
    metadata: {
      baseUri: 'http://example.org/',
      ontologyUri: 'http://example.org/Onto',
      ontologyLabel: 'Test',
      ontologyComment: '',
      versionIRI: '',
      versionInfo: '',
      editorialNotes: [],
      prefixes: {},
      defaultLanguage: 'en',
    },
    classes: [
      {
        id: 'c1',
        localName: 'Dog',
        uri: 'http://example.org/Dog',
        labels: [{ value: 'Dog', lang: 'en' }],
        descriptions: [],
        editorialNotes: [],
        subClassOf: [],
        disjointWith: [],
        restrictions: [],
        extraTriples: [
          { predicate: SKOS_EDITORIAL, object: 'Class-level note.', isLiteral: true, lang: 'en' },
          { predicate: DCT_CREATED, object: '2026-01-01T00:00:00Z', isLiteral: true },
          { predicate: DCT_MODIFIED, object: '2026-06-01T00:00:00Z', isLiteral: true },
          { predicate: 'http://example.org/other', object: 'http://example.org/x', isLiteral: false },
        ],
      },
    ],
    properties: [
      {
        id: 'p1',
        localName: 'barks',
        uri: 'http://example.org/barks',
        type: 'owl:DatatypeProperty',
        labels: [{ value: 'barks', lang: 'en' }],
        descriptions: [],
        editorialNotes: [],
        domain: { kind: 'class', uri: 'http://example.org/Dog' },
        ranges: [],
        subPropertyOf: [],
        extraTriples: [
          { predicate: SKOS_EDITORIAL, object: 'Property note.', isLiteral: true, lang: '' },
          { predicate: DCT_MODIFIED, object: '2026-05-15T00:00:00Z', isLiteral: true },
        ],
      },
    ],
    individuals: [],
    unmappedTriples: [
      { subject: 'http://example.org/Onto', predicate: OWL_VERSION_IRI, object: 'http://example.org/v1', isLiteral: false },
      { subject: 'http://example.org/Onto', predicate: OWL_VERSION_INFO, object: '1.2.0', isLiteral: true },
      { subject: 'http://example.org/Onto', predicate: SKOS_EDITORIAL, object: 'Ontology-level note.', isLiteral: true, lang: 'en' },
      { subject: 'http://example.org/Onto', predicate: DCT_CREATED, object: '2025-12-01T00:00:00Z', isLiteral: true },
      { subject: 'http://example.org/Onto', predicate: DCT_MODIFIED, object: '2026-06-15T00:00:00Z', isLiteral: true },
      { subject: 'http://example.org/Onto', predicate: 'http://example.org/other', object: 'value', isLiteral: true },
    ],
    createdAt: '',
    updatedAt: '',
  };
}

describe('sweepLegacyTriples', () => {
  it('moves skos:editorialNote out of extraTriples into editorialNotes', () => {
    const onto = makeOntology();
    sweepLegacyTriples(onto);
    expect(onto.classes[0]!.editorialNotes).toHaveLength(1);
    expect(onto.classes[0]!.editorialNotes[0]!.value).toBe('Class-level note.');
    expect(onto.classes[0]!.extraTriples.some((e) => e.predicate === SKOS_EDITORIAL)).toBe(false);
    // Non-editorial / non-timestamp extra triple is preserved
    expect(onto.classes[0]!.extraTriples).toHaveLength(1);

    expect(onto.properties[0]!.editorialNotes).toHaveLength(1);
    expect(onto.properties[0]!.extraTriples).toHaveLength(0);
  });

  it('hoists dcterms:created/modified out of extraTriples into typed fields', () => {
    const onto = makeOntology();
    sweepLegacyTriples(onto);
    expect(onto.classes[0]!.created).toBe('2026-01-01T00:00:00Z');
    expect(onto.classes[0]!.modified).toBe('2026-06-01T00:00:00Z');
    expect(onto.classes[0]!.extraTriples.some((e) => e.predicate === DCT_CREATED)).toBe(false);
    expect(onto.classes[0]!.extraTriples.some((e) => e.predicate === DCT_MODIFIED)).toBe(false);

    expect(onto.properties[0]!.modified).toBe('2026-05-15T00:00:00Z');
    expect(onto.properties[0]!.created).toBeUndefined();
  });

  it('hoists dcterms:created/modified from ontology-level unmappedTriples', () => {
    const onto = makeOntology();
    sweepLegacyTriples(onto);
    expect(onto.metadata.created).toBe('2025-12-01T00:00:00Z');
    expect(onto.metadata.modified).toBe('2026-06-15T00:00:00Z');
  });

  it('extracts versionIRI / versionInfo / editorialNote from ontology-level unmappedTriples', () => {
    const onto = makeOntology();
    sweepLegacyTriples(onto);
    expect(onto.metadata.versionIRI).toBe('http://example.org/v1');
    expect(onto.metadata.versionInfo).toBe('1.2.0');
    expect(onto.metadata.editorialNotes).toHaveLength(1);
    // Only the non-special unmapped triple remains
    expect(onto.unmappedTriples).toHaveLength(1);
    expect(onto.unmappedTriples[0]!.predicate).toBe('http://example.org/other');
  });

  it('is idempotent — second sweep does not change a swept ontology', () => {
    const onto = makeOntology();
    sweepLegacyTriples(onto);
    const snapshot = JSON.stringify(onto);
    sweepLegacyTriples(onto);
    expect(JSON.stringify(onto)).toBe(snapshot);
  });
});

describe('hoistClassExpressions — blank-node union → ClassExpression', () => {
  // Models a legacy ontology saved before union refactor:
  //   ex:hasTarget rdfs:domain _:b0 .
  //   _:b0 a owl:Class ; owl:unionOf _:b1 .
  //   _:b1 rdf:first ex:Vaccine ; rdf:rest _:b2 .
  //   _:b2 rdf:first ex:Product ; rdf:rest rdf:nil .
  function makeOntology(): Ontology {
    const blankUnionClass: OntologyClass = {
      id: 'bn1',
      localName: '',
      uri: '_:b0',
      labels: [],
      descriptions: [],
      editorialNotes: [],
      subClassOf: [],
      disjointWith: [],
      restrictions: [],
      extraTriples: [
        { predicate: 'http://www.w3.org/2002/07/owl#unionOf', object: '_:b1', isLiteral: false },
      ],
    };
    // Bypass strict typing on purpose — this fixture intentionally uses the
    // legacy `domainUri` / `ranges: string[]` shape that `hoistClassExpressions`
    // is supposed to upgrade.
    const property = {
      id: 'p1',
      localName: 'hasTarget',
      uri: 'http://example.org/hasTarget',
      type: 'owl:ObjectProperty' as const,
      labels: [{ value: 'has target', lang: 'en' }],
      descriptions: [],
      editorialNotes: [],
      domainUri: '_:b0',
      ranges: ['http://example.org/Drug'],
      subPropertyOf: [],
      extraTriples: [],
    } as unknown as OntologyProperty;
    return {
      id: 'o',
      metadata: {
        baseUri: 'http://example.org/',
        ontologyUri: 'http://example.org/Onto',
        ontologyLabel: '',
        ontologyComment: '',
        versionIRI: '',
        versionInfo: '',
        editorialNotes: [],
        prefixes: {},
        defaultLanguage: 'en',
      },
      classes: [blankUnionClass],
      properties: [property],
      individuals: [],
      unmappedTriples: [
        { subject: '_:b1', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', object: 'http://example.org/Vaccine', isLiteral: false },
        { subject: '_:b1', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest', object: '_:b2', isLiteral: false },
        { subject: '_:b2', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first', object: 'http://example.org/Product', isLiteral: false },
        { subject: '_:b2', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest', object: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil', isLiteral: false },
      ],
      createdAt: '',
      updatedAt: '',
    };
  }

  it('lifts the blank-node union into the property domain and removes the class', () => {
    const onto = makeOntology();
    hoistClassExpressions(onto);
    expect(onto.classes).toHaveLength(0);
    const prop = onto.properties[0]!;
    expect(prop.domain.kind).toBe('union');
    if (prop.domain.kind === 'union') {
      expect(prop.domain.uris).toEqual(['http://example.org/Vaccine', 'http://example.org/Product']);
    }
    // Range was a single string in the legacy shape — should become a single-class expression
    expect(prop.ranges).toHaveLength(1);
    expect(prop.ranges[0]!.kind).toBe('class');
    if (prop.ranges[0]!.kind === 'class') {
      expect(prop.ranges[0]!.uri).toBe('http://example.org/Drug');
    }
    // List cells should be pruned from unmappedTriples
    expect(onto.unmappedTriples.every((t) =>
      t.predicate !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first' &&
      t.predicate !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
    )).toBe(true);
  });

  it('is idempotent', () => {
    const onto = makeOntology();
    hoistClassExpressions(onto);
    const snapshot = JSON.stringify(onto);
    hoistClassExpressions(onto);
    expect(JSON.stringify(onto)).toBe(snapshot);
  });
});
