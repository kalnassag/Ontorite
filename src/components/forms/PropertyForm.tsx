/**
 * Inline form for creating or editing an OWL property.
 */

import { useState } from "react";
import { useStore } from "../../lib/store";
import { toCamelCase, XSD_TYPES, compact, expand, buildUri } from "../../lib/uri-utils";
import LabelEditor from "./LabelEditor";
import ExtraTripleEditor from "./ExtraTripleEditor";
import VocabAutocomplete, { type LocalSuggestion } from "./VocabAutocomplete";
import { classExprFormat } from "../../types";
import type { OntologyProperty, LangString, PropertyType, ExtraTriple, ClassExpression } from "../../types";

interface Props {
  existing?: OntologyProperty;
  /** Pre-set domain URI when opened from within a ClassCard */
  defaultDomainUri?: string;
  onDone: () => void;
}

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "owl:ObjectProperty", label: "Object" },
  { value: "owl:DatatypeProperty", label: "Datatype" },
  { value: "owl:AnnotationProperty", label: "Annotation" },
];

export default function PropertyForm({ existing, defaultDomainUri, onDone }: Props) {
  const addProperty = useStore((s) => s.addProperty);
  const updateProperty = useStore((s) => s.updateProperty);
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
  const [propType, setPropType] = useState<PropertyType>(
    existing?.type ?? "owl:DatatypeProperty"
  );
  // Domain — internally a list of URIs. 1 entry = single class; 2+ = union.
  const initialDomainUris: string[] = (() => {
    if (existing) {
      if (existing.domain.kind === "class") return existing.domain.uri ? [existing.domain.uri] : [];
      return [...existing.domain.uris];
    }
    return defaultDomainUri ? [defaultDomainUri] : [];
  })();
  const [domainUris, setDomainUris] = useState<string[]>(initialDomainUris);
  const [ranges, setRanges] = useState<ClassExpression[]>(existing?.ranges ?? []);
  const [rangeInput, setRangeInput] = useState(""); // for annotation free-text input
  const [subPropertyOf, setSubPropertyOf] = useState<string[]>(existing?.subPropertyOf ?? []);
  // "pills" = current tag-buttons (shown as "Compact"), "dropdown" = searchable select (shown as "List")
  const [propPickerMode, setPropPickerMode] = useState<"pills" | "dropdown">(
    () => {
      const allProps = activeOntology?.properties ?? [];
      const count = allProps.filter(
        (p) => p.type === (existing?.type ?? "owl:DatatypeProperty") && (!existing || p.id !== existing.id)
      ).length;
      return count > 20 ? "dropdown" : "pills";
    }
  );
  const [inverseOf, setInverseOf] = useState(existing?.inverseOf ?? "");
  const [minCard, setMinCard] = useState(existing?.minCardinality !== undefined ? String(existing.minCardinality) : "");
  const [maxCard, setMaxCard] = useState(existing?.maxCardinality !== undefined ? String(existing.maxCardinality) : "");
  const [exactCard, setExactCard] = useState(existing?.exactCardinality !== undefined ? String(existing.exactCardinality) : "");

  // Extra triples — stored in compact/prefixed form for editing
  const [extraTriples, setExtraTriples] = useState<ExtraTriple[]>(
    (existing?.extraTriples ?? []).map((et) => ({
      ...et,
      predicate: compact(et.predicate, prefixes),
      object: et.isLiteral ? et.object : compact(et.object, prefixes),
    }))
  );

  const allClasses = activeOntology?.classes ?? [];
  const allProperties = activeOntology?.properties ?? [];
  const sameTypeProps = allProperties.filter(
    (p) => p.type === propType && (!existing || p.id !== existing.id)
  );

  // Range helpers — each entry is a ClassExpression so unions imported from
  // TTL preserve their semantics. The form lets users add single-class entries;
  // existing union entries are shown as a single chip ("A ∪ B") that can be
  // removed wholesale.
  const rangeKey = (r: ClassExpression): string =>
    r.kind === "class" ? `c:${r.uri}` : `u:${[...r.uris].sort().join("|")}`;
  const formatRangeChip = (r: ClassExpression): string => {
    const friendly = (u: string) => {
      const cls = allClasses.find((c) => c.uri === u);
      if (cls) return cls.labels[0]?.value || cls.localName;
      const xsd = Object.entries(XSD_TYPES).find(([, v]) => v === u)?.[0];
      if (xsd) return xsd;
      return u.split(/[#/]/).pop() || u;
    };
    return classExprFormat(r, friendly);
  };
  const rangeHasUri = (uri: string): boolean =>
    ranges.some((r) => r.kind === "class" ? r.uri === uri : r.uris.includes(uri));
  const addSingleRange = (uri: string) => {
    const v = uri.trim();
    if (!v || rangeHasUri(v)) return;
    setRanges((prev) => [...prev, { kind: "class", uri: v }]);
    setRangeInput("");
  };
  const removeRangeEntry = (target: ClassExpression) => {
    const k = rangeKey(target);
    setRanges((prev) => prev.filter((r) => rangeKey(r) !== k));
  };

  const derivedLocalName = localNameManual
    ? localName
    : toCamelCase(labels[0]?.value ?? "");

  const computedUri = buildUri(baseUri, derivedLocalName);
  const effectiveUri = uriValue || computedUri;

  const handleSave = () => {
    const effectiveName = derivedLocalName.trim() || "unnamedProperty";
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

    const parseCard = (s: string) => { const n = parseInt(s, 10); return isNaN(n) ? undefined : n; };
    const exactCardVal = parseCard(exactCard);

    const domain: ClassExpression = domainUris.length === 0
      ? { kind: "class", uri: "" }
      : domainUris.length === 1
        ? { kind: "class", uri: domainUris[0]! }
        : { kind: "union", uris: domainUris };

    const data: Partial<OntologyProperty> = {
      localName: effectiveName,
      uri: uriValue || buildUri(baseUri, effectiveName),
      type: propType,
      labels: cleanLabels.length ? cleanLabels : [{ value: effectiveName, lang: "" }],
      descriptions: cleanDescs,
      domain,
      ranges,
      subPropertyOf,
      inverseOf: inverseOf || undefined,
      exactCardinality: exactCardVal,
      minCardinality: exactCardVal !== undefined ? undefined : parseCard(minCard),
      maxCardinality: exactCardVal !== undefined ? undefined : parseCard(maxCard),
      extraTriples: expandedTriples,
    };

    if (existing) {
      updateProperty(existing.id, data);
    } else {
      addProperty(data);
    }
    onDone();
  };

  const toggleSubPropOf = (uri: string) => {
    setSubPropertyOf((prev) =>
      prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri]
    );
  };

  return (
    <div className="space-y-3 rounded border border-th-border bg-th-surface p-3">
      {/* Property type */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Type
        </label>
        <div className="flex gap-1">
          {PROPERTY_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPropType(value)}
              className={`rounded px-2 py-0.5 text-2xs font-medium ${
                propType === value
                  ? value === "owl:ObjectProperty"
                    ? "bg-prop-object-600 text-white"
                    : value === "owl:DatatypeProperty"
                    ? "bg-prop-datatype-600 text-white"
                    : "bg-prop-annotation-600 text-white"
                  : "bg-th-hover text-th-fg-3 hover:bg-th-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Labels */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Labels
        </label>
        <LabelEditor values={labels} onChange={setLabels} placeholder="Property label" />
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
            onChange={(e) => { setLocalName(e.target.value); setLocalNameManual(true); }}
            placeholder="camelCase"
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

      {/* Domain — single class or owl:unionOf when 2+ chips */}
      <div>
        <label className="mb-1 flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Domain
          {domainUris.length > 1 && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 font-normal normal-case text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
              owl:unionOf of {domainUris.length} classes
            </span>
          )}
        </label>
        <div className="space-y-1.5">
          {domainUris.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {domainUris.map((uri) => {
                const cls = allClasses.find((c) => c.uri === uri);
                const label = cls?.labels[0]?.value || cls?.localName || uri.split(/[#/]/).pop();
                return (
                  <span
                    key={uri}
                    className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-2xs text-blue-800 dark:bg-blue-700/30 dark:text-blue-300"
                  >
                    {label}
                    <button
                      onClick={() => setDomainUris((prev) => prev.filter((u) => u !== uri))}
                      className="opacity-60 hover:opacity-100"
                      title="Remove"
                    >×</button>
                  </span>
                );
              })}
            </div>
          )}
          <VocabAutocomplete
            value=""
            onChange={() => { /* per-keystroke noise — ignore */ }}
            onPick={(val) => {
              const v = val.trim();
              if (v && !domainUris.includes(v)) setDomainUris((prev) => [...prev, v]);
            }}
            filter={{ kinds: ["class"] }}
            localEntries={allClasses
              .filter((c) => !domainUris.includes(c.uri))
              .map((c): LocalSuggestion => ({
                uri: c.uri,
                localName: c.localName,
                label: c.labels[0]?.value ?? c.localName,
                kind: "class",
              }))}
            placeholder={domainUris.length === 0 ? "Pick a domain class (type to search)…" : "+ Add another class (creates a union)…"}
          />
        </div>
      </div>

      {/* Range — multi-select */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Range
          {ranges.length > 0 && (
            <span className="ml-1.5 rounded bg-blue-100 px-1.5 text-2xs font-normal text-blue-700 dark:bg-blue-600/20 dark:text-blue-400">
              {ranges.length} selected
            </span>
          )}
        </label>

        {propType === "owl:ObjectProperty" ? (
          <div className="space-y-1.5">
            {ranges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ranges.map((r) => (
                  <span
                    key={rangeKey(r)}
                    className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-2xs text-blue-800 dark:bg-blue-700/30 dark:text-blue-300"
                    title={r.kind === "union" ? `owl:unionOf (${r.uris.length} classes)` : undefined}
                  >
                    {formatRangeChip(r)}
                    <button
                      onClick={() => removeRangeEntry(r)}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                      title="Remove"
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            <VocabAutocomplete
              value={rangeInput}
              onChange={setRangeInput}
              onPick={addSingleRange}
              filter={{ kinds: ["class"] }}
              localEntries={allClasses
                .filter((c) => !rangeHasUri(c.uri))
                .map((c): LocalSuggestion => ({
                  uri: c.uri,
                  localName: c.localName,
                  label: c.labels[0]?.value ?? c.localName,
                  kind: "class",
                }))}
              placeholder="Add class range (type to search)…"
            />
          </div>
        ) : propType === "owl:DatatypeProperty" ? (
          <div className="space-y-1.5">
            {ranges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ranges.map((r) => (
                  <span
                    key={rangeKey(r)}
                    className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-2xs text-emerald-800 dark:bg-emerald-700/30 dark:text-emerald-300"
                  >
                    {formatRangeChip(r)}
                    <button
                      onClick={() => removeRangeEntry(r)}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                      title="Remove"
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            <VocabAutocomplete
              value={rangeInput}
              onChange={setRangeInput}
              onPick={addSingleRange}
              filter={{ kinds: ["datatype"] }}
              placeholder="Add XSD type (type to search)…"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            {ranges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ranges.map((r) => (
                  <span
                    key={rangeKey(r)}
                    className="flex items-center gap-1 rounded-full bg-th-border px-2 py-0.5 text-2xs text-th-fg-3"
                  >
                    {formatRangeChip(r)}
                    <button
                      onClick={() => removeRangeEntry(r)}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            <VocabAutocomplete
              value={rangeInput}
              onChange={setRangeInput}
              onPick={addSingleRange}
              localEntries={allClasses.map((c): LocalSuggestion => ({
                uri: c.uri,
                localName: c.localName,
                label: c.labels[0]?.value ?? c.localName,
                kind: "class",
              }))}
              placeholder="URI or free text, press Enter to add"
            />
          </div>
        )}
      </div>

      {/* subPropertyOf */}
      {sameTypeProps.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-2xs font-medium uppercase tracking-wide text-th-fg-3">
              subPropertyOf
              {subPropertyOf.length > 0 && (
                <span className="ml-1.5 rounded bg-blue-100 px-1.5 text-2xs font-normal text-blue-700 dark:bg-blue-600/20 dark:text-blue-400">{subPropertyOf.length}</span>
              )}
            </label>
            <div className="flex overflow-hidden rounded border border-th-border text-2xs">
              <button
                onClick={() => setPropPickerMode("pills")}
                className={`px-2 py-0.5 ${propPickerMode === "pills" ? "bg-th-hover text-th-fg" : "text-th-fg-4 hover:text-th-fg-2"}`}
              >Compact</button>
              <button
                onClick={() => setPropPickerMode("dropdown")}
                className={`border-l border-th-border px-2 py-0.5 ${propPickerMode === "dropdown" ? "bg-th-hover text-th-fg" : "text-th-fg-4 hover:text-th-fg-2"}`}
              >List</button>
            </div>
          </div>

          {propPickerMode === "pills" ? (
            <div className="flex flex-wrap gap-1">
              {sameTypeProps.map((prop) => {
                const selected = subPropertyOf.includes(prop.uri);
                return (
                  <button
                    key={prop.id}
                    onClick={() => toggleSubPropOf(prop.uri)}
                    className={`rounded px-2 py-0.5 text-2xs ${
                      selected
                        ? "bg-blue-600 text-white"
                        : "bg-th-hover text-th-fg-3 hover:bg-th-border"
                    }`}
                  >
                    {prop.labels[0]?.value || prop.localName}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {subPropertyOf.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {subPropertyOf.map((uri) => {
                    const p = sameTypeProps.find((sp) => sp.uri === uri);
                    return (
                      <span key={uri} className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-2xs text-blue-800 dark:bg-blue-700/30 dark:text-blue-300">
                        {p?.labels[0]?.value || p?.localName || uri.split(/[#/]/).pop()}
                        <button onClick={() => toggleSubPropOf(uri)} className="opacity-60 hover:opacity-100">×</button>
                      </span>
                    );
                  })}
                </div>
              )}
              <select
                value=""
                onChange={(e) => { if (e.target.value) toggleSubPropOf(e.target.value); }}
                className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">+ Add parent property…</option>
                {sameTypeProps
                  .filter((p) => !subPropertyOf.includes(p.uri))
                  .map((p) => (
                    <option key={p.id} value={p.uri}>{p.labels[0]?.value || p.localName}</option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* owl:inverseOf — ObjectProperty only */}
      {propType === "owl:ObjectProperty" && (
        <div>
          <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
            owl:inverseOf
          </label>
          <select
            value={inverseOf}
            onChange={(e) => setInverseOf(e.target.value)}
            className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">(none)</option>
            {allProperties
              .filter((p) => p.type === "owl:ObjectProperty" && p.id !== existing?.id)
              .map((p) => (
                <option key={p.id} value={p.uri}>
                  {p.labels[0]?.value || p.localName}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Cardinality */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Cardinality
        </label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-2xs text-th-fg-3">Exact</span>
            <input
              type="number"
              min="0"
              value={exactCard}
              onChange={(e) => { setExactCard(e.target.value); if (e.target.value) { setMinCard(""); setMaxCard(""); } }}
              placeholder="—"
              className="w-14 rounded bg-th-input px-2 py-0.5 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {!exactCard && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-2xs text-th-fg-3">Min</span>
                <input
                  type="number"
                  min="0"
                  value={minCard}
                  onChange={(e) => setMinCard(e.target.value)}
                  placeholder="—"
                  className="w-14 rounded bg-th-input px-2 py-0.5 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-2xs text-th-fg-3">Max</span>
                <input
                  type="number"
                  min="0"
                  value={maxCard}
                  onChange={(e) => setMaxCard(e.target.value)}
                  placeholder="—"
                  className="w-14 rounded bg-th-input px-2 py-0.5 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          )}
        </div>
        <p className="mt-0.5 text-2xs text-th-fg-4">Simplified constraints — not OWL 2 restriction blank nodes</p>
      </div>

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
