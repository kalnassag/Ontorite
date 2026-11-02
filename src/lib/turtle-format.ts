/**
 * Turtle formatting shared by the serializer and the UI.
 *
 * The cards ("Other axioms"), the "Other statements" panel and the exported
 * file all render raw triples through these functions, so what the user sees
 * in the editor is exactly what lands in the file.
 */

import type { ExtraTriple, Ontology, UnmappedTriple } from "../types";
import { compact, STANDARD_PREFIXES } from "./uri-utils";
import { countReferences } from "./raw-triples";
import { RDF, XSD, isBlankNode } from "./vocab";

export type Pair = [predicate: string, object: string];
export type TermFormatter = (term: string) => string;
type RawLike = Pick<UnmappedTriple, "predicate" | "object" | "isLiteral" | "lang" | "datatype">;

/** Datatypes with a Turtle shorthand form, and the lexical forms that round-trip exactly. */
const SHORTHAND_LITERAL: Record<string, RegExp> = {
  [XSD.integer]: /^[+-]?\d+$/,
  [XSD.decimal]: /^[+-]?\d*\.\d+$/,
  [XSD.boolean]: /^(true|false)$/,
};

export const escLit = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");

export function formatLiteral(value: string, datatype: string | undefined, lang: string | undefined, c: TermFormatter): string {
  if (lang) return `"${escLit(value)}"@${lang}`;
  if (datatype && SHORTHAND_LITERAL[datatype]?.test(value)) return value;
  if (datatype) return `"${escLit(value)}"^^${c(datatype)}`;
  return `"${escLit(value)}"`;
}

/**
 * Prefixed names where valid. For export, blank nodes are renumbered `_:b0…`
 * in order of first use; in the UI (`renumber: false`) they keep their stored
 * label, so a shared node reads the same on a card and in Other statements.
 */
export function createTermFormatter(prefixes: Record<string, string>, { renumber = true } = {}): TermFormatter {
  const labels = new Map<string, string>();
  return (term) => {
    if (!isBlankNode(term)) return compact(term, prefixes);
    if (!renumber) return term;
    let label = labels.get(term);
    if (!label) labels.set(term, (label = `_:b${labels.size}`));
    return label;
  };
}

/** Group pairs by predicate (first-seen order), with `a` always first. */
export function groupPairs(pairs: Pair[]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const [predicate, object] of pairs) {
    const objects = groups.get(predicate) ?? [];
    if (!objects.includes(object)) objects.push(object);
    groups.set(predicate, objects);
  }
  const entries = [...groups.entries()];
  const typeIdx = entries.findIndex(([p]) => p === "a");
  if (typeIdx > 0) entries.unshift(entries.splice(typeIdx, 1)[0]!);
  return entries;
}

/** One resource block: subject, `;`-separated predicates, 4-space continuation, closing `.`. */
export function formatBlock(subject: string, pairs: Pair[]): string[] {
  const groups = groupPairs(pairs);
  const lines: string[] = [];
  groups.forEach(([predicate, objects], i) => {
    const lead = i === 0 ? `${subject} ` : "    ";
    const end = i === groups.length - 1 ? " ." : " ;";
    const oneLine = `${lead}${predicate} ${objects.join(" , ")}${end}`;
    if (objects.length === 1 || oneLine.length <= 100) {
      lines.push(oneLine);
    } else {
      lines.push(`${lead}${predicate} ${objects[0]} ,`);
      objects.slice(1).forEach((obj, j) => lines.push(`        ${obj}${j === objects.length - 2 ? end : " ,"}`));
    }
  });
  return lines;
}

// ── Blank-node rendering ───────────────────────────────────────────────────

export interface NodeRenderer {
  /** A term as Turtle: inline ( … ) / [ … ] for single-use blank nodes, else a name. */
  renderNode: (term: string) => string;
  /** A raw triple's predicate and object as Turtle. */
  triplePair: (t: RawLike) => Pair;
  /** Blank-node subjects already written (inline or as a block) */
  rendered: Set<string>;
  /** Raw triples per blank-node subject */
  own: Map<string, UnmappedTriple[]>;
  refCount: Map<string, number>;
  lists: Map<string, string[]>;
}

/**
 * @param raw      every raw triple that may be rendered
 * @param refCount references to each term across the whole ontology
 */
export function createNodeRenderer(raw: UnmappedTriple[], refCount: Map<string, number>, c: TermFormatter): NodeRenderer {
  const own = new Map<string, UnmappedTriple[]>();
  for (const t of raw) {
    if (!isBlankNode(t.subject)) continue;
    const list = own.get(t.subject) ?? [];
    list.push(t);
    own.set(t.subject, list);
  }
  const { lists, listCells } = indexLists(raw, own, refCount);
  const rendered = new Set<string>();

  const renderNode = (term: string): string => {
    const members = lists.get(term);
    if (members && !rendered.has(term)) {
      listCells.get(term)!.forEach((cell) => rendered.add(cell));
      return `( ${members.map(renderNode).join(" ")} )`;
    }
    const triples = own.get(term);
    if (triples && refCount.get(term) === 1 && !rendered.has(term)) {
      rendered.add(term);
      return `[ ${groupPairs(triples.map(triplePair)).map(([p, objs]) => `${p} ${objs.join(" , ")}`).join(" ; ")} ]`;
    }
    return c(term);
  };
  const triplePair = (t: RawLike): Pair => [
    t.predicate === RDF.type ? "a" : c(t.predicate),
    t.isLiteral ? formatLiteral(t.object, t.datatype, t.lang, c) : renderNode(t.object),
  ];
  return { renderNode, triplePair, rendered, own, refCount, lists };
}

