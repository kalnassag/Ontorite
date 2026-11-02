/**
 * Modal dialog for selecting a property when creating a relationship edge
 * between two individuals in the entity graph.
 */

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { localName } from "../../lib/uri-utils";
import type { Individual, OntologyProperty } from "../../types";

interface Props {
  source: Individual;
  target: Individual;
  objectProperties: OntologyProperty[];
  onConfirm: (propertyUri: string) => void;
  onCancel: () => void;
}

function getLabel(ind: Individual): string {
  return ind.localName;
}

export default function CreateEdgeDialog({
  source,
  target,
  objectProperties,
  onConfirm,
  onCancel,
}: Props) {
  const [selectedUri, setSelectedUri] = useState(objectProperties[0]?.uri ?? "");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const canSubmit = selectedUri.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-lg border border-th-border bg-th-surface/90 backdrop-blur-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-th-border px-4 py-3">
          <h2 className="text-sm font-semibold text-th-fg">Add Relationship</h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Source → Target */}
          <div className="flex items-center gap-2 rounded bg-th-base px-3 py-2">
            <span className="max-w-[120px] truncate text-xs font-medium text-th-fg">
              {getLabel(source)}
            </span>
            <ArrowRight size={14} className="flex-shrink-0 text-th-fg-4" />
            <span className="max-w-[120px] truncate text-xs font-medium text-th-fg">
              {getLabel(target)}
            </span>
          </div>

          {/* Property picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-th-fg-2">
              Property <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            {objectProperties.length === 0 ? (
              <p className="text-xs text-th-fg-4">
                No object properties defined. Create one in the Classes view first.
              </p>
            ) : (
              <select
                value={selectedUri}
                onChange={(e) => setSelectedUri(e.target.value)}
                className="input-base w-full text-sm"
                autoFocus
              >
                {objectProperties.map((prop) => (
                  <option key={prop.id} value={prop.uri}>
                    {prop.labels[0]?.value || localName(prop.uri)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => canSubmit && onConfirm(selectedUri)}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add Relationship
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
