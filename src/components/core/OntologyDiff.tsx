import { useState, useMemo } from "react";
import { useStore } from "../../lib/store";
import { diffOntologies, type DiffStatus } from "../../lib/ontology-diff";
import { compact } from "../../lib/uri-utils";
import type { OntologyClass, OntologyProperty } from "../../types";
import ClassHover from "../hover/ClassHover";

const STATUS_LABEL: Record<DiffStatus, string> = {
  added: "Added",
  removed: "Removed",
  modified: "Modified",
  unchanged: "Unchanged",
};

const STATUS_STYLE: Record<DiffStatus, string> = {
  added: "bg-green-900/40 text-green-400 border-green-700/40",
  removed: "bg-red-900/40 text-red-400 border-red-700/40",
  modified: "bg-yellow-900/40 text-yellow-400 border-yellow-700/40",
  unchanged: "bg-th-surface text-th-fg-4 border-th-border-muted",
};

const BADGE_STYLE: Record<DiffStatus, string> = {
  added: "bg-green-800 text-green-200",
  removed: "bg-red-800 text-red-200",
  modified: "bg-yellow-800 text-yellow-200",
  unchanged: "bg-th-hover text-th-fg-4",
};

function entityLabel(entity: OntologyClass | OntologyProperty | null, prefixes: Record<string, string>): string {
  if (!entity) return "";
  return entity.labels[0]?.value || entity.localName || compact(entity.uri, prefixes);
}

