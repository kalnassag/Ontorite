/**
 * Inline-editable table for unmapped triples — predicates that the
 * parser could not map to a typed field on a class/property/individual.
 *
 * Mounted at the bottom of the main panel beneath UnassignedProperties.
 * Live cell validation surfaces warnings but never blocks saving.
 */

import { forwardRef, useMemo, useState } from "react";
import { AlertTriangle, Trash2, ArrowRightToLine } from "lucide-react";
import { useStore } from "../../lib/store";
import { compact, expand } from "../../lib/uri-utils";

interface CellProps {
  value: string;
  onCommit: (val: string) => void;
  monospace?: boolean;
  placeholder?: string;
  invalid?: boolean;
  warning?: string;
}

function EditableCell({ value, onCommit, monospace, placeholder, invalid, warning }: CellProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  // Sync external updates when not focused
  if (!focused && draft !== value) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    setDraft(value);
  }
  return (
    <div className="relative">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (draft !== value) onCommit(draft);
        }}
        placeholder={placeholder}
        className={`w-full rounded bg-th-input px-2 py-0.5 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          monospace ? "font-mono" : ""
        } ${invalid ? "ring-1 ring-amber-500/60" : ""}`}
      />
      {invalid && warning && (
        <span
          className="absolute right-1 top-1/2 -translate-y-1/2 text-amber-500"
          title={warning}
        >
          <AlertTriangle size={11} />
        </span>
      )}
    </div>
  );
}

