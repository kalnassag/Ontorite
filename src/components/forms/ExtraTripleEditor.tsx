/**
 * Reusable editor for extra triples (arbitrary predicate-object pairs).
 * Same array-of-rows pattern as LabelEditor. Users type prefixed names
 * (e.g., prov:wasQuotedFrom) — expansion to full URIs happens in the
 * parent form's handleSave.
 */

import { Plus, X } from "lucide-react";
import VocabAutocomplete from "./VocabAutocomplete";
import type { ExtraTriple } from "../../types";

interface Props {
  values: ExtraTriple[];
  onChange: (values: ExtraTriple[]) => void;
}

export default function ExtraTripleEditor({ values, onChange }: Props) {
  const update = (index: number, patch: Partial<ExtraTriple>) => {
    onChange(values.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const remove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...values, { predicate: "", object: "", isLiteral: false }]);
  };

  return (
    <div className="space-y-1">
      {values.map((entry, i) => (
        <div key={i} className="flex items-start gap-1">
          {/* Predicate (autocompletes against well-known vocabulary properties) */}
          <div className="w-40">
            <VocabAutocomplete
              value={entry.predicate}
              onChange={(val) => update(i, { predicate: val })}
              filter={{ kinds: ["property"] }}
              placeholder="prov:wasQuotedFrom"
              outputAs="compact"
              className="font-mono"
            />
          </div>
          {/* Object */}
          <input
            type="text"
            value={entry.object}
            onChange={(e) => update(i, { object: e.target.value })}
            placeholder={entry.isLiteral ? "literal value" : ":LocalName"}
            className="flex-1 rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {/* URI / Lit toggle */}
          <button
            type="button"
            onClick={() => update(i, { isLiteral: !entry.isLiteral, lang: entry.isLiteral ? undefined : entry.lang })}
            className={`flex-shrink-0 rounded px-1.5 py-1 text-2xs font-medium ${
              entry.isLiteral
                ? "bg-green-600/20 text-green-500"
                : "bg-blue-600/20 text-blue-400"
            }`}
            title={entry.isLiteral ? "Literal value — click for URI" : "URI reference — click for literal"}
          >
            {entry.isLiteral ? "Lit" : "URI"}
          </button>
          {/* Lang tag (only for literals) */}
          {entry.isLiteral && (
            <input
              type="text"
              value={entry.lang ?? ""}
              onChange={(e) => update(i, { lang: e.target.value })}
              placeholder="lang"
              className="w-12 rounded bg-th-input px-2 py-1 text-xs text-th-fg-3 placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
          {/* Remove */}
          <button
            onClick={() => remove(i)}
            className="mt-0.5 flex-shrink-0 rounded p-1 text-th-fg-4 hover:text-red-400"
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1 text-2xs text-th-fg-3 hover:text-th-fg"
      >
        <Plus size={11} />
        Add
      </button>
    </div>
  );
}