export default function OntologyDiff() {
  const ontologies = useStore((s) => s.ontologies);
  const activeOntologyId = useStore((s) => s.activeOntologyId);

  const [leftId, setLeftId] = useState(activeOntologyId ?? "");
  const [rightId, setRightId] = useState("");
  const [filter, setFilter] = useState<DiffStatus | "all">("all");
  const [merging, setMerging] = useState<Set<string>>(new Set());

  const addClass = useStore((s) => s.addClass);
  const updateClass = useStore((s) => s.updateClass);
  const addProperty = useStore((s) => s.addProperty);
  const updateProperty = useStore((s) => s.updateProperty);
  const setActiveOntology = useStore((s) => s.setActiveOntology);

  const leftOntology = ontologies.find((o) => o.id === leftId) ?? null;
  const rightOntology = ontologies.find((o) => o.id === rightId) ?? null;

  const diff = useMemo(() => {
    if (!leftOntology || !rightOntology) return null;
    return diffOntologies(leftOntology, rightOntology);
  }, [leftOntology, rightOntology]);

  const prefixes = leftOntology?.metadata.prefixes ?? {};

  const applyClass = (uri: string) => {
    if (!diff || !rightOntology) return;
    const entry = diff.classes.find((c) => c.uri === uri);
    if (!entry || !entry.right) return;
    const existing = leftOntology?.classes.find((c) => c.uri === uri);
    setActiveOntology(leftId);
    if (existing) {
      updateClass(existing.id, {
        labels: entry.right.labels,
        descriptions: entry.right.descriptions,
        subClassOf: entry.right.subClassOf,
        disjointWith: entry.right.disjointWith,
        extraTriples: entry.right.extraTriples,
      });
    } else {
      addClass({ ...entry.right });
    }
    setMerging((prev) => new Set([...prev, uri]));
  };

  const applyProperty = (uri: string) => {
    if (!diff || !rightOntology) return;
    const entry = diff.properties.find((p) => p.uri === uri);
    if (!entry || !entry.right) return;
    const existing = leftOntology?.properties.find((p) => p.uri === uri);
    setActiveOntology(leftId);
    if (existing) {
      updateProperty(existing.id, { ...entry.right });
    } else {
      addProperty({ ...entry.right });
    }
    setMerging((prev) => new Set([...prev, uri]));
  };

  const filteredClasses = diff?.classes.filter((c) => filter === "all" || c.status === filter) ?? [];
  const filteredProps = diff?.properties.filter((p) => filter === "all" || p.status === filter) ?? [];

  const counts = diff
    ? {
        added: [...diff.classes, ...diff.properties].filter((e) => e.status === "added").length,
        removed: [...diff.classes, ...diff.properties].filter((e) => e.status === "removed").length,
        modified: [...diff.classes, ...diff.properties].filter((e) => e.status === "modified").length,
        unchanged: [...diff.classes, ...diff.properties].filter((e) => e.status === "unchanged").length,
      }
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-th-border-muted px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-th-fg-3">Base</span>
          <select
            value={leftId}
            onChange={(e) => setLeftId(e.target.value)}
            className="rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— select —</option>
            {ontologies.map((o) => (
              <option key={o.id} value={o.id}>
                {o.metadata.ontologyLabel || o.metadata.baseUri || o.id}
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-th-fg-4">vs</span>
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-th-fg-3">Compare</span>
          <select
            value={rightId}
            onChange={(e) => setRightId(e.target.value)}
            className="rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— select —</option>
            {ontologies.map((o) => (
              <option key={o.id} value={o.id}>
                {o.metadata.ontologyLabel || o.metadata.baseUri || o.id}
              </option>
            ))}
          </select>
        </div>

        {diff && counts && (
          <div className="ml-auto flex items-center gap-1">
            {(["all", "added", "removed", "modified", "unchanged"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2 py-0.5 text-2xs font-medium ${
                  filter === f ? "bg-blue-700 text-white" : "bg-th-hover text-th-fg-3 hover:bg-th-border"
                }`}
              >
                {f === "all"
                  ? `All (${diff.classes.length + diff.properties.length})`
                  : `${STATUS_LABEL[f]} (${counts[f]})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {!leftOntology || !rightOntology ? (
        <div className="flex flex-1 items-center justify-center text-sm text-th-fg-4">
          Select two ontologies to compare
        </div>
      ) : !diff ? null : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Metadata changes */}
          {diff.metaChanges.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-th-fg-3">Metadata</h3>
              <div className="rounded border border-yellow-700/40 bg-yellow-900/20 px-3 py-2 space-y-0.5">
                {diff.metaChanges.map((c, i) => (
                  <p key={i} className="text-2xs text-yellow-300">{c}</p>
                ))}
              </div>
            </section>
          )}

          {/* Classes */}
          {filteredClasses.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-th-fg-3">
                Classes ({filteredClasses.length})
              </h3>
              <div className="space-y-1">
                {filteredClasses.map((entry) => {
                  const label = entityLabel(entry.right ?? entry.left, prefixes);
                  const applied = merging.has(entry.uri);
                  return (
                    <div
                      key={entry.uri}
                      className={`rounded border px-3 py-2 ${STATUS_STYLE[entry.status]}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-2xs font-medium ${BADGE_STYLE[entry.status]}`}>
                          {STATUS_LABEL[entry.status]}
                        </span>
                        <ClassHover uri={entry.uri} ontologyId={entry.right ? rightId : leftId} className="flex-1 text-xs font-medium">{label}</ClassHover>
                        <span className="font-mono text-2xs text-th-fg-4">{compact(entry.uri, prefixes)}</span>
                        {(entry.status === "added" || entry.status === "modified") && !applied && (
                          <button
                            onClick={() => applyClass(entry.uri)}
                            className="rounded bg-blue-700 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-600"
                            title="Apply this version to the base ontology"
                          >
                            Apply →
                          </button>
                        )}
                        {applied && (
                          <span className="text-2xs text-green-400">Applied</span>
                        )}
                      </div>
                      {entry.changes.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-2">
                          {entry.changes.map((c, i) => (
                            <li key={i} className="text-2xs text-th-fg-3">{c}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Properties */}
          {filteredProps.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-th-fg-3">
                Properties ({filteredProps.length})
              </h3>
              <div className="space-y-1">
                {filteredProps.map((entry) => {
                  const label = entityLabel(entry.right ?? entry.left, prefixes);
                  const applied = merging.has(entry.uri);
                  return (
                    <div
                      key={entry.uri}
                      className={`rounded border px-3 py-2 ${STATUS_STYLE[entry.status]}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-2xs font-medium ${BADGE_STYLE[entry.status]}`}>
                          {STATUS_LABEL[entry.status]}
                        </span>
                        <ClassHover uri={entry.uri} ontologyId={entry.right ? rightId : leftId} className="flex-1 text-xs font-medium">{label}</ClassHover>
                        <span className="font-mono text-2xs text-th-fg-4">{compact(entry.uri, prefixes)}</span>
                        {(entry.status === "added" || entry.status === "modified") && !applied && (
                          <button
                            onClick={() => applyProperty(entry.uri)}
                            className="rounded bg-blue-700 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-600"
                            title="Apply this version to the base ontology"
                          >
                            Apply →
                          </button>
                        )}
                        {applied && (
                          <span className="text-2xs text-green-400">Applied</span>
                        )}
                      </div>
                      {entry.changes.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-2">
                          {entry.changes.map((c, i) => (
                            <li key={i} className="text-2xs text-th-fg-3">{c}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {filteredClasses.length === 0 && filteredProps.length === 0 && diff.metaChanges.length === 0 && (
            <div className="flex items-center justify-center py-12 text-sm text-th-fg-4">
              No differences found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
