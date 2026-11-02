/**
 * Statements whose subject isn't a class, property or individual of this
 * ontology (untyped or external IRIs, top-level blank-node axioms such as
 * owl:AllDisjointClasses, blank nodes shared between statements).
 *
 * Shown grouped by subject as the exact Turtle that's exported. Each block is
 * edited as Turtle; statements typed here about an existing entity or the
 * ontology itself are moved to that entity automatically.
 */

import { forwardRef, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { PropertyType, UnmappedTriple } from "../../types";
import { useStore, selectActiveOntology } from "../../lib/store";
import { formatOtherStatements } from "../../lib/turtle-format";
import { parseStatements } from "../../lib/turtle-snippets";
import { isBlankNode } from "../../lib/vocab";
import { SnippetEditor } from "./TurtleStatementList";

const DECLARE_AS: Array<{ kind: "class" | PropertyType; label: string }> = [
  { kind: "class", label: "Class" },
  { kind: "owl:ObjectProperty", label: "Object prop." },
  { kind: "owl:DatatypeProperty", label: "Datatype prop." },
  { kind: "owl:AnnotationProperty", label: "Annotation prop." },
];

const OtherStatements = forwardRef<HTMLDivElement>(function OtherStatements(_, ref) {
  const ontology = useStore(selectActiveOntology);
  const replaceOtherStatements = useStore((s) => s.replaceOtherStatements);
  const declareEntity = useStore((s) => s.declareEntity);
  const [editing, setEditing] = useState<string | null>(null); // group root, or "new"

  const groups = useMemo(() => (ontology ? formatOtherStatements(ontology) : []), [ontology]);
  if (!ontology) return null;
  const prefixes = ontology.metadata.prefixes;

  const save = (oldTriples: UnmappedTriple[], text: string): string | null => {
    const parsed = parseStatements(text, prefixes);
    if (!parsed.ok) return parsed.error;
    replaceOtherStatements(oldTriples, parsed.value);
    setEditing(null);
    return null;
  };

  return (
    <div ref={ref} className="mt-6 rounded border border-th-border-muted bg-th-surface">
      <div className="flex items-center gap-2 border-b border-th-border-muted px-3 py-1.5">
        <span className="text-xs font-medium text-th-fg-2">Other statements</span>
        <span className="text-2xs text-th-fg-4">({groups.length})</span>
        {editing === null && (
          <button
            onClick={() => setEditing("new")}
            className="ml-auto flex items-center gap-0.5 text-2xs text-th-fg-3 hover:text-blue-400"
            title="Add statements as Turtle"
          >
            <Plus size={11} /> Add
          </button>
        )}
      </div>
      <p className="px-3 pt-1 text-2xs text-th-fg-4">
        Statements about subjects that aren&apos;t classes, properties or individuals here — kept and exported exactly as shown.
        Statements about an existing entity or the ontology itself are moved there when saved.
      </p>

      <div className="divide-y divide-th-border-muted">
        {groups.map((group) => {
          const declarable = !isBlankNode(group.root) && group.root !== ontology.metadata.ontologyUri;
          return (
            <div key={group.root} className="group/blk px-3 py-1.5">
              {editing === group.root ? (
                <SnippetEditor
                  initial={group.lines.join("\n")}
                  onSave={(text) => save(group.triples, text)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex items-start gap-2">
                  <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-2xs leading-relaxed text-th-fg-2">
                    {group.lines.join("\n")}
                  </pre>
                  <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 group-hover/blk:opacity-100 focus-within:opacity-100">
                    {declarable && (
                      <select
                        value=""
                        onChange={(e) => {
                          const kind = e.target.value as "class" | PropertyType;
                          if (kind) declareEntity(group.root, group.triples, kind);
                        }}
                        className="rounded bg-th-input px-1 py-0.5 text-2xs text-th-fg-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        title="Declare this subject as a class or property of this ontology"
                      >
                        <option value="">Declare as…</option>
                        {DECLARE_AS.map((d) => <option key={d.kind} value={d.kind}>{d.label}</option>)}
                      </select>
                    )}
                    <button onClick={() => setEditing(group.root)} className="rounded p-1 text-th-fg-4 hover:text-th-fg-2" title="Edit as Turtle">
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => replaceOtherStatements(group.triples, [])} className="rounded p-1 text-th-fg-4 hover:text-red-400" title="Delete these statements">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {editing === "new" && (
          <div className="px-3 py-1.5">
            <SnippetEditor
              initial=""
              placeholder={"[] a owl:AllDisjointClasses ;\n    owl:members ( :A :B :C ) ."}
              onSave={(text) => save([], text)}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default OtherStatements;
