import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from "../../lib/store";
import { compact } from "../../lib/uri-utils";
import PropertyRow from './PropertyRow';
import ClassForm from '../forms/ClassForm';
import PropertyForm from '../forms/PropertyForm';
import type { OntologyClass, OntologyProperty } from "../../types";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Clipboard, StickyNote } from 'lucide-react';
import EditorialNotesDrawer from '../dialogs/EditorialNotesDrawer';

interface Props {
  cls: OntologyClass;
  /** Properties assigned to this class (passed from App via memoized domain map) */
  properties: OntologyProperty[];
  defaultExpanded?: boolean;
  highlighted?: boolean;
  /** Called after deleting this class or one of its properties — for undo toast */
  onDelete?: (label: string) => void;
}

const TYPE_ORDER: Array<'owl:ObjectProperty' | 'owl:DatatypeProperty' | 'owl:AnnotationProperty'> = [
  'owl:ObjectProperty',
  'owl:DatatypeProperty',
  'owl:AnnotationProperty',
];

const TYPE_LABEL: Record<string, string> = {
  'owl:ObjectProperty': 'Object',
  'owl:DatatypeProperty': 'Datatype',
  'owl:AnnotationProperty': 'Annotation',
};

const TYPE_COLOR: Record<string, string> = {
  'owl:ObjectProperty': 'text-prop-object-500',
  'owl:DatatypeProperty': 'text-prop-datatype-500',
  'owl:AnnotationProperty': 'text-prop-annotation-500',
};

