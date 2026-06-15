import { describe, it, expect } from 'vitest';
import { sweepLegacyTriples } from '../store';
import type { Ontology } from '../../types';

const SKOS_EDITORIAL = 'http://www.w3.org/2004/02/skos/core#editorialNote';
const OWL_VERSION_IRI = 'http://www.w3.org/2002/07/owl#versionIRI';
const OWL_VERSION_INFO = 'http://www.w3.org/2002/07/owl#versionInfo';

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
        domainUri: 'http://example.org/Dog',
        ranges: [],
        subPropertyOf: [],
        extraTriples: [
          { predicate: SKOS_EDITORIAL, object: 'Property note.', isLiteral: true, lang: '' },
        ],
      },
    ],
    individuals: [],
    unmappedTriples: [
      { subject: 'http://example.org/Onto', predicate: OWL_VERSION_IRI, object: 'http://example.org/v1', isLiteral: false },
      { subject: 'http://example.org/Onto', predicate: OWL_VERSION_INFO, object: '1.2.0', isLiteral: true },
      { subject: 'http://example.org/Onto', predicate: SKOS_EDITORIAL, object: 'Ontology-level note.', isLiteral: true, lang: 'en' },
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
    // Non-editorial extra triple is preserved
    expect(onto.classes[0]!.extraTriples).toHaveLength(1);

    expect(onto.properties[0]!.editorialNotes).toHaveLength(1);
    expect(onto.properties[0]!.extraTriples).toHaveLength(0);
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
