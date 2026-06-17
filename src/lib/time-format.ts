/**
 * Relative time formatter for dcterms:created / dcterms:modified timestamps.
 *
 * Tiered output:
 *   < 5s   → "just now"
 *   < 60s  → "Ns ago"
 *   < 60m  → "Nm ago"
 *   < 24h  → "Nh ago"
 *   < 7d   → "Nd ago"
 *   < 5w   → "Nw ago"
 *   else   → absolute "Jan 5 2026"
 */
export function formatTimeSince(isoTimestamp: string | undefined | null): string {
  if (!isoTimestamp) return "—";
  const d = new Date(isoTimestamp);
  const ms = Date.now() - d.getTime();
  if (isNaN(ms)) return "—";
  if (ms < 0) return "in the future"; // clock skew safeguard

  const sec = Math.floor(ms / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Absolute ISO-style display (UTC) for tooltips/title attributes. */
export function formatAbsoluteTime(isoTimestamp: string | undefined | null): string {
  if (!isoTimestamp) return "—";
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return isoTimestamp;
  return d.toLocaleString();
}
