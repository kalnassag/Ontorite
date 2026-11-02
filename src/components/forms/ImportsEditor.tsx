/**
 * Editor for owl:imports on the ontology: a list of ontology IRIs.
 * Accepts full IRIs or prefixed names (expanded with the ontology's prefixes).
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { expand } from "../../lib/uri-utils";

interface Props {
  imports: string[];
  prefixes: Record<string, string>;
  onChange: (imports: string[]) => void;
}

const ABSOLUTE_IRI = /^[a-z][a-z0-9+.-]*:[^\s<>"{}|^`\\]+$/i;

export default function ImportsEditor({ imports, prefixes, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const value = draft.trim().replace(/^<(.*)>$/, "$1");
    if (!value) return;
    const iri = expand(value, prefixes);
    if (!ABSOLUTE_IRI.test(iri)) return setError("Enter an absolute IRI, e.g. http://purl.org/dc/terms/");
    if (imports.includes(iri)) return setError("Already imported");
    onChange([...imports, iri]);
    setDraft("");
  };

  return (
    <div className="space-y-1">
      {imports.map((iri) => (
        <div key={iri} className="group flex items-center gap-1">
          <code className="min-w-0 flex-1 truncate font-mono text-2xs text-th-fg-2" title={iri}>{iri}</code>
          <button
            onClick={() => onChange(imports.filter((i) => i !== iri))}
            className="rounded p-0.5 text-th-fg-4 opacity-0 hover:text-red-400 group-hover:opacity-100"
            title="Remove import"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="http://www.w3.org/ns/prov-o"
          className={`min-w-0 flex-1 rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 ${
            error ? "ring-1 ring-red-500" : "focus:ring-blue-500"
          }`}
        />
        <button onClick={add} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Add import">
          <Plus size={12} />
        </button>
      </div>
      {error && <p className="text-2xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
