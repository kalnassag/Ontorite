/**
 * Renders a single property nested inside a ClassCard.
 * Clicking expands to the full edit form.
 */

import { memo, useState } from "react";
import { Pencil, Trash2, Clipboard, StickyNote } from "lucide-react";
import { useStore } from "../../lib/store";
import { useActivePrefixes, useActiveClasses } from "../../lib/store-hooks";
import { compact } from "../../lib/uri-utils";
import PropertyForm from "../forms/PropertyForm";
import EditorialNotesDrawer from "../dialogs/EditorialNotesDrawer";
import TimestampFooter from "./TimestampFooter";
import { classExprFormat } from "../../types";
import { characteristicsOf, CHARACTERISTICS } from "../../lib/characteristics";
import { RDF } from "../../lib/vocab";
import Highlight from "./Highlight";
import type { ExtraTriple, OntologyProperty } from "../../types";
import TurtleStatementList from "./TurtleStatementList";

interface Props {
  property: OntologyProperty;
  onDelete?: (label: string) => void;
  /**
   * If set, this row is being rendered nested inside a specific class's
   * card. When the property's domain is a union, we show a "∪ also: …"
   * chip naming the OTHER member classes for context.
   */
  viewedFromClassUri?: string;
  /** Current filter text, highlighted in the label */
  search?: string;
  /** Allow dragging this row onto a class card to set its domain */
  draggable?: boolean;
}

/** MIME type for dragging a property onto a class card. */
export const PROPERTY_DRAG_TYPE = "application/x-ontorite-property";
const CHARACTERISTIC_IRIS = new Set(CHARACTERISTICS.map((ch) => ch.iri));
const isCharacteristicTriple = (et: ExtraTriple) => et.predicate === RDF.type && CHARACTERISTIC_IRIS.has(et.object);

const TYPE_BADGE: Record<OntologyProperty["type"], { label: string; className: string }> = {
  "owl:ObjectProperty": { label: "O", className: "bg-prop-object-700 text-prop-object-100" },
  "owl:DatatypeProperty": { label: "D", className: "bg-prop-datatype-700 text-prop-datatype-100" },
  "owl:AnnotationProperty": { label: "A", className: "bg-prop-annotation-700 text-prop-annotation-100" },
};

function PropertyRow({ property, onDelete, viewedFromClassUri, search, draggable = false }: Props) {
  const deleteProperty = useStore((s) => s.deleteProperty);
  const copyProperty = useStore((s) => s.copyProperty);
  const updateProperty = useStore((s) => s.updateProperty);
  const prefixes = useActivePrefixes();
  const allClasses = useActiveClasses();
  const [editing, setEditing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const badge = TYPE_BADGE[property.type];
  const primaryLabel = property.labels[0]?.value || property.localName;
  const noteCount = (property.editorialNotes ?? []).filter((n) => n.value).length;
  // Label-aware short form: prefer label > localName > compact URI
  const shortClassUri = (uri: string) => {
    const found = allClasses.find((c) => c.uri === uri);
    if (found) return found.labels[0]?.value || found.localName;
    return compact(uri, prefixes);
  };
  const rangeLabel = (property.ranges ?? []).length > 0
    ? (property.ranges ?? []).map((r) => classExprFormat(r, (u) => compact(u, prefixes))).join(", ")
    : null;
  // "Shared with" companion classes (union domain only) — excluding the one this row is being viewed under.
  const unionCompanions: string[] = (property.domain.kind === "union" && viewedFromClassUri)
    ? property.domain.uris.filter((u) => u !== viewedFromClassUri).map(shortClassUri)
    : [];
  const description = property.descriptions[0]?.value;
  const characteristics = characteristicsOf(property);
  const otherExtras = (property.extraTriples ?? []).filter((et) => !isCharacteristicTriple(et));

  if (editing) {
    return (
      <div className="ml-4 mt-1">
        <PropertyForm existing={property} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div
      className={`group flex items-start gap-1.5 rounded px-2 py-1 hover:bg-th-hover/50 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData(PROPERTY_DRAG_TYPE, property.id);
        e.dataTransfer.effectAllowed = "move";
      } : undefined}
      title={draggable ? "Drag onto a class to make it the domain" : undefined}
    >
      {/* Type badge */}
      <span
        className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-2xs font-bold ${badge.className}`}
        title={property.type}
      >
        {badge.label}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-th-fg"><Highlight text={primaryLabel} query={search} /></span>
          {characteristics.map((ch) => (
            <span
              key={ch.iri}
              className="rounded bg-th-input px-1 font-mono text-2xs text-th-fg-3"
              title={`owl:${ch.iri.split("#")[1]}`}
            >
              {ch.short}
            </span>
          ))}
          {rangeLabel && (
            <span className="font-mono text-xs text-th-fg-3">{rangeLabel}</span>
          )}
          {unionCompanions.length > 0 && (
            <span
              className="rounded bg-blue-100 px-1.5 py-0.5 text-2xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
              title={`This property is shared via owl:unionOf with: ${unionCompanions.join(", ")}`}
            >
              ∪ also: {unionCompanions.join(", ")}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-th-fg-3">{description}</p>
        )}
        {/* Additional labels */}
        {property.labels.length > 1 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {property.labels.slice(1).map((lbl, i) => (
              <span key={i} className="text-2xs text-th-fg-4">
                "{lbl.value}"{lbl.lang ? <span>@{lbl.lang}</span> : null}
              </span>
            ))}
          </div>
        )}
        {/* Statements with no typed field, as Turtle (characteristics are shown as badges) */}
        {otherExtras.length > 0 && (
          <div className="-mx-3">
            <TurtleStatementList
              extras={property.extraTriples}
              hide={isCharacteristicTriple}
              onChange={(extraTriples) => updateProperty(property.id, { extraTriples })}
              allowAdd={false}
            />
          </div>
        )}
        <TimestampFooter created={property.created} modified={property.modified} />
      </div>

      {/* Persistent editorial-notes chip (only when notes exist) */}
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

      {/* Actions (shown on hover) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        {noteCount === 0 && (
          <button
            onClick={() => setShowNotes(true)}
            className="rounded p-1 text-th-fg-4 hover:text-amber-400"
            title="Add editorial notes"
          >
            <StickyNote size={11} />
          </button>
        )}
        <button
          onClick={() => copyProperty(property.id)}
          className="rounded p-1 text-th-fg-4 hover:text-purple-400"
          title="Copy property"
        >
          <Clipboard size={11} />
        </button>
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-th-fg-4 hover:text-th-fg-2"
          title="Edit property"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={() => { deleteProperty(property.id); onDelete?.(primaryLabel); }}
          className="rounded p-1 text-th-fg-4 hover:text-red-400"
          title="Delete property"
        >
          <Trash2 size={11} />
        </button>
      </div>

      <EditorialNotesDrawer
        open={showNotes}
        onClose={() => setShowNotes(false)}
        entityKind="property"
        entityLabel={primaryLabel}
        notes={property.editorialNotes ?? []}
        onChange={(notes) => updateProperty(property.id, { editorialNotes: notes })}
      />
    </div>
  );
}

export default memo(PropertyRow);
