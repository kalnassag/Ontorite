/**
 * CodeMirror 6 configuration for editing an ontology as Turtle: highlighting,
 * live parse errors and comment notices, autocomplete, keys and theme.
 * Lazy-loaded with the Source view.
 */

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching } from "@codemirror/language";
import { turtle } from "@codemirror/legacy-modes/mode/turtle";
import { linter, lintGutter, lintKeymap, type Diagnostic } from "@codemirror/lint";
import { autocompletion, completionKeymap, closeBrackets, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { parseTurtle } from "../../lib/turtle-parser";
import { findComments } from "../../lib/turtle-comments";

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syn-keyword)", fontWeight: "600" },
  { tag: tags.atom, color: "var(--syn-iri)" },
  { tag: [tags.variableName, tags.name], color: "var(--syn-name)" },
  { tag: tags.meta, color: "var(--syn-prefix)" },
  { tag: tags.string, color: "var(--syn-string)" },
  { tag: tags.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [tags.operator, tags.punctuation], color: "var(--syn-punct)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12px", backgroundColor: "var(--th-base)", color: "var(--th-fg)" },
  ".cm-scroller": { fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace', lineHeight: "1.55" },
  ".cm-content": { caretColor: "var(--th-fg)" },
  ".cm-gutters": { backgroundColor: "var(--th-surface)", color: "var(--th-fg-4)", border: "none", borderRight: "1px solid var(--th-border-muted)" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--th-hover) 45%, transparent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, #3b82f6 30%, transparent) !important" },
  "&.cm-focused": { outline: "none" },
  ".cm-tooltip": { backgroundColor: "var(--th-surface)", color: "var(--th-fg)", border: "1px solid var(--th-border)" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--th-hover)", color: "var(--th-fg)" },
  ".cm-panels": { backgroundColor: "var(--th-surface)", color: "var(--th-fg)", borderColor: "var(--th-border)" },
  ".cm-panel input, .cm-panel button": { fontSize: "11px" },
  ".cm-diagnostic-info": { borderLeftColor: "var(--syn-prefix)" },
});

/** Parse errors (strict, as on import) plus an info notice on every comment. */
function turtleDiagnostics(view: EditorView): Diagnostic[] {
  const doc = view.state.doc;
  const text = doc.toString();
  const diagnostics: Diagnostic[] = findComments(text).map((c) => ({
    from: c.from,
    to: c.to,
    severity: "info",
    message: "Comments aren't kept when you apply — use skos:editorialNote or rdfs:comment to keep a note with the ontology.",
  }));
  const { errors } = parseTurtle(text);
  const err = errors[0];
  if (err) {
    const line = doc.line(Math.min(Math.max(err.line ?? 1, 1), doc.lines));
    diagnostics.push({ from: line.from, to: Math.max(line.to, line.from + 1), severity: "error", message: err.message });
  }
  return diagnostics;
}

export interface TurtleEditorOptions {
  /** Prefixed names to complete (prefixes, local classes and properties); read on every request */
  getCompletions: () => Completion[];
  onApply: () => void;
  onApplyAndSave: () => void;
}

/** Complete prefixed names, e.g. `:Ve` → `:Vehicle`, `owl:Tr` → `owl:TransitiveProperty`. */
function completionSource(getCompletions: () => Completion[]) {
  return (context: CompletionContext) => {
    const word = context.matchBefore(/[A-Za-z0-9_-]*:[A-Za-z0-9_.-]*|[A-Za-z][A-Za-z0-9_-]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return { from: word.from, options: getCompletions(), validFor: /^[A-Za-z0-9_:.-]*$/ };
  };
}

export function turtleEditorExtensions({ getCompletions, onApply, onApplyAndSave }: TurtleEditorOptions): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    bracketMatching(),
    closeBrackets(),
    highlightSelectionMatches(),
    search({ top: true }),
    StreamLanguage.define(turtle),
    syntaxHighlighting(highlight),
    linter(turtleDiagnostics, { delay: 350 }),
    lintGutter(),
    autocompletion({ override: [completionSource(getCompletions)] }),
    keymap.of([
      { key: "Mod-Enter", run: () => { onApply(); return true; }, preventDefault: true },
      { key: "Mod-s", run: () => { onApplyAndSave(); return true; }, preventDefault: true },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
    theme,
    EditorView.lineWrapping,
  ];
}
