/**
 * Modal dialog for creating a new individual/entity.
 * Collects a label and a class type, then generates the URI preview.
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toCamelCase, buildUri } from "../../lib/uri-utils";
import type { OntologyClass } from "../../types";

interface Props {
  classes: OntologyClass[];
  baseUri: string;
  onConfirm: (label: string, typeUri: string) => void;
  onCancel: () => void;
}

export default function CreateEntityDialog({ classes, baseUri, onConfirm, onCancel }: Props) {
  const [label, setLabel] = useState("");
  const [typeUri, setTypeUri] = useState(classes[0]?.uri ?? "");
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const previewUri = label.trim()
    ? buildUri(baseUri, toCamelCase(label.trim()))
    : "";

  const canSubmit = label.trim().length > 0 && typeUri.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) onConfirm(label.trim(), typeUri);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-th-border bg-th-surface/90 backdrop-blur-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-th-border px-4 py-3">
          <h2 className="text-sm font-semibold text-th-fg">New Entity</h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
          {/* Label */}
          <div>
            <label className="mb-1 block text-xs font-medium text-th-fg-2">
              Label <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              ref={labelRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Alice"
              className="input-base w-full text-sm"
            />
          </div>

          {/* Class picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-th-fg-2">
              Class <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            {classes.length === 0 ? (
              <p className="text-xs text-th-fg-4">
                No classes available. Create a class first.
              </p>
            ) : (
              <select
                value={typeUri}
                onChange={(e) => setTypeUri(e.target.value)}
                className="input-base w-full text-sm"
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.uri}>
                    {cls.labels[0]?.value || cls.localName}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* URI preview */}
          {previewUri && (
            <div>
              <div className="mb-0.5 text-2xs font-medium text-th-fg-4">URI (preview)</div>
              <div className="break-all rounded bg-th-base px-2 py-1 font-mono text-2xs text-th-fg-3">
                {previewUri}
              </div>
            </div>
          )}

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
              type="submit"
              disabled={!canSubmit}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create Entity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
