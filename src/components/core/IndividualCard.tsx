/**
 * Expandable card for a single individual (instance).
 * Shows the individual's types, then all its property values nested underneath,
 * grouped by the class schema.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Pencil, Check, X, Trash2, Plus, StickyNote } from "lucide-react";
import { useStore } from "../../lib/store";
import { compact, buildUri, toCamelCase } from "../../lib/uri-utils";
import EditorialNotesDrawer from "../dialogs/EditorialNotesDrawer";
import TimestampFooter from "./TimestampFooter";
import type { Individual, IndividualPropertyValue, OntologyProperty } from "../../types";

interface Props {
  individual: Individual;
  defaultExpanded?: boolean;
}

export default function IndividualCard({ individual, defaultExpanded = false }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const updateIndividual = useStore((s) => s.updateIndividual);
  const deleteIndividual = useStore((s) => s.deleteIndividual);
  const updateIndividualProperty = useStore((s) => s.updateIndividualProperty);
  const removeIndividualProperty = useStore((s) => s.removeIndividualProperty);
  const addIndividualProperty = useStore((s) => s.addIndividualProperty);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editName, setEditName] = useState(individual.localName);
  const [editUri, setEditUri] = useState(individual.uri);
  const [editTypes, setEditTypes] = useState<string[]>(individual.typeUris);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newPropUri, setNewPropUri] = useState("");
  const [newPropValue, setNewPropValue] = useState("");
  const [newPropIsLiteral, setNewPropIsLiteral] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  const noteCount = (individual.editorialNotes ?? []).filter((n) => n.value).length;

  const prefixes = activeOntology?.metadata.prefixes ?? {};
  const baseUri = activeOntology?.metadata.baseUri ?? "";
  const allClasses = activeOntology?.classes ?? [];
  const allProperties = activeOntology?.properties ?? [];
  const individuals = activeOntology?.individuals ?? [];

  const c = (uri: string) => compact(uri, prefixes);

  const openMeta = () => {
    setEditName(individual.localName);
    setEditUri(individual.uri);
    setEditTypes([...individual.typeUris]);
    setEditingMeta(true);
    setExpanded(true);
  };

  const saveMeta = () => {
    const name = editName.trim() || individual.localName;
    updateIndividual(individual.id, {
      localName: name,
      uri: editUri.trim() || buildUri(baseUri, name),
      typeUris: editTypes.filter(Boolean),
    });
    setEditingMeta(false);
  };

  const toggleType = (uri: string) =>
    setEditTypes((prev) => prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri]);

  const typeLabels = individual.typeUris.map((uri) => {
    const cls = allClasses.find((cl) => cl.uri === uri);
    return { uri, label: cls?.labels[0]?.value || c(uri) };
  });

  const schemaProps = new Map<string, OntologyProperty[]>();
  for (const typeUri of individual.typeUris) {
    const propsForType = allProperties.filter((p) => {
      if (p.domain.kind === "class") return p.domain.uri === typeUri;
      return p.domain.uris.includes(typeUri);
    });
    if (propsForType.length > 0) schemaProps.set(typeUri, propsForType);
  }

  const valuesByPropUri = new Map<string, Array<{ pv: IndividualPropertyValue; originalIndex: number }>>();
  const usedIndices = new Set<number>();
  individual.propertyValues.forEach((pv, idx) => {
    const existing = valuesByPropUri.get(pv.propertyUri) ?? [];
    existing.push({ pv, originalIndex: idx });
    valuesByPropUri.set(pv.propertyUri, existing);
  });

  const propLabel = (uri: string) => {
    const prop = allProperties.find((p) => p.uri === uri);
    return prop?.labels[0]?.value || c(uri);
  };

  const valueLabel = (pv: IndividualPropertyValue) => {
    if (pv.isLiteral) return `"${pv.value}"${pv.lang ? `@${pv.lang}` : ""}`;
    const cls = allClasses.find((cl) => cl.uri === pv.value);
    if (cls) return cls.labels[0]?.value || c(pv.value);
    const ind = individuals.find((i) => i.uri === pv.value);
    if (ind) return ind.localName;
    return c(pv.value);
  };

  const propTypeColor = (uri: string) => {
    const prop = allProperties.find((p) => p.uri === uri);
    if (!prop) return "text-th-fg-3";
    if (prop.type === "owl:ObjectProperty") return "text-prop-object-500";
    if (prop.type === "owl:DatatypeProperty") return "text-prop-datatype-500";
    return "text-prop-annotation-500";
  };

  const saveEdit = (idx: number, isLiteral: boolean) => {
    updateIndividualProperty(individual.id, idx, { value: editValue, isLiteral });
    setEditingIdx(null);
  };

  const handleAdd = () => {
    if (!newPropUri || !newPropValue) return;
    addIndividualProperty(individual.id, { propertyUri: newPropUri, value: newPropValue, isLiteral: newPropIsLiteral });
    setNewPropValue("");
    setAdding(false);
  };

  const renderPropertyValue = (pv: IndividualPropertyValue, originalIndex: number) => {
    const isEditing = editingIdx === originalIndex;
    return (
      <div key={originalIndex} className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-th-hover/50">
        <span className={`min-w-0 flex-shrink-0 text-xs font-medium ${propTypeColor(pv.propertyUri)}`}>
          {propLabel(pv.propertyUri)}
        </span>
        <span className="text-xs text-th-fg-4">→</span>
        {isEditing ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit(originalIndex, pv.isLiteral);
                if (e.key === "Escape") setEditingIdx(null);
              }}
              autoFocus
              className="flex-1 rounded bg-th-input px-1.5 py-0.5 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={() => saveEdit(originalIndex, pv.isLiteral)} className="rounded p-0.5 text-green-500 hover:text-green-400"><Check size={11} /></button>
            <button onClick={() => setEditingIdx(null)} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"><X size={11} /></button>
          </div>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-th-fg">{valueLabel(pv)}</span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <button onClick={() => { setEditingIdx(originalIndex); setEditValue(pv.value); }} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg-2" title="Edit value"><Pencil size={10} /></button>
              <button onClick={() => removeIndividualProperty(individual.id, originalIndex)} className="rounded p-0.5 text-th-fg-4 hover:text-red-400" title="Remove"><Trash2 size={10} /></button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded border border-th-border-muted bg-th-surface">
      {/* Header */}
      <div className="flex items-start gap-1">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 flex-shrink-0 rounded p-1 text-th-fg-4 hover:text-th-fg-2"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="group flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-base font-semibold text-th-fg">{individual.localName}</span>
              {typeLabels.map(({ uri, label }) => (
                <span key={uri} className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-800 ring-1 ring-inset ring-purple-300 dark:bg-purple-500/15 dark:text-purple-400 dark:ring-purple-500/25">
                  {label}
                </span>
              ))}
            </div>
            <span className="hidden font-mono text-xs text-th-fg-4 group-hover:inline">{c(individual.uri)}</span>
            <TimestampFooter created={individual.created} modified={individual.modified} />
          </div>
          {noteCount > 0 && (
            <button
              onClick={() => setShowNotes(true)}
              className="flex flex-shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-2xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-500 dark:hover:bg-amber-500/25"
              title={`${noteCount} editorial note${noteCount === 1 ? "" : "s"}`}
            >
              <StickyNote size={10} />
              {noteCount}
            </button>
          )}
          <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
            {noteCount === 0 && (
              <button
                onClick={() => setShowNotes(true)}
                className="rounded p-1 text-th-fg-4 hover:text-amber-400"
                title="Add editorial notes"
              >
                <StickyNote size={12} />
              </button>
            )}
            <button onClick={openMeta} className="rounded p-1 text-th-fg-4 hover:text-th-fg-2" title="Edit individual"><Pencil size={12} /></button>
            <button onClick={() => deleteIndividual(individual.id)} className="rounded p-1 text-th-fg-4 hover:text-red-400" title="Delete individual"><Trash2 size={12} /></button>
          </div>
        </div>
      </div>

      <EditorialNotesDrawer
        open={showNotes}
        onClose={() => setShowNotes(false)}
        entityKind="individual"
        entityLabel={individual.localName}
        notes={individual.editorialNotes ?? []}
        onChange={(notes) => updateIndividual(individual.id, { editorialNotes: notes })}
      />

      {/* Metadata edit form */}
      {editingMeta && (
        <div className="border-t border-th-border-muted px-3 py-2 space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-th-fg-3">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => { setEditName(e.target.value); setEditUri(buildUri(baseUri, toCamelCase(e.target.value))); }}
              className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-th-fg-3">URI</label>
            <input
              type="text"
              value={editUri}
              onChange={(e) => setEditUri(e.target.value)}
              className="w-full rounded bg-th-input px-2 py-1 font-mono text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-th-fg-3">rdf:type</label>
            <div className="flex flex-wrap gap-1">
              {allClasses.map((cls) => {
                const selected = editTypes.includes(cls.uri);
                return (
                  <button
                    key={cls.id}
                    onClick={() => toggleType(cls.uri)}
                    className={`rounded px-2 py-0.5 text-xs ${selected ? "bg-purple-700 text-white" : "bg-th-hover text-th-fg-3 hover:bg-th-border"}`}
                  >
                    {cls.labels[0]?.value || cls.localName}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveMeta} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500">Save</button>
            <button onClick={() => setEditingMeta(false)} className="rounded bg-th-hover px-3 py-1 text-xs text-th-fg-2 hover:bg-th-border">Cancel</button>
          </div>
        </div>
      )}

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && !editingMeta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-th-border-muted pb-1">
              {Array.from(schemaProps.entries()).map(([classUri, props]) => {
                const clsLabel = allClasses.find((cl) => cl.uri === classUri)?.labels[0]?.value || c(classUri);
                return (
                  <div key={classUri}>
                    <div className="px-3 pt-1.5 pb-0.5 text-xs font-medium uppercase tracking-wide text-purple-400">
                      {clsLabel} properties
                    </div>
                    {props.map((schemaProp) => {
                      const entries = valuesByPropUri.get(schemaProp.uri) ?? [];
                      entries.forEach((e) => usedIndices.add(e.originalIndex));
                      if (entries.length === 0) {
                        return (
                          <div key={schemaProp.id} className="flex items-center gap-2 px-2 py-1">
                            <span className={`text-xs font-medium ${propTypeColor(schemaProp.uri)}`}>{schemaProp.labels[0]?.value || schemaProp.localName}</span>
                            <span className="text-xs text-th-fg-4">→</span>
                            <span className="text-xs italic text-th-fg-4">(empty)</span>
                          </div>
                        );
                      }
                      return entries.map((entry) => renderPropertyValue(entry.pv, entry.originalIndex));
                    })}
                  </div>
                );
              })}

              {(() => {
                const remaining = individual.propertyValues.map((pv, idx) => ({ pv, idx })).filter(({ idx }) => !usedIndices.has(idx));
                if (remaining.length === 0) return null;
                return (
                  <div>
                    {schemaProps.size > 0 && (
                      <div className="px-3 pt-1.5 pb-0.5 text-xs font-medium uppercase tracking-wide text-th-fg-4">Other</div>
                    )}
                    {remaining.map(({ pv, idx }) => renderPropertyValue(pv, idx))}
                  </div>
                );
              })()}

              {individual.propertyValues.length === 0 && !adding && (
                <p className="px-3 py-1.5 text-xs text-th-fg-4">No property values</p>
              )}

              {adding ? (
                <div className="mx-3 mt-1 space-y-1.5 rounded border border-th-border bg-th-base p-2">
                  <select
                    value={newPropUri}
                    onChange={(e) => setNewPropUri(e.target.value)}
                    className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select property…</option>
                    {allProperties.map((p) => (
                      <option key={p.id} value={p.uri}>{p.labels[0]?.value || p.localName} ({p.type.replace("owl:", "")})</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newPropValue}
                      onChange={(e) => setNewPropValue(e.target.value)}
                      placeholder="Value"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
                      className="flex-1 rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <label className="flex items-center gap-1 text-xs text-th-fg-3">
                      <input type="checkbox" checked={newPropIsLiteral} onChange={(e) => setNewPropIsLiteral(e.target.checked)} className="rounded" />
                      Literal
                    </label>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={handleAdd} className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-500">Add</button>
                    <button onClick={() => setAdding(false)} className="rounded bg-th-hover px-2 py-0.5 text-xs text-th-fg-2 hover:bg-th-border">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className="ml-3 mt-1 flex items-center gap-1 text-xs text-th-fg-4 hover:text-blue-400">
                  <Plus size={11} />
                  Add property value
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
