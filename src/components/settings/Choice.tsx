/**
 * A segmented single choice (radio group): arrow keys move between options,
 * as screen readers and keyboard users expect.
 */

import { useId, useRef } from "react";

interface Props<T extends string> {
  label: string;
  hint?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export default function Choice<T extends string>({ label, hint, value, options, onChange }: Props<T>) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div className="space-y-1">
      <div id={id} className="text-xs font-medium text-th-fg-2">{label}</div>
      <div role="radiogroup" aria-labelledby={id} className="inline-flex flex-wrap rounded border border-th-border">
        {options.map((option, i) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => { refs.current[i] = el; }}
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
              }}
              className={`px-2.5 py-1 text-2xs first:rounded-l last:rounded-r ${
                selected ? "bg-blue-600 font-medium text-white" : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-2xs leading-snug text-th-fg-4">{hint}</p>}
    </div>
  );
}
