/**
 * Reusable multilingual label/description editor.
 * Each entry is a { value, lang } pair. Users can add/remove entries
 * and edit both the text value and the language tag.
 */

import { Plus, X } from "lucide-react";
import type { LangString } from "../../types";

interface Props {
  values: LangString[];
  onChange: (values: LangString[]) => void;
  placeholder?: string;
  /** If true, renders a textarea for each value (for descriptions) */
  multiline?: boolean;
  /** Textarea height in lines (only used when multiline). Default 2. */
  rows?: number;
}

export default function LabelEditor({ values, onChange, placeholder = "Value", multiline = false, rows = 2 }: Props) {
  const update = (index: number, patch: Partial<LangString>) => {
    onChange(values.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const remove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...values, { value: "", lang: "" }]);
  };

  return (
    <div className="space-y-1">
      {values.map((entry, i) => (
        <div key={i} className="flex items-start gap-1">
          {multiline ? (
            <textarea
              value={entry.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={placeholder}
              rows={rows}
              className="flex-1 resize-y rounded bg-th-input px-2 py-1 text-xs leading-relaxed text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <input
              type="text"
              value={entry.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={placeholder}
              className="flex-1 rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
          <input
            type="text"
            value={entry.lang}
            onChange={(e) => update(i, { lang: e.target.value })}
            placeholder="lang"
            className="w-12 rounded bg-th-input px-2 py-1 text-xs text-th-fg-3 placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => remove(i)}
            className="mt-0.5 rounded p-1 text-th-fg-4 hover:text-red-400"
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1 text-2xs text-th-fg-3 hover:text-th-fg"
      >
        <Plus size={11} />
        Add
      </button>
    </div>
  );
}
