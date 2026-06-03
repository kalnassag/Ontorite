import { describe, it, expect } from 'vitest';
import { parseTurtle, buildModelFromTriples } from '../turtle-parser';
import { serializeToTurtle } from '../turtle-serializer';
import * as fs from 'fs';

const RDF_FIRST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";

describe('Turtle Serializer', () => {
  it('should serialize an ontology model back to Turtle without losing data', () => {
    const samplePath = new URL('../../../docs/sample.ttl', import.meta.url);
    const turtle = fs.readFileSync(samplePath, 'utf-8');

    // Parse
    const parsed = parseTurtle(turtle);
    const model = buildModelFromTriples(parsed);
    const ontology = model as any; // Cast for testing

    // Serialize
    const serializedTurtle = serializeToTurtle(ontology);

    expect(serializedTurtle).toContain('@prefix');
    expect(serializedTurtle).toContain('owl:Ontology');

    // Round trip: Parse the serialized turtle again
    const roundTripParsed = parseTurtle(serializedTurtle);
    const roundTripModel = buildModelFromTriples(roundTripParsed);

    // The number of classes and properties should be exactly the same
    expect(roundTripModel.classes.length).toBe(ontology.classes.length);
    expect(roundTripModel.properties.length).toBe(ontology.properties.length);
  });
});

describe('owl:unionOf collection round-trip', () => {
  const turtle = `
    @prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
    @prefix owl:  <http://www.w3.org/2002/07/owl#> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix ex:   <http://example.org/> .

    ex:MyOntology a owl:Ontology .

    ex:Vaccine a owl:Class ; rdfs:label "Vaccine"@en .
    ex:Product a owl:Class ; rdfs:label "Product"@en .
    ex:Drug    a owl:Class ; rdfs:label "Drug"@en .

    ex:hasTarget a owl:ObjectProperty ;
      rdfs:label "has target"@en ;
      rdfs:domain [ a owl:Class ; owl:unionOf ( ex:Vaccine ex:Product ) ] ;
      rdfs:range ex:Drug .
  `;

  it('parses all union members from collection syntax', () => {
    const parsed = parseTurtle(turtle);
    expect(parsed.errors).toHaveLength(0);

    // Both members must appear as rdf:first values
    const firstTriples = parsed.triples.filter(t => t.p === RDF_FIRST);
    expect(firstTriples).toHaveLength(2);
    const members = new Set(firstTriples.map(t => t.o));
    expect(members).toContain('http://example.org/Vaccine');
    expect(members).toContain('http://example.org/Product');
  });

  it('round-trips without losing union members and emits correct syntax', () => {
    const parsed1 = parseTurtle(turtle);
    const model1 = buildModelFromTriples(parsed1);
    const ontology1 = {
      ...model1,
      id: 'test',
      createdAt: '',
      updatedAt: '',
    } as any;

    const serialized = serializeToTurtle(ontology1);

    // Must NOT contain angle-bracketed blank nodes (the <_:b…> bug)
    expect(serialized).not.toMatch(/<_:/);

    // Must contain owl:unionOf with collection syntax, not bare URI
    expect(serialized).toMatch(/owl:unionOf\s+\(/);

    // Re-parse the serialized output
    const parsed2 = parseTurtle(serialized);
    expect(parsed2.errors).toHaveLength(0);

    // Both union members must survive the round-trip
    const firstTriples2 = parsed2.triples.filter(t => t.p === RDF_FIRST);
    const members2 = new Set(firstTriples2.map(t => t.o));
    expect(members2).toContain('http://example.org/Vaccine');
    expect(members2).toContain('http://example.org/Product');

    // A second round-trip must be stable (no further data loss)
    const model2 = buildModelFromTriples(parsed2);
    const ontology2 = { ...model2, id: 'test2', createdAt: '', updatedAt: '' } as any;
    const serialized2 = serializeToTurtle(ontology2);
    expect(serialized2).not.toMatch(/<_:/);
    expect(serialized2).toMatch(/owl:unionOf\s+\(/);
  });

  it('preserves union when the ontology has multiple blank-node union classes', () => {
    const multiUnion = `
      @prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      @prefix owl:  <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix ex:   <http://example.org/> .

      ex:Ont a owl:Ontology .
      ex:A a owl:Class . ex:B a owl:Class .
      ex:C a owl:Class . ex:D a owl:Class .

      ex:p1 a owl:ObjectProperty ;
        rdfs:domain [ a owl:Class ; owl:unionOf ( ex:A ex:B ) ] .

      ex:p2 a owl:ObjectProperty ;
        rdfs:domain [ a owl:Class ; owl:unionOf ( ex:C ex:D ) ] .
    `;

    const parsed = parseTurtle(multiUnion);
    expect(parsed.errors).toHaveLength(0);

    const model = buildModelFromTriples(parsed);
    const ontology = { ...model, id: 'multi', createdAt: '', updatedAt: '' } as any;
    const serialized = serializeToTurtle(ontology);

    expect(serialized).not.toMatch(/<_:/);
    // Both unions must survive — count two separate collection occurrences
    const matches = serialized.match(/owl:unionOf\s+\(/g) ?? [];
    expect(matches.length).toBe(2);

    const parsed2 = parseTurtle(serialized);
    const allMembers = new Set(
      parsed2.triples.filter(t => t.p === RDF_FIRST).map(t => t.o)
    );
    expect(allMembers).toContain('http://example.org/A');
    expect(allMembers).toContain('http://example.org/B');
    expect(allMembers).toContain('http://example.org/C');
    expect(allMembers).toContain('http://example.org/D');
  });
});
