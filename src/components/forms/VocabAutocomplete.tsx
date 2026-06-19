/**
 * Searchable combobox for OWL/RDF vocabulary terms + in-ontology entities.
 * Used in range pickers, subClassOf/subPropertyOf pickers, and
 * annotation-predicate inputs.
 *
 * Keyboard: Up/Down navigate, Enter selects, Esc closes.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchVocab, type VocabEntry, type VocabFilter, type VocabKind } from "../../lib/vocab-autocomplete";

export interface LocalSuggestion {
  uri: string;
  localName: string;
  label: string;
  /** "class" | "property" — used to filter against `filter.kinds`. */
  kind: VocabKind;
}

interface Props {
  value: string;
  /**
   * Fires on every keystroke. Use this when the parent wants to mirror the
   * text the user is typing (e.g. a search box). Does NOT fire on commit —
   * use `onPick` for "the user chose this value" semantics.
   */
  onChange: (text: string) => void;
  /**
   * Fires when the user commits a value — either by clicking a suggestion,
   * pressing Enter on the highlighted suggestion, or pressing Enter on
   * free text. This is the right handler for "add a chip" or "set this
   * field" actions, since it will NOT fire per keystroke.
   */
  onPick?: (value: string) => void;
  filter?: VocabFilter;
  placeholder?: string;
  /** In-ontology entries to merge into the suggestion list. */
  localEntries?: LocalSuggestion[];
  /** Compact prefix display map for already-selected value. */
  prefixes?: Record<string, string>;
  /** className passed to the input. */
  className?: string;
  /**
   * What to emit when the user selects a vocab entry:
   * - "uri" (default): full URI like `http://www.w3.org/.../skos/core#editorialNote`
   * - "compact": prefixed name like `skos:editorialNote`
   * Local entries always emit their `.uri` field.
   */
  outputAs?: "uri" | "compact";
}

type Suggestion =
  | { source: "vocab"; entry: VocabEntry }
  | { source: "local"; entry: LocalSuggestion };

export default function VocabAutocomplete({
  value,
  onChange,
  onPick,
  filter,
  placeholder = "Type to search…",
  localEntries = [],
  className = "",
  outputAs = "uri",
}: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // External value changes (e.g. parent updates) should be reflected
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click-outside closes the popover (checks both anchor wrapper AND the
  // portaled popover, since the popover is no longer inside the wrapper).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // Position the portaled popover beneath (or above) the input based on
  // available viewport space. Re-position on scroll/resize while open.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const width = Math.max(rect.width, 352); // min 22rem
      const maxHeight = 288; // ~max-h-72
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const flipUp = spaceBelow < maxHeight + 16 && spaceAbove > spaceBelow;
      const style: React.CSSProperties = {
        position: "fixed",
        left: rect.left,
        width,
        maxHeight: Math.min(maxHeight, flipUp ? spaceAbove - 8 : spaceBelow - 8),
        zIndex: 70,
      };
      if (flipUp) style.bottom = window.innerHeight - rect.top + 4;
      else style.top = rect.bottom + 4;
      setPopoverStyle(style);
    };
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = query.trim().toLowerCase();
    const localFiltered = localEntries
      .filter((e) => {
        if (filter?.kinds && !filter.kinds.includes(e.kind)) return false;
        if (!q) return true;
        return (
          e.localName.toLowerCase().includes(q) ||
          e.label.toLowerCase().includes(q) ||
          e.uri.toLowerCase().includes(q)
        );
      })
      .slice(0, 8)
      .map((entry) => ({ source: "local" as const, entry }));
    const vocab = searchVocab(query, filter).map((entry) => ({ source: "vocab" as const, entry }));
    return [...localFiltered, ...vocab].slice(0, 14);
  }, [query, filter, localEntries]);

  const select = (s: Suggestion) => {
    const emitted =
      s.source === "vocab" && outputAs === "compact"
        ? `${s.entry.prefix}:${s.entry.localName}`
        : s.entry.uri;
    setQuery(emitted);
    setOpen(false);
    // Commit via onPick if available; otherwise fall back to onChange so old
    // single-handler call sites keep working.
    if (onPick) onPick(emitted);
    else onChange(emitted);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = suggestions[highlight];
      if (pick) {
        select(pick);
      } else {
        // Accept the free-text value as a commit
        const v = query.trim();
        setOpen(false);
        if (onPick) onPick(v);
        else onChange(v);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={`w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
      />
      {open && suggestions.length > 0 && createPortal(
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="overflow-y-auto rounded border border-th-border bg-th-surface shadow-lg"
        >
          {suggestions.map((s, i) => {
            const isHi = i === highlight;
            const local = s.source === "local";
            const prefix = s.source === "vocab" ? s.entry.prefix : "";
            const localName = s.entry.localName;
            const label = s.entry.label;
            return (
              <button
                key={`${s.source}-${s.entry.uri}-${i}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(s);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-baseline gap-2 whitespace-nowrap px-3 py-1.5 text-left text-xs ${isHi ? "bg-th-hover" : ""}`}
              >
                <span className={`flex-shrink-0 font-mono ${local ? "text-blue-400" : "text-th-fg-3"}`}>
                  {local ? ":" : `${prefix}:`}{localName}
                </span>
                <span className="min-w-0 flex-1 truncate text-2xs text-th-fg-4">{label}</span>
                <span className="ml-auto flex-shrink-0 rounded bg-th-input px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-th-fg-4">
                  {local ? "local" : s.entry.kind}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
