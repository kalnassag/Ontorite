import { describe, it, expect } from 'vitest';
import { parseTurtle } from '../turtle-parser';
import { buildModelFromTriples } from '../model-builder';
import * as fs from 'fs';

describe('Turtle Parser', () => {
  it('should parse the sample ontology without errors', () => {
    const samplePath = new URL('../../../docs/sample.ttl', import.meta.url);
    const turtle = fs.readFileSync(samplePath, 'utf-8');
    
    const parsed = parseTurtle(turtle);
    
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.triples.length).toBeGreaterThan(0);
    expect(Object.keys(parsed.prefixes)).toContain('owl');
    expect(Object.keys(parsed.prefixes)).toContain('rdfs');
  });

  it('should build a model from parsed triples', () => {
    const samplePath = new URL('../../../docs/sample.ttl', import.meta.url);
    const turtle = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parseTurtle(turtle);
    const model = buildModelFromTriples(parsed);
    
    expect(model.metadata.ontologyUri).toBeTruthy();
    expect(model.classes.length).toBeGreaterThan(0);
    expect(model.properties.length).toBeGreaterThan(0);
  });
  it('should parse OWL restrictions correctly', () => {
    const turtle = `
      @prefix : <http://example.org/> .
      @prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

      :Pizza a owl:Class ;
        rdfs:subClassOf [
          a owl:Restriction ;
          owl:onProperty :hasTopping ;
          owl:someValuesFrom :Cheese
        ] .
    `;
    const parsed = parseTurtle(turtle);
    const model = buildModelFromTriples(parsed);
    
    const pizzaClass = model.classes.find(c => c.localName === 'Pizza');
    expect(pizzaClass).toBeDefined();
    expect(pizzaClass!.restrictions.length).toBe(1);
    
    const restriction = pizzaClass!.restrictions[0]!;
    expect(restriction.propertyUri).toBe('http://example.org/hasTopping');
    expect(restriction.type).toBe('someValuesFrom');
    expect(restriction.value).toBe('http://example.org/Cheese');
  });
});
