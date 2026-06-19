/**
 * Inline form for creating or editing an OWL class.
 */

import { useState } from "react";
import { useStore } from "../../lib/store";
import { toPascalCase, compact, expand, buildUri } from "../../lib/uri-utils";
import LabelEditor from "./LabelEditor";
import ExtraTripleEditor from "./ExtraTripleEditor";
import VocabAutocomplete, { type LocalSuggestion } from "./VocabAutocomplete";
import type { OntologyClass, LangString, ExtraTriple } from "../../types";

interface Props {
  /** If provided, we're editing an existing class. Otherwise creating. */
  existing?: OntologyClass;
  onDone: () => void;
}

export default function ClassForm({ existing, onDone }: Props) {
  const addClass = useStore((s) => s.addClass);
  const updateClass = useStore((s) => s.updateClass);
  const activeOntology = useStore((s) => s.ontologies.find(o => o.id === s.activeOntologyId));

  const prefixes = activeOntology?.metadata.prefixes ?? {};
  const baseUri = activeOntology?.metadata.baseUri ?? "";

  const [labels, setLabels] = useState<LangString[]>(
    existing?.labels?.length ? existing.labels : [{ value: "", lang: "" }]
  );
  const [descriptions, setDescriptions] = useState<LangString[]>(
    existing?.descriptions?.length ? existing.descriptions : []
  );
  const [localName, setLocalName] = useState(existing?.localName ?? "");
  const [localNameManual, setLocalNameManual] = useState(!!existing);
  // uriValue: "" means auto-compute from baseUri + localName; non-empty means explicit override
  const [uriValue, setUriValue] = useState(existing?.uri ?? "");
  const [subClassOf, setSubClassOf] = useState<string[]>(existing?.subClassOf ?? []);
  const [disjointWith, setDisjointWith] = useState<string[]>(existing?.disjointWith ?? []);
  // "pills" = current tag-buttons (shown as "Compact"), "dropdown" = searchable select (shown as "List")
  const [classPickerMode, setClassPickerMode] = useState<"pills" | "dropdown">(
    () => {
      const allCls = activeOntology?.classes ?? [];
      const count = existing ? allCls.filter((c) => c.id !== existing.id).length : allCls.length;
      return count > 20 ? "dropdown" : "pills";
    }
  );

  // Extra triples — stored in compact/prefixed form for editing
  const [extraTriples, setExtraTriples] = useState<ExtraTriple[]>(
    (existing?.extraTriples ?? []).map((et) => ({
      ...et,
      predicate: compact(et.predicate, prefixes),
      object: et.isLiteral ? et.object : compact(et.object, prefixes),
    }))
  );

  const allClasses = activeOntology?.classes ?? [];
  // Don't allow a class to be its own parent
  const parentOptions = existing
    ? allClasses.filter((c) => c.id !== existing.id)
    : allClasses;

  const derivedLocalName = localNameManual
    ? localName
    : toPascalCase(labels[0]?.value ?? "");

  const computedUri = buildUri(baseUri, derivedLocalName);
  const effectiveUri = uriValue || computedUri;

  const handleSave = () => {
    const effectiveName = derivedLocalName.trim() || "UnnamedClass";
    const cleanLabels = labels.filter((l) => l.value.trim());
    const cleanDescs = descriptions.filter((d) => d.value.trim());

    // Expand prefixed names back to full URIs
    const expandedTriples = extraTriples
      .filter((t) => t.predicate.trim() && t.object.trim())
      .map((t) => ({
        ...t,
        predicate: expand(t.predicate, prefixes),
        object: t.isLiteral ? t.object : expand(t.object, prefixes),
      }));

    if (existing) {
      updateClass(existing.id, {
        localName: effectiveName,
        uri: uriValue || buildUri(baseUri, effectiveName),
        labels: cleanLabels,
        descriptions: cleanDescs,
        subClassOf,
        disjointWith,
        extraTriples: expandedTriples,
      });
    } else {
      addClass({
        localName: effectiveName,
        uri: uriValue || buildUri(baseUri, effectiveName),
        labels: cleanLabels.length ? cleanLabels : [{ value: effectiveName, lang: "" }],
        descriptions: cleanDescs,
        subClassOf,
        disjointWith,
        extraTriples: expandedTriples,
      });
    }
    onDone();
  };

  const toggleParent = (uri: string) => {
    setSubClassOf((prev) =>
      prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri]
    );
  };

  const toggleDisjoint = (uri: string) => {
    setDisjointWith((prev) =>
      prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri]
    );
  };

  return (
    <div className="space-y-3 rounded border border-th-border bg-th-surface p-3">
      {/* Labels */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Labels
        </label>
        <LabelEditor values={labels} onChange={setLabels} placeholder="Class label" />
      </div>

      {/* Descriptions */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Descriptions
        </label>
        <LabelEditor
          values={descriptions}
          onChange={setDescriptions}
          placeholder="Description"
          multiline
        />
      </div>

      {/* Local name */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Local Name
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={derivedLocalName}
            onChange={(e) => {
              setLocalName(e.target.value);
              setLocalNameManual(true);
            }}
            placeholder="PascalCase"
            className="flex-1 rounded bg-th-input px-2 py-1 font-mono text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {localNameManual && (
            <button
              onClick={() => { setLocalNameManual(false); setLocalName(""); }}
              className="text-2xs text-th-fg-3 hover:text-th-fg"
            >
              auto
            </button>
          )}
        </div>
      </div>

      {/* Full URI */}
      <div>
        <label className="mb-1 flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          URI
          {uriValue && uriValue !== computedUri && (
            <button
              onClick={() => setUriValue("")}
              className="font-normal normal-case text-th-fg-4 hover:text-th-fg"
              title="Reset to auto-computed URI"
            >
              reset
            </button>
          )}
        </label>
        <input
          type="text"
          value={effectiveUri}
          onChange={(e) => setUriValue(e.target.value)}
          className="w-full rounded bg-th-input px-2 py-1 font-mono text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* subClassOf + disjointWith with view toggle */}
      {parentOptions.length > 0 && (
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex items-center justify-between">
            <span className="text-2xs font-medium uppercase tracking-wide text-th-fg-3">Class Relationships</span>
            <div className="flex rounded border border-th-border text-2xs overflow-hidden">
              <button
                onClick={() => setClassPickerMode("pills")}
                className={`px-2 py-0.5 ${classPickerMode === "pills" ? "bg-th-hover text-th-fg" : "text-th-fg-4 hover:text-th-fg-2"}`}
                title="Show as compact toggles"
              >Compact</button>
              <button
                onClick={() => setClassPickerMode("dropdown")}
                className={`px-2 py-0.5 border-l border-th-border ${classPickerMode === "dropdown" ? "bg-th-hover text-th-fg" : "text-th-fg-4 hover:text-th-fg-2"}`}
                title="Show as list"
              >List</button>
            </div>
          </div>

          {/* subClassOf */}
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
              subClassOf
              {subClassOf.length > 0 && (
                <span className="ml-1.5 rounded bg-blue-600/20 px-1.5 text-2xs font-normal text-blue-400">{subClassOf.length}</span>
              )}
            </label>
            {classPickerMode === "pills" ? (
              <div className="flex flex-wrap gap-1">
                {parentOptions.map((cls) => {
                  const selected = subClassOf.includes(cls.uri);
                  return (
                    <button
                      key={cls.id}
                      onClick={() => toggleParent(cls.uri)}
                      className={`rounded px-2 py-0.5 text-2xs ${
                        selected
                          ? "bg-blue-700 text-white"
                          : "bg-th-hover text-th-fg-3 hover:bg-th-border"
                      }`}
                    >
                      {cls.labels[0]?.value || cls.localName}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Selected chips */}
                {subClassOf.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {subClassOf.map((uri) => {
                      const cls = parentOptions.find((c) => c.uri === uri);
                      return (
                        <span key={uri} className="flex items-center gap-1 rounded-full bg-blue-700/30 px-2 py-0.5 text-2xs text-blue-300">
                          {cls?.labels[0]?.value || cls?.localName || uri.split(/[#/]/).pop()}
                          <button onClick={() => toggleParent(uri)} className="opacity-60 hover:opacity-100">×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <VocabAutocomplete
                  value=""
                  onChange={() => { /* per-keystroke noise — ignore */ }}
                  onPick={(val) => {
                    if (val && !subClassOf.includes(val)) toggleParent(val);
                  }}
                  filter={{ kinds: ["class"] }}
                  localEntries={parentOptions
                    .filter((c) => !subClassOf.includes(c.uri))
                    .map((c): LocalSuggestion => ({
                      uri: c.uri,
                      localName: c.localName,
                      label: c.labels[0]?.value ?? c.localName,
                      kind: "class",
                    }))}
                  placeholder="Add parent class (type to search)…"
                />
              </div>
            )}
          </div>

          {/* owl:disjointWith */}
          <div>
            <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
              owl:disjointWith
              {disjointWith.length > 0 && (
                <span className="ml-1.5 rounded bg-red-600/20 px-1.5 text-2xs font-normal text-red-400">{disjointWith.length}</span>
              )}
            </label>
            {classPickerMode === "pills" ? (
              <div className="flex flex-wrap gap-1">
                {parentOptions.map((cls) => {
                  const selected = disjointWith.includes(cls.uri);
                  return (
                    <button
                      key={cls.id}
                      onClick={() => toggleDisjoint(cls.uri)}
                      className={`rounded px-2 py-0.5 text-2xs ${
                        selected
                          ? "bg-red-700 text-white"
                          : "bg-th-hover text-th-fg-3 hover:bg-th-border"
                      }`}
                    >
                      {cls.labels[0]?.value || cls.localName}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1.5">
                {disjointWith.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {disjointWith.map((uri) => {
                      const cls = parentOptions.find((c) => c.uri === uri);
                      return (
                        <span key={uri} className="flex items-center gap-1 rounded-full bg-red-700/30 px-2 py-0.5 text-2xs text-red-300">
                          {cls?.labels[0]?.value || cls?.localName || uri.split(/[#/]/).pop()}
                          <button onClick={() => toggleDisjoint(uri)} className="opacity-60 hover:opacity-100">×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) toggleDisjoint(e.target.value); }}
                  className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">+ Add disjoint class…</option>
                  {parentOptions.filter((c) => !disjointWith.includes(c.uri)).map((cls) => (
                    <option key={cls.id} value={cls.uri}>{cls.labels[0]?.value || cls.localName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Extra triples (prov:wasQuotedFrom, skos:*, etc.) */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Additional Annotations
        </label>
        <ExtraTripleEditor values={extraTriples} onChange={setExtraTriples} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
        >
          {existing ? "Save" : "Create"}
        </button>
        <button
          onClick={onDone}
          className="rounded bg-th-hover px-3 py-1 text-xs text-th-fg-2 hover:bg-th-border"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