/** Returns a warning string if the value isn't a plausible IRI / prefixed name. */
function validateIriCell(val: string): string | undefined {
  if (!val.trim()) return "Empty IRI";
  if (val.startsWith("_:")) return undefined; // blank node
  // prefixed name (prefix:local) or full IRI
  if (/^[A-Za-z][\w-]*:[^\s]+$/.test(val)) return undefined;
  if (/^https?:\/\//.test(val)) return undefined;
  if (/^[A-Za-z][\w+.-]*:[^\s]+$/.test(val)) return undefined;
  return "Not a recognised IRI or prefixed name";
}

const UnmappedTriplesTable = forwardRef<HTMLDivElement>(function UnmappedTriplesTable(_, ref) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const updateUnmappedTriple = useStore((s) => s.updateUnmappedTriple);
  const deleteUnmappedTriple = useStore((s) => s.deleteUnmappedTriple);
  const promoteUnmappedTriple = useStore((s) => s.promoteUnmappedTriple);
  const [promotingIdx, setPromotingIdx] = useState<number | null>(null);

  const prefixes = activeOntology?.metadata.prefixes ?? {};
  const triples = activeOntology?.unmappedTriples ?? [];

  const rows = useMemo(() => triples.map((t, idx) => ({
    idx,
    triple: t,
    subjectCompact: compact(t.subject, prefixes),
    predicateCompact: compact(t.predicate, prefixes),
    objectCompact: t.isLiteral ? t.object : compact(t.object, prefixes),
    subjectWarning: validateIriCell(t.subject),
    predicateWarning: validateIriCell(t.predicate),
    objectWarning: t.isLiteral ? undefined : validateIriCell(t.object),
  })), [triples, prefixes]);

  if (!activeOntology || triples.length === 0) return null;

  const promotionTargets = (subject: string): Array<{ id: string; label: string; kind: "class" | "property" }> => {
    const matches: Array<{ id: string; label: string; kind: "class" | "property" }> = [];
    const subjectExpanded = expand(subject, prefixes) || subject;
    for (const c of activeOntology.classes) {
      if (c.uri === subjectExpanded) {
        matches.push({ id: c.id, label: c.labels[0]?.value || c.localName, kind: "class" });
      }
    }
    for (const p of activeOntology.properties) {
      if (p.uri === subjectExpanded) {
        matches.push({ id: p.id, label: p.labels[0]?.value || p.localName, kind: "property" });
      }
    }
    // Allow promoting to any entity even if subject doesn't match — sometimes the
    // parser missed a typing triple. Show top 5 by label.
    if (matches.length === 0) {
      for (const c of activeOntology.classes.slice(0, 5)) {
        matches.push({ id: c.id, label: c.labels[0]?.value || c.localName, kind: "class" });
      }
    }
    return matches;
  };

  return (
    <div ref={ref} className="mt-6 rounded border border-amber-900/40 bg-th-surface">
      <div className="border-b border-amber-900/40 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-500">
          <AlertTriangle size={13} />
          Preserved triples ({triples.length})
        </div>
        <p className="mt-0.5 text-2xs text-th-fg-3">
          Triples the parser kept verbatim because they did not map to a typed field. Edit in place, delete, or promote into an entity&apos;s extra triples.
        </p>
      </div>

      <div className="px-3 py-2">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-1 text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          <div>Subject</div>
          <div>Predicate</div>
          <div>Object</div>
          <div className="w-12 text-center">Type</div>
          <div className="w-12 text-center">Lang</div>
          <div className="w-16 text-center">Actions</div>
        </div>

        <div className="mt-1 space-y-1">
          {rows.map(({ idx, triple, subjectCompact, predicateCompact, objectCompact, subjectWarning, predicateWarning, objectWarning }) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] items-start gap-1">
              <EditableCell
                value={subjectCompact}
                onCommit={(val) => updateUnmappedTriple(idx, { subject: expand(val, prefixes) || val })}
                monospace
                invalid={!!subjectWarning}
                warning={subjectWarning}
              />
              <EditableCell
                value={predicateCompact}
                onCommit={(val) => updateUnmappedTriple(idx, { predicate: expand(val, prefixes) || val })}
                monospace
                invalid={!!predicateWarning}
                warning={predicateWarning}
              />
              <EditableCell
                value={objectCompact}
                onCommit={(val) =>
                  updateUnmappedTriple(idx, {
                    object: triple.isLiteral ? val : expand(val, prefixes) || val,
                  })
                }
                monospace={!triple.isLiteral}
                invalid={!!objectWarning}
                warning={objectWarning}
              />
              {/* Literal / URI toggle */}
              <button
                onClick={() => updateUnmappedTriple(idx, { isLiteral: !triple.isLiteral })}
                className={`w-12 rounded px-1 py-0.5 text-2xs font-medium ${
                  triple.isLiteral ? "bg-green-100 text-green-800 dark:bg-green-600/20 dark:text-green-500" : "bg-blue-100 text-blue-800 dark:bg-blue-600/20 dark:text-blue-400"
                }`}
                title={triple.isLiteral ? "Literal — click for URI" : "URI — click for literal"}
              >
                {triple.isLiteral ? "Lit" : "URI"}
              </button>
              {/* Lang tag */}
              <input
                type="text"
                value={triple.lang ?? ""}
                onChange={(e) => updateUnmappedTriple(idx, { lang: e.target.value || undefined })}
                disabled={!triple.isLiteral}
                placeholder={triple.isLiteral ? "lang" : ""}
                className="w-12 rounded bg-th-input px-1 py-0.5 text-2xs text-th-fg-3 placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-30"
              />
              {/* Row actions */}
              <div className="flex w-16 items-center justify-end gap-0.5">
                <button
                  onClick={() => setPromotingIdx((p) => (p === idx ? null : idx))}
                  className="rounded p-1 text-th-fg-4 hover:text-blue-400"
                  title="Promote into an entity"
                >
                  <ArrowRightToLine size={11} />
                </button>
                <button
                  onClick={() => deleteUnmappedTriple(idx)}
                  className="rounded p-1 text-th-fg-4 hover:text-red-400"
                  title="Delete triple"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              {promotingIdx === idx && (
                <div className="col-span-6 mt-0.5 rounded border border-th-border-muted bg-th-base px-2 py-1.5 text-2xs">
                  <span className="text-th-fg-3">Move to:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {promotionTargets(triple.subject).map((target) => (
                      <button
                        key={target.id}
                        onClick={() => {
                          promoteUnmappedTriple(idx, target.id);
                          setPromotingIdx(null);
                        }}
                        className="rounded bg-th-hover px-2 py-0.5 text-2xs text-th-fg-2 hover:bg-th-border"
                      >
                        {target.label}
                        <span className="ml-1 text-th-fg-4">({target.kind})</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setPromotingIdx(null)}
                      className="ml-auto text-th-fg-4 hover:text-th-fg-2"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default UnmappedTriplesTable;
