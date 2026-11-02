/** Renders `text` with case-insensitive matches of `query` wrapped in <mark>. */
export default function Highlight({ text, query }: { text: string; query?: string }) {
  const q = query?.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-yellow-300/60 text-inherit dark:bg-yellow-500/40">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    from = at + q.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}
