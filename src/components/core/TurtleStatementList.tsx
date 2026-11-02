/**
 * An entity's statements that have no typed field ("Other axioms"), shown as
 * the exact Turtle that's exported, e.g.
 *   rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:qualifiedCardinality 2 ; owl:onClass :C ]
 *
 * Each statement is edited as one Turtle snippet, so a blank-node structure is
 * replaced as a whole and can never be left half-edited.
 */

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import type { ExtraTriple } from "../../types";
import { useActivePrefixes } from "../../lib/store-hooks";
import { formatExtraTriple } from "../../lib/turtle-format";
import { parsePredicateObjectList } from "../../lib/turtle-snippets";

interface Props {
  extras: ExtraTriple[];
  onChange: (extras: ExtraTriple[]) => void;
  /** Entries to leave out of the list (e.g. property characteristics shown as badges) */
  hide?: (et: ExtraTriple) => boolean;
  title?: string;
  /** Show the "+ Add" control */
  allowAdd?: boolean;
}

/** Index of the statement being edited, or "new" for the add box. */
type EditTarget = number | "new" | null;

export default function TurtleStatementList({ extras, onChange, hide, title = "Other axioms", allowAdd = true }: Props) {
  const prefixes = useActivePrefixes();
  const [editing, setEditing] = useState<EditTarget>(null);
  const visible = extras.map((et, index) => ({ et, index })).filter(({ et }) => !hide?.(et));
  if (visible.length === 0 && !allowAdd) return null;
  // Nothing to show: just a quiet add link (no empty section header)
  if (visible.length === 0 && editing === null) {
    return (
      <div className="px-3 pt-1">
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1 text-2xs text-th-fg-4 hover:text-blue-400"
          title="Add statements about this entity as Turtle"
        >
          <Plus size={11} /> Add axiom
        </button>
      </div>
    );
  }

  /** Replace the statement at `index` (or append when "new") with zero or more statements. */
  const replace = (target: EditTarget, next: ExtraTriple[]) => {
    if (target === "new") onChange([...extras, ...next]);
    else if (typeof target === "number") onChange([...extras.slice(0, target), ...next, ...extras.slice(target + 1)]);
    setEditing(null);
  };

  return (
    <div className="px-3 pb-1 pt-1.5">
      <div className="flex items-center gap-2 pb-0.5 text-2xs font-medium uppercase tracking-wide text-th-fg-3">
        {title}
        {allowAdd && editing === null && (
          <button
            onClick={() => setEditing("new")}
            className="flex items-center gap-0.5 normal-case tracking-normal text-th-fg-4 hover:text-blue-400"
            title="Add statements as Turtle"
          >
            <Plus size={10} /> Add
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {visible.map(({ et, index }) =>
          editing === index ? (
            <li key={index}>
              <SnippetEditor
                initial={formatExtraTriple(et, prefixes)}
                onSave={(text) => {
                  const result = parsePredicateObjectList(text, prefixes);
                  if (result.ok) replace(index, result.value);
                  return result.ok ? null : result.error;
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={index} className="group/stmt flex items-start gap-1">
              <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-2xs text-th-fg-2">
                {formatExtraTriple(et, prefixes)}
              </code>
              <button
                onClick={() => setEditing(index)}
                className="rounded p-0.5 text-th-fg-4 opacity-0 hover:text-th-fg-2 group-hover/stmt:opacity-100"
                title="Edit as Turtle"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => replace(index, [])}
                className="rounded p-0.5 text-th-fg-4 opacity-0 hover:text-red-400 group-hover/stmt:opacity-100"
                title="Delete statement"
              >
                <X size={10} />
              </button>
            </li>
          ),
        )}
        {editing === "new" && (
          <li>
            <SnippetEditor
              initial=""
              placeholder={'rdfs:seeAlso <https://example.org/doc> ;\nowl:equivalentClass [ a owl:Class ; owl:intersectionOf ( :A :B ) ]'}
              onSave={(text) => {
                const result = parsePredicateObjectList(text, prefixes);
                if (result.ok) replace("new", result.value);
                return result.ok ? null : result.error;
              }}
              onCancel={() => setEditing(null)}
            />
          </li>
        )}
      </ul>
    </div>
  );
}

interface EditorProps {
  initial: string;
  placeholder?: string;
  /** Returns an error message, or null when saved */
  onSave: (text: string) => string | null;
  onCancel: () => void;
}

/** Turtle textarea: Ctrl/⌘+Enter saves, Escape cancels; parse errors shown inline. */
export function SnippetEditor({ initial, placeholder, onSave, onCancel }: EditorProps) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const save = () => setError(onSave(text));
  return (
    <div className="space-y-1 py-0.5">
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
        }}
        placeholder={placeholder}
        rows={Math.min(12, Math.max(2, text.split("\n").length + 1))}
        spellCheck={false}
        autoFocus
        className={`w-full resize-y rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 ${
          error ? "ring-1 ring-red-500 focus:ring-red-500" : "focus:ring-blue-500"
        }`}
      />
      {error && <p className="text-2xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-1.5">
        <button onClick={save} className="rounded bg-blue-600 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-500">
          Save
        </button>
        <button onClick={onCancel} className="rounded bg-th-hover px-2 py-0.5 text-2xs text-th-fg-2 hover:bg-th-border">
          Cancel
        </button>
        <span className="text-2xs text-th-fg-4">Turtle · Ctrl+Enter to save · Esc to cancel</span>
      </div>
    </div>
  );
}
