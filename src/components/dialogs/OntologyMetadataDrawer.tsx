/**
 * Right-side drawer for editing ontology-level metadata:
 * label, comment, baseUri (read-only), default language, version IRI/info,
 * prefix map, and editorial notes.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import Drawer from "../layout/Drawer";
import LabelEditor from "../forms/LabelEditor";
import { useStore } from "../../lib/store";
import { lookupPrefixNamespace, WELL_KNOWN_PREFIXES } from "../../lib/vocab-autocomplete";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function OntologyMetadataDrawer({ open, onClose }: Props) {
  const ontology = useStore((s) => s.getActiveOntology());
  const updateMetadata = useStore((s) => s.updateMetadata);

  if (!ontology) return null;
  const md = ontology.metadata;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Ontology metadata"
      subtitle={md.ontologyUri || md.baseUri}
    >
      <div className="space-y-4">
        <Field label="Label">
          <input
            type="text"
            value={md.ontologyLabel}
            onChange={(e) => updateMetadata({ ontologyLabel: e.target.value })}
            className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="Comment">
          <textarea
            value={md.ontologyComment}
            onChange={(e) => updateMetadata({ ontologyComment: e.target.value })}
            rows={3}
            className="w-full resize-none rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="Base URI" hint="Used for all new local names. Change in Turtle import only.">
          <input
            type="text"
            value={md.baseUri}
            readOnly
            className="w-full cursor-not-allowed rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg-3"
          />
        </Field>

        <Field label="Ontology URI" hint="The owl:Ontology subject.">
          <input
            type="text"
            value={md.ontologyUri}
            onChange={(e) => updateMetadata({ ontologyUri: e.target.value })}
            className="w-full rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="Default language" hint="Used for new labels you add. Not auto-applied.">
          <input
            type="text"
            value={md.defaultLanguage}
            onChange={(e) => updateMetadata({ defaultLanguage: e.target.value })}
            placeholder="en"
            className="w-16 rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="owl:versionIRI">
          <input
            type="text"
            value={md.versionIRI}
            onChange={(e) => updateMetadata({ versionIRI: e.target.value })}
            placeholder="http://example.org/ontology/1.0"
            className="w-full rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="owl:versionInfo">
          <input
            type="text"
            value={md.versionInfo}
            onChange={(e) => updateMetadata({ versionInfo: e.target.value })}
            placeholder="1.0.0"
            className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>

        <Field label="Editorial notes" hint="Saved as skos:editorialNote on the ontology.">
          <LabelEditor
            values={md.editorialNotes ?? []}
            onChange={(notes) => updateMetadata({ editorialNotes: notes })}
            placeholder="Editorial note"
            multiline
            rows={6}
          />
        </Field>

        <PrefixSection
          prefixes={md.prefixes}
          onChange={(prefixes) => updateMetadata({ prefixes })}
        />
      </div>
    </Drawer>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
        {label}
      </label>
      {hint && <p className="text-2xs text-th-fg-4">{hint}</p>}
      {children}
    </div>
  );
}

function PrefixSection({
  prefixes,
  onChange,
}: {
  prefixes: Record<string, string>;
  onChange: (prefixes: Record<string, string>) => void;
}) {
  const [newPrefix, setNewPrefix] = useState("");
  const [newUri, setNewUri] = useState("");

  const entries = Object.entries(prefixes).sort(([a], [b]) => a.localeCompare(b));

  const update = (prefix: string, uri: string) => {
    onChange({ ...prefixes, [prefix]: uri });
  };

  const remove = (prefix: string) => {
    const next = { ...prefixes };
    delete next[prefix];
    onChange(next);
  };

  const add = () => {
    const p = newPrefix.trim();
    const u = newUri.trim();
    if (!p || !u) return;
    update(p, u);
    setNewPrefix("");
    setNewUri("");
  };

  // Suggest well-known namespaces as the user types a prefix
  const onPrefixInputChange = (val: string) => {
    setNewPrefix(val);
    if (!newUri) {
      const known = lookupPrefixNamespace(val);
      if (known) setNewUri(known);
    }
  };

  const knownPrefixesNotInUse = Object.entries(WELL_KNOWN_PREFIXES)
    .filter(([p]) => !prefixes[p])
    .slice(0, 6);

  return (
    <Field label="Prefixes" hint="Used as @prefix declarations on export.">
      <div className="space-y-1">
        {entries.map(([prefix, uri]) => (
          <div key={prefix} className="flex items-center gap-1">
            <span className="w-16 truncate font-mono text-2xs text-th-fg-3">{prefix}:</span>
            <input
              type="text"
              value={uri}
              onChange={(e) => update(prefix, e.target.value)}
              className="flex-1 rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => remove(prefix)}
              className="rounded p-1 text-th-fg-4 hover:text-red-400"
              title="Remove prefix"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1 pt-1">
          <input
            type="text"
            value={newPrefix}
            onChange={(e) => onPrefixInputChange(e.target.value)}
            placeholder="prefix"
            className="w-16 rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={newUri}
            onChange={(e) => setNewUri(e.target.value)}
            placeholder="http://…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="flex-1 rounded bg-th-input px-2 py-1 font-mono text-2xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={add}
            className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            title="Add prefix"
          >
            <Plus size={12} />
          </button>
        </div>
        {knownPrefixesNotInUse.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-2xs text-th-fg-4">Quick add:</span>
            {knownPrefixesNotInUse.map(([prefix, uri]) => (
              <button
                key={prefix}
                onClick={() => update(prefix, uri)}
                className="rounded bg-th-hover px-1.5 py-0.5 font-mono text-2xs text-th-fg-3 hover:bg-th-border hover:text-th-fg"
                title={uri}
              >
                {prefix}
              </button>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}