/**
 * Well-formed RDF lists: every cell a blank node with exactly one rdf:first and
 * one rdf:rest, nothing else, referenced exactly once. Only heads are indexed.
 */
function indexLists(raw: UnmappedTriple[], own: Map<string, UnmappedTriple[]>, refCount: Map<string, number>) {
  const isCell = (term: string): boolean => {
    const ts = own.get(term);
    return !!ts && ts.length === 2 && refCount.get(term) === 1
      && ts.some((t) => t.predicate === RDF.first)
      && ts.some((t) => t.predicate === RDF.rest && !t.isLiteral);
  };
  const restObjects = new Set(raw.filter((t) => t.predicate === RDF.rest).map((t) => t.object));
  const lists = new Map<string, string[]>();
  const listCells = new Map<string, string[]>();
  for (const head of own.keys()) {
    if (restObjects.has(head) || !isCell(head)) continue;
    const members: string[] = [];
    const cells: string[] = [];
    let ok = true;
    for (let cur = head; cur !== RDF.nil;) {
      if (!isCell(cur) || cells.includes(cur)) { ok = false; break; }
      const ts = own.get(cur)!;
      const first = ts.find((t) => t.predicate === RDF.first)!;
      if (first.isLiteral) { ok = false; break; }
      members.push(first.object);
      cells.push(cur);
      cur = ts.find((t) => t.predicate === RDF.rest)!.object;
    }
    if (!ok) continue;
    lists.set(head, members);
    listCells.set(head, cells);
  }
  return { lists, listCells };
}

// ── Statement groups ("Other statements") ──────────────────────────────────

export interface StatementGroup {
  /** The block's subject (an IRI, or a blank node that can't be inlined) */
  root: string;
  /** All triples written in this block, including inlined blank nodes */
  triples: UnmappedTriple[];
  /** Turtle lines of the block */
  lines: string[];
}

/**
 * Split other statements into one block per root subject. Single-use blank
 * nodes are inlined into the block that references them; unreferenced blank
 * nodes are written as `[] …`; anything only reachable through a blank-node
 * cycle gets a labelled block of its own.
 */
export function statementGroups(triples: UnmappedTriple[], renderer: NodeRenderer, c: TermFormatter): StatementGroup[] {
  const bySubject = new Map<string, UnmappedTriple[]>();
  for (const t of triples) {
    const list = bySubject.get(t.subject) ?? [];
    list.push(t);
    bySubject.set(t.subject, list);
  }
  const groups: StatementGroup[] = [];
  const emit = (subject: string) => {
    if (renderer.rendered.has(subject)) return;
    renderer.rendered.add(subject);
    const before = renderer.rendered.size;
    const label = isBlankNode(subject) && (renderer.refCount.get(subject) ?? 0) === 0 ? "[]" : c(subject);
    const lines = formatBlock(label, bySubject.get(subject)!.map(renderer.triplePair));
    const inlined = new Set([...renderer.rendered].slice(before));
    groups.push({
      root: subject,
      triples: [...bySubject.get(subject)!, ...[...inlined].flatMap((s) => bySubject.get(s) ?? [])],
      lines,
    });
  };
  const inlineable = (s: string) => isBlankNode(s) && renderer.refCount.get(s) === 1;
  for (const subject of bySubject.keys()) if (!inlineable(subject)) emit(subject);
  for (const subject of bySubject.keys()) emit(subject);
  return groups;
}

// ── UI entry points ────────────────────────────────────────────────────────

/** An extra triple as `predicate object` Turtle, its blank-node structure inlined. */
export function formatExtraTriple(et: ExtraTriple, prefixes: Record<string, string>): string {
  const c = createTermFormatter({ ...STANDARD_PREFIXES, ...prefixes }, { renumber: false });
  const refCount = new Map<string, number>();
  const bump = (term: string) => refCount.set(term, (refCount.get(term) ?? 0) + 1);
  if (!et.isLiteral) bump(et.object);
  for (const t of et.blankNodeTriples ?? []) if (!t.isLiteral) bump(t.object);
  const renderer = createNodeRenderer(et.blankNodeTriples ?? [], refCount, c);
  const [predicate, object] = renderer.triplePair(et);
  return `${predicate} ${object}`;
}

/** The ontology's other statements, grouped and formatted as they'll be exported. */
export function formatOtherStatements(onto: Ontology): StatementGroup[] {
  const c = createTermFormatter({ ...STANDARD_PREFIXES, ...onto.metadata.prefixes }, { renumber: false });
  const renderer = createNodeRenderer(onto.unmappedTriples, countReferences(onto), c);
  return statementGroups(onto.unmappedTriples, renderer, c);
}
