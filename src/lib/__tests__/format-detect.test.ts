import { describe, it, expect } from 'vitest';
import { detectFormat } from '../formats';

describe('detectFormat', () => {
  it('detects by extension first', () => {
    expect(detectFormat('foo.ttl', '')).toBe('turtle');
    expect(detectFormat('foo.jsonld', '')).toBe('jsonld');
    expect(detectFormat('foo.json', '')).toBe('jsonld');
    expect(detectFormat('foo.rdf', '')).toBe('rdfxml');
    expect(detectFormat('foo.xml', '')).toBe('rdfxml');
    expect(detectFormat('foo.owl', '')).toBe('rdfxml');
    expect(detectFormat('foo.nt', '')).toBe('ntriples');
  });

  it('falls back to content sniffing when extension is unknown', () => {
    expect(detectFormat('foo.bin', '<?xml version="1.0"?>')).toBe('rdfxml');
    expect(detectFormat('foo.bin', '@prefix ex: <http://x/> .')).toBe('turtle');
    expect(detectFormat('foo.bin', '{"@context": {}}')).toBe('jsonld');
    expect(detectFormat('foo.bin', '<http://s> <http://p> <http://o> .')).toBe('ntriples');
  });

  it('defaults to turtle for ambiguous content', () => {
    expect(detectFormat('foo.bin', 'just some text')).toBe('turtle');
  });
});
