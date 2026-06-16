/**
 * Detail view for a selected class: labels, URI, descriptions, parent classes,
 * and all properties where this class is the rdfs:domain.
 */

import { Pencil, X } from "lucide-react";
import { useStore } from "../../lib/store";
import { localName } from "../../lib/uri-utils";

interface Props {
  classId: string;
  onEditClass: (id: string) => void;
  onSelectClass: (id: string | null) => void;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  "owl:ObjectProperty": "Object",
  "owl:DatatypeProperty": "Datatype",
  "owl:AnnotationProperty": "Annotation",
};

const PROPERTY_TYPE_CLASSES: Record<string, string> = {
  "owl:ObjectProperty": "badge-object",
  "owl:DatatypeProperty": "badge-datatype",
  "owl:AnnotationProperty": "badge-annotation",
};

export default function ClassDetailPane({ classId, onEditClass, onSelectClass }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());

  if (!activeOntology) return null;

  const cls = activeOntology.classes.find((c) => c.id === classId);
  if (!cls) return null;

  const domainProperties = activeOntology.properties.filter(
    (p) => p.domainUri === cls.uri
  );

  const objectProps = domainProperties.filter((p) => p.type === "owl:ObjectProperty");
  const datatypeProps = domainProperties.filter((p) => p.type === "owl:DatatypeProperty");
  const annotationProps = domainProperties.filter((p) => p.type === "owl:AnnotationProperty");

  const parentClasses = cls.subClassOf
    .map((uri) => activeOntology.classes.find((c) => c.uri === uri))
    .filter(Boolean);

  const primaryLabel = cls.labels[0]?.value || cls.localName;

  return (
    <div className="border-t border-th-border bg-th-surface text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex-1 truncate font-semibold text-th-fg">{primaryLabel}</span>
        <button
          onClick={() => onEditClass(classId)}
          className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          title="Edit class"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => onSelectClass(null)}
          className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          title="Close detail"
        >
          <X size={12} />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto px-3 pb-3 space-y-3">
        {/* URI */}
        <div>
          <div className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-th-fg-4">URI</div>
          <div className="break-all font-mono text-2xs text-th-fg-3">{cls.uri}</div>
        </div>

        {/* Labels */}
        {cls.labels.length > 0 && (
          <div>
            <div className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-th-fg-4">Labels</div>
            <div className="space-y-0.5">
              {cls.labels.map((l, i) => (
                <div key={i} className="flex items-baseline gap-1">
                  <span className="text-th-fg">{l.value}</span>
                  {l.lang && (
                    <span className="rounded bg-th-hover px-1.5 text-2xs font-medium text-th-fg-2">
                      {l.lang}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Descriptions */}
        {cls.descriptions.length > 0 && (
          <div>
            <div className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-th-fg-4">Description</div>
            <div className="space-y-1">
              {cls.descriptions.map((d, i) => (
                <div key={i} className="text-th-fg-2 leading-relaxed">
                  {d.value}
                  {d.lang && (
                    <span className="ml-1 rounded bg-th-hover px-1.5 text-2xs font-medium text-th-fg-2">
                      {d.lang}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parent classes */}
        {parentClasses.length > 0 && (
          <div>
            <div className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-th-fg-4">
              subClassOf
            </div>
            <div className="flex flex-wrap gap-1">
              {parentClasses.map((parent) => {
                if (!parent) return null;
                return (
                  <button
                    key={parent.id}
                    onClick={() => onSelectClass(parent.id)}
                    className="rounded border border-th-border px-1.5 py-0.5 text-2xs text-th-fg-2 hover:border-blue-400 hover:text-blue-400"
                  >
                    {parent.labels[0]?.value || parent.localName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Properties */}
        {domainProperties.length > 0 && (
          <div>
            <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-th-fg-4">
              Properties ({domainProperties.length})
            </div>
            <div className="space-y-2">
              {[
                ["owl:ObjectProperty", objectProps] as const,
                ["owl:DatatypeProperty", datatypeProps] as const,
                ["owl:AnnotationProperty", annotationProps] as const,
              ].map(([type, props]) => {
                if (props.length === 0) return null;
                return (
                  <div key={type}>
                    <div className="mb-0.5 text-2xs text-th-fg-4">
                      {PROPERTY_TYPE_LABELS[type]}
                    </div>
                    <div className="space-y-0.5">
                      {props.map((prop) => (
                        <div
                          key={prop.id}
                          className="flex items-center gap-1.5 rounded bg-th-base px-1.5 py-1"
                        >
                          <span
                            className={`flex-shrink-0 rounded px-1 text-2xs font-medium ${PROPERTY_TYPE_CLASSES[type]}`}
                          >
                            {(PROPERTY_TYPE_LABELS[type] ?? "?").charAt(0)}
                          </span>
                          <span className="flex-1 truncate text-th-fg">
                            {prop.labels[0]?.value || prop.localName}
                          </span>
                          {(prop.ranges ?? []).length > 0 && (
                            <span className="truncate text-2xs text-th-fg-4">
                              {(prop.ranges ?? []).map((r) => localName(r) || r).join(", ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {domainProperties.length === 0 && (
          <div className="text-2xs text-th-fg-4">No properties with this domain.</div>
        )}
      </div>
    </div>
  );
}
