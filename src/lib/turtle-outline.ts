/**
 * Where each subject's statement block sits in a Turtle text, by character
 * offset — so the Source editor and the class view can follow each other.
 *
 * Works on what the serializer writes (each subject starts a block at
 * column 0) and tolerates hand-edited text: it's a line scan, not a parse,
 * so text with syntax errors still outlines. Lines inside multi-line strings
 * ("""…""" / '''…''') never start a block.
 */

import { expand } from "./uri-utils";

export interface TurtleBlock {
  /** Subject IRI (expanded) */
  iri: string;
  /** Offset of the block's first character */
  from: number;
  /** Offset just past the block's last non-blank line */
  to: number;
}

const PREFIX_LINE = /^\s*(?:@prefix|PREFIX)\s+([A-Za-z][\w.-]*)?:\s*<([^>]*)>/;
const SUBJECT = /^(<[^>\s]*>|[A-Za-z][\w.-]*:(?:\\.|[^\s;,\\])*[^\s;,.\\]|[A-Za-z][\w.-]*:|:(?:\\.|[^\s;,\\])*[^\s;,.\\]|:)/;

/** Unescape PN_LOCAL backslash escapes (`ex:a\.b` → `a.b`). */
const unescapeLocal = (name: string) => name.replace(/\\(.)/g, "$1");

/** Count unescaped occurrences of a long-string delimiter in a line. */
function delimiterCount(line: string, delimiter: string): number {
  let count = 0;
  for (let i = line.indexOf(delimiter); i >= 0; i = line.indexOf(delimiter, i + 3)) {
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) backslashes++;
    if (backslashes % 2 === 0) count++;
  }
  return count;
}

export function outlineTurtle(text: string, knownPrefixes: Record<string, string> = {}): TurtleBlock[] {
  const prefixes = { ...knownPrefixes };
  const blocks: TurtleBlock[] = [];
  let open: TurtleBlock | null = null;
  let inLong: '"""' | "'''" | null = null;
  let offset = 0;

  for (const line of text.split("\n")) {
    const start = offset;
    offset += line.length + 1;

    if (inLong) {
      if (delimiterCount(line, inLong) % 2 === 1) inLong = null;
      if (open && line.trim()) open.to = start + line.length;
      continue;
    }

    const prefix = PREFIX_LINE.exec(line);
    if (prefix) {
      prefixes[prefix[1] ?? ""] = prefix[2]!;
    } else if (line && !/^[\s#]/.test(line)) {
      const subject = SUBJECT.exec(line);
      if (subject) {
        const term = subject[1]!;
        const colon = term.startsWith("<") ? -1 : term.indexOf(":");
        const iri = colon >= 0 ? expand(term.slice(0, colon + 1) + unescapeLocal(term.slice(colon + 1)), prefixes) : expand(term, prefixes);
        open = { iri, from: start, to: start + line.length };
        blocks.push(open);
      } else {
        open = null; // blank node subject, base declaration, …
      }
    } else if (open && line.trim() && !line.trimStart().startsWith("#")) {
      open.to = start + line.length;
    }

    for (const delimiter of ['"""', "'''"] as const) {
      if (delimiterCount(line, delimiter) % 2 === 1) { inLong = delimiter; break; }
    }
  }
  return blocks;
}

/** The block containing an offset, if any. */
export function blockAt(blocks: TurtleBlock[], pos: number): TurtleBlock | undefined {
  return blocks.find((b) => pos >= b.from && pos <= b.to);
}