export default function ClassCard({ cls, properties, defaultExpanded = true, highlighted = false, onDelete }: Props) {
  const deleteClass = useStore((s) => s.deleteClass);
  const copyClass = useStore((s) => s.copyClass);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const clipboard = useStore((s) => s.clipboard);
  const updateClass = useStore((s) => s.updateClass);
  // E2: Use stable inline selector instead of getActiveOntology()
  const activeOntology = useStore((s) => s.ontologies.find(o => o.id === s.activeOntologyId));

  const cardRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editingClass, setEditingClass] = useState(false);
  const [addingProperty, setAddingProperty] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // E9: Warn before deleting a class with properties
  const [pendingDelete, setPendingDelete] = useState(false);

  const noteCount = (cls.editorialNotes ?? []).filter((n) => n.value).length;

  useEffect(() => {
    if (!highlighted || !cardRef.current) return;
    cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    setExpanded(true);
  }, [highlighted]);

  // U10: Scroll property form into view when opened
  useEffect(() => {
    if (!addingProperty) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [addingProperty]);

  const prefixes = activeOntology?.metadata.prefixes ?? {};
  const allClasses = activeOntology?.classes ?? [];

  const primaryLabel = cls.labels[0]?.value || cls.localName;
  const allLabels = cls.labels;

  // Group properties by type
  const grouped = new Map<string, typeof properties>();
  for (const type of TYPE_ORDER) grouped.set(type, []);
  for (const prop of properties) {
    const group = grouped.get(prop.type);
    if (group) group.push(prop);
  }

  // Resolve parent class labels
  const parentLabels = cls.subClassOf.map((parentUri) => {
    const parent = allClasses.find((c) => c.uri === parentUri);
    return parent?.labels[0]?.value || compact(parentUri, prefixes);
  });

  const handleDeleteClass = () => {
    deleteClass(cls.id);
    setPendingDelete(false);
    onDelete?.(primaryLabel);
  };

  return (
    <div
      ref={cardRef}
      className={`rounded border bg-th-surface transition-shadow duration-300 ${
        highlighted ? "border-blue-500 ring-2 ring-blue-500/60" : "border-th-border-muted"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-1">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 flex-shrink-0 rounded p-1 text-th-fg-4 hover:text-th-fg-2"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="group flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold text-th-fg">{primaryLabel}</span>
              {/* Additional labels */}
              {allLabels.slice(1).map((lbl, i) => (
                <span key={i} className="text-xs text-th-fg-3">
                  "{lbl.value}"{lbl.lang ? <span>@{lbl.lang}</span> : null}
                </span>
              ))}
              {/* URI on hover */}
              <span className="hidden font-mono text-xs text-th-fg-4 group-hover:inline">
                {compact(cls.uri, prefixes)}
              </span>
            </div>
            {/* Parent classes */}
            {parentLabels.length > 0 && (
              <div className="mt-0.5 flex items-center gap-1">
                <span className="text-2xs text-th-fg-3">⊆</span>
                {parentLabels.map((lbl, i) => (
                  <span key={i} className="text-2xs text-th-fg-3">{lbl}</span>
                ))}
              </div>
            )}
            {/* Disjoint classes */}
            {(cls.disjointWith ?? []).length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <span className="text-2xs text-red-400" title="owl:disjointWith">⊥</span>
                {(cls.disjointWith ?? []).map((uri, i) => {
                  const disjCls = allClasses.find((c) => c.uri === uri);
                  return (
                    <span key={i} className="rounded bg-red-950/40 px-1 text-2xs text-red-400">
                      {disjCls?.labels[0]?.value || compact(uri, prefixes)}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Description */}
            {cls.descriptions[0]?.value && (
              <p className="mt-0.5 text-2xs leading-snug text-th-fg-3">
                {cls.descriptions[0]?.value}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => { setAddingProperty(true); setExpanded(true); }}
              className="rounded p-1 text-th-fg-4 hover:text-blue-400"
              title="Add property"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className={`relative rounded p-1 hover:text-amber-400 ${noteCount > 0 ? "text-amber-500" : "text-th-fg-4"}`}
              title={noteCount > 0 ? `${noteCount} editorial note${noteCount === 1 ? "" : "s"}` : "Editorial notes"}
            >
              <StickyNote size={12} />
              {noteCount > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1 text-[8px] font-bold leading-tight text-white">
                  {noteCount}
                </span>
              )}
            </button>
            <button
              onClick={() => copyClass(cls.id)}
              className="rounded p-1 text-th-fg-4 hover:text-purple-400"
              title={`Copy class${properties.length > 0 ? ` + ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}` : ''}`}
            >
              <Clipboard size={12} />
            </button>
            <button
              onClick={() => setEditingClass(true)}
              className="rounded p-1 text-th-fg-4 hover:text-th-fg-2"
              title="Edit class"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => {
                if (properties.length > 0) {
                  setPendingDelete(true);
                } else {
                  handleDeleteClass();
                }
              }}
              className="rounded p-1 text-th-fg-4 hover:text-red-400"
              title="Delete class"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>

      <EditorialNotesDrawer
        open={showNotes}
        onClose={() => setShowNotes(false)}
        entityKind="class"
        entityLabel={primaryLabel}
        notes={cls.editorialNotes ?? []}
        onChange={(notes) => updateClass(cls.id, { editorialNotes: notes })}
      />

      {/* E9: Inline delete confirmation when class has properties */}
      {pendingDelete && (
        <div className="mx-3 mb-2 rounded border border-red-900/50 bg-red-950/30 px-3 py-2">
          <p className="mb-1.5 text-xs text-th-fg-2">
            Delete &ldquo;{primaryLabel}&rdquo;? Its {properties.length} propert{properties.length === 1 ? 'y' : 'ies'} will become unassigned.
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={handleDeleteClass}
              className="rounded bg-red-700 px-2 py-0.5 text-2xs font-medium text-white hover:bg-red-600"
            >
              Delete
            </button>
            <button
              onClick={() => setPendingDelete(false)}
              className="rounded bg-th-hover px-2 py-0.5 text-2xs text-th-fg-2 hover:bg-th-border"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit class form */}
      {editingClass && (
        <div className="px-3 pb-3">
          <ClassForm existing={cls} onDone={() => setEditingClass(false)} />
        </div>
      )}

      {/* Expanded body: properties + add-property form */}
      <AnimatePresence initial={false}>
        {expanded && !editingClass && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-th-border-muted pb-1">
              {TYPE_ORDER.map((type) => {
                const group = grouped.get(type) ?? [];
                if (group.length === 0) return null;
                return (
                  <div key={type}>
                    <div className={`px-3 pt-1.5 pb-0.5 text-2xs font-medium uppercase tracking-wide ${TYPE_COLOR[type]}`}>
                      {TYPE_LABEL[type]}
                    </div>
                    {group.map((prop) => (
                      <PropertyRow
                        key={prop.id}
                        property={prop}
                        onDelete={onDelete ? (label) => onDelete(label) : undefined}
                      />
                    ))}
                  </div>
                );
              })}

              {/* Restrictions */}
              {(cls.restrictions ?? []).length > 0 && (
                <div>
                  <div className="px-3 pt-1.5 pb-0.5 text-2xs font-medium uppercase tracking-wide text-orange-400">
                    Logical Restrictions
                  </div>
                  {(cls.restrictions ?? []).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-0.5">
                      <span className="text-2xs font-medium text-th-fg-2">
                        {compact(r.propertyUri, prefixes)}
                      </span>
                      <span className="text-2xs text-th-fg-4 px-1 rounded bg-th-hover border border-th-border-muted font-mono">
                        {r.type}
                      </span>
                      <span className="text-2xs text-th-fg-3">
                        {r.value.startsWith("http") ? compact(r.value, prefixes) : r.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Extra triples (prov:wasQuotedFrom, skos:*, etc.) */}
              {(cls.extraTriples ?? []).length > 0 && (
                <div>
                  <div className="px-3 pt-1.5 pb-0.5 text-2xs font-medium uppercase tracking-wide text-th-fg-4">
                    Additional Annotations
                  </div>
                  {(cls.extraTriples ?? []).map((et, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-0.5">
                      <span className="text-2xs font-medium text-th-fg-3">
                        {compact(et.predicate, prefixes)}
                      </span>
                      <span className="text-2xs text-th-fg-4">→</span>
                      <span className="text-2xs text-th-fg">
                        {et.isLiteral
                          ? `"${et.object}"${et.lang ? `@${et.lang}` : ''}${et.datatype ? `^^${compact(et.datatype, prefixes)}` : ''}`
                          : compact(et.object, prefixes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {properties.length === 0 && (cls.extraTriples ?? []).length === 0 && !addingProperty && (
                <p className="px-3 py-1.5 text-2xs text-th-fg-4">No properties</p>
              )}

              {/* Add-property form */}
              {addingProperty ? (
                <div ref={formRef} className="px-3 pt-1.5">
                  <PropertyForm
                    defaultDomainUri={cls.uri}
                    onDone={() => setAddingProperty(false)}
                  />
                </div>
              ) : (
                <div className="ml-3 mt-1 flex items-center gap-2">
                  <button
                    onClick={() => setAddingProperty(true)}
                    className="flex items-center gap-1 text-2xs text-th-fg-4 hover:text-blue-400"
                  >
                    <Plus size={11} />
                    Add property
                  </button>
                  {clipboard?.type === "property" && (
                    <button
                      onClick={() => pasteClipboard({ domainUri: cls.uri })}
                      className="flex items-center gap-1 text-2xs text-purple-500 hover:text-purple-400"
                      title={`Paste "${clipboard.property.labels[0]?.value || clipboard.property.localName}" into this class`}
                    >
                      <Clipboard size={11} />
                      Paste property
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
