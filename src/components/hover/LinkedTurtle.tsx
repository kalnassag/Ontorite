/**
 * A Turtle block where every IRI and prefixed name is a link to that term's
 * definition. String literals are left alone (an IRI-looking string isn't a term).
 */

import { Fragment } from "react";
import { expand } from "../../lib/uri-utils";

interface Props {
  text: string;
  prefixes: Record<string, string>;
  onFollow: (uri: string) => void;
}

// Strings first so `#`, `:` and `<` inside them are never treated as terms
const TOKEN = /("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"(?:@[\w-]+|\^\^\S+)?)|(<[^>\s]+>)|((?<![\w:/-])(?:[A-Za-z][\w.-]*)?:[A-Za-z_][\w-]*(?:\.[\w-]+)*)/g;

export default function LinkedTurtle({ text, prefixes, onFollow }: Props) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, literal, iri, prefixed] = match;
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    if (literal) {
      parts.push(<span key={at} className="text-[color:var(--syn-string)]">{whole}</span>);
    } else {
      const uri = iri ? iri.slice(1, -1) : expand(prefixed!, prefixes);
      const resolvable = uri !== prefixed; // unknown prefix stays plain
      parts.push(resolvable ? (
        <button
          key={at}
          onClick={() => onFollow(uri)}
          className="text-[color:var(--syn-name)] hover:underline"
          title={uri}
        >
          {whole}
        </button>
      ) : <Fragment key={at}>{whole}</Fragment>);
    }
    last = at + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-th-input p-2 font-mono text-2xs leading-relaxed text-th-fg-2">
      {parts}
    </pre>
  );
}
