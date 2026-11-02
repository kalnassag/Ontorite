/**
 * Locate `#` comments in Turtle text — outside IRIs (`<…#frag>`) and string
 * literals — so the Source view can warn that they won't survive an apply.
 * The serializer's own section headers (`# ── Classes ──…`) are excluded:
 * they're regenerated anyway.
 */

export interface CommentRange {
  from: number;
  to: number;
  line: number;
}

const SECTION_HEADER = /^# ── .+ ─+$/;

export function findComments(text: string): CommentRange[] {
  const out: CommentRange[] = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\n") { line++; i++; continue; }
    if (ch === "<") {
      // IRI: runs to the next '>' on the same line
      const end = text.indexOf(">", i);
      const nl = text.indexOf("\n", i);
      i = end !== -1 && (nl === -1 || end < nl) ? end + 1 : i + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const triple = text.startsWith(ch.repeat(3), i);
      const quote = triple ? ch.repeat(3) : ch;
      let j = i + quote.length;
      while (j < text.length && !text.startsWith(quote, j)) {
        if (text[j] === "\\") j++;
        else if (text[j] === "\n") { line++; if (!triple) break; }
        j++;
      }
      i = j + quote.length;
      continue;
    }
    if (ch === "#") {
      const nl = text.indexOf("\n", i);
      const to = nl === -1 ? text.length : nl;
      const lineStart = text.lastIndexOf("\n", i - 1) + 1;
      const whole = text.slice(lineStart, to).trim();
      if (!SECTION_HEADER.test(whole)) out.push({ from: i, to, line });
      i = to;
      continue;
    }
    i++;
  }
  return out;
}
