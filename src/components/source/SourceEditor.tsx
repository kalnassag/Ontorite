/**
 * Source view: the active ontology as editable Turtle.
 *
 * The text shown is exactly what the export writes. Edit freely; Apply
 * (Ctrl+Enter) parses it and reconciles it into the model (lib/source-apply.ts)
 * as one undo step. Applying regenerates the text, so formatting and `#`
 * comments aren't kept. Removals ask for confirmation first.
 *
 * Unapplied text survives switching views (kept per ontology for the session).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import type { Completion } from "@codemirror/autocomplete";
import { AlertCircle, CheckCircle2, RotateCcw, Play } from "lucide-react";
import { useStore, selectActiveOntology } from "../../lib/store";
import { serializeToTurtle } from "../../lib/turtle-serializer";
import { applyTurtleSource, describeSummary, type ApplySummary } from "../../lib/source-apply";
import { findComments } from "../../lib/turtle-comments";
import { compact, STANDARD_PREFIXES } from "../../lib/uri-utils";
import type { Ontology } from "../../types";
import { turtleEditorExtensions } from "./turtle-editor-setup";

/** Unapplied text per ontology: what the user typed, and the generated text it started from. */
const drafts = new Map<string, { text: string; base: string }>();

type Status =
  | { kind: "idle" }
  | { kind: "applied"; message: string }
  | { kind: "error"; message: string }
  | { kind: "confirm"; summary: ApplySummary; next: Ontology; save: boolean };

const removedCount = (s: ApplySummary) => s.classes.removed.length + s.properties.removed.length + s.individuals.removed.length;

export default function SourceEditor({ ontology }: { ontology: Ontology }) {
  const replaceOntologyContent = useStore((s) => s.replaceOntologyContent);
  const saveToFile = useStore((s) => s.saveToFile);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const settingDoc = useRef(false);
  const generated = useMemo(() => serializeToTurtle(ontology), [ontology]);
  const [base, setBase] = useState(() => drafts.get(ontology.id)?.base ?? generated);
  const [dirty, setDirty] = useState(() => drafts.has(ontology.id));
  const [commentCount, setCommentCount] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Latest values for callbacks registered once with CodeMirror
  const latest = useRef({ ontology, base });
  latest.current = { ontology, base };

  const completions = useMemo<Completion[]>(() => {
    const prefixes = { ...STANDARD_PREFIXES, ...ontology.metadata.prefixes };
    const term = (uri: string, type: string, detail?: string): Completion => ({ label: compact(uri, prefixes), type, detail });
    return [
      ...Object.keys(prefixes).map((p): Completion => ({ label: `${p}:`, type: "namespace", detail: prefixes[p] })),
      ...ontology.classes.map((c) => term(c.uri, "class", c.labels[0]?.value)),
      ...ontology.properties.map((p) => term(p.uri, "property", p.labels[0]?.value)),
      ...ontology.individuals.map((i) => term(i.uri, "variable", "individual")),
    ].filter((c) => !c.label.startsWith("<"));
  }, [ontology]);
  const completionsRef = useRef(completions);
  completionsRef.current = completions;

  const setDoc = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;
    settingDoc.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    settingDoc.current = false;
    setCommentCount(findComments(text).length);
  }, []);

  /** Adopt freshly generated text as the clean starting point. */
  const resetTo = useCallback((text: string) => {
    drafts.delete(latest.current.ontology.id);
    setBase(text);
    setDirty(false);
    setDoc(text);
  }, [setDoc]);

  const commit = useCallback((next: Ontology, summary: ApplySummary, save: boolean) => {
    replaceOntologyContent(next);
    resetTo(serializeToTurtle(next));
    setStatus({ kind: "applied", message: `Applied — ${describeSummary(summary)}` });
    if (save) void saveToFile();
  }, [replaceOntologyContent, resetTo, saveToFile]);

  const apply = useCallback((save: boolean) => {
    const view = viewRef.current;
    if (!view) return;
    const result = applyTurtleSource(view.state.doc.toString(), latest.current.ontology);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
      if (result.line) {
        const line = view.state.doc.line(Math.min(result.line, view.state.doc.lines));
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      }
      return;
    }
    if (result.unchanged) {
      resetTo(latest.current.base);
      setStatus({ kind: "applied", message: "No changes to apply" });
      if (save) void saveToFile();
      return;
    }
    // Deleting a block of text deletes the entity — confirm before removing anything
    if (removedCount(result.summary) > 0) {
      setStatus({ kind: "confirm", summary: result.summary, next: result.next, save });
      return;
    }
    commit(result.next, result.summary, save);
  }, [commit, resetTo, saveToFile]);

  const applyRef = useRef(apply);
  applyRef.current = apply;

  // Create the editor once per ontology (the parent keys this component by ontology id)
  useEffect(() => {
    if (!hostRef.current) return;
    const initial = drafts.get(ontology.id)?.text ?? generated;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initial,
        extensions: [
          turtleEditorExtensions({
            getCompletions: () => completionsRef.current,
            onApply: () => applyRef.current(false),
            onApplyAndSave: () => applyRef.current(true),
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || settingDoc.current) return;
            const text = update.state.doc.toString();
            const { ontology: onto, base: start } = latest.current;
            if (text === start) drafts.delete(onto.id);
            else drafts.set(onto.id, { text, base: start });
            setDirty(text !== start);
            setCommentCount(findComments(text).length);
            setStatus((s) => (s.kind === "idle" ? s : { kind: "idle" }));
          }),
        ],
      }),
    });
    viewRef.current = view;
    setCommentCount(findComments(initial).length);
    view.focus();
    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; later model changes are synced below
  }, []);

  // The model changed elsewhere (another view, undo): follow it unless there's unapplied text
  const stale = dirty && generated !== base;
  useEffect(() => {
    if (!dirty && generated !== base) resetTo(generated);
  }, [generated, base, dirty, resetTo]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-th-border px-3 py-1.5 text-xs">
        <span className="font-medium text-th-fg-2">Turtle source</span>
        <StatusLine status={status} dirty={dirty} commentCount={commentCount} />
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => { resetTo(generated); setStatus({ kind: "idle" }); }}
            disabled={!dirty}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-th-fg-3 hover:bg-th-hover hover:text-th-fg disabled:opacity-40"
            title="Discard unapplied edits"
          >
            <RotateCcw size={12} /> Revert
          </button>
          <button
            onClick={() => apply(false)}
            disabled={!dirty}
            className="flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            title="Apply to the ontology (Ctrl+Enter) · Ctrl+S applies and saves"
          >
            <Play size={11} /> Apply
          </button>
        </div>
      </div>

      {stale && (
        <Banner tone="amber">
          The ontology changed since you started editing — applying will overwrite those changes.
          <button onClick={() => { resetTo(generated); setStatus({ kind: "idle" }); }} className="ml-2 underline">Reload from model</button>
        </Banner>
      )}
      {status.kind === "confirm" && (
        <Banner tone="red">
          {describeSummary(status.summary)}. Removed:{" "}
          <span className="font-medium">
            {[...status.summary.classes.removed, ...status.summary.properties.removed, ...status.summary.individuals.removed].join(", ")}
          </span>
          <button onClick={() => commit(status.next, status.summary, status.save)} className="ml-2 rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-500">
            Apply anyway
          </button>
          <button onClick={() => setStatus({ kind: "idle" })} className="ml-1 underline">Cancel</button>
        </Banner>
      )}

      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  );
}

function StatusLine({ status, dirty, commentCount }: { status: Status; dirty: boolean; commentCount: number }) {
  if (status.kind === "error") {
    return <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><AlertCircle size={12} /> {status.message}</span>;
  }
  if (status.kind === "applied") {
    return <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 size={12} /> {status.message}</span>;
  }
  return (
    <span className="text-th-fg-4">
      {dirty ? "Unapplied changes · Ctrl+Enter to apply" : "In sync with the ontology"}
      {commentCount > 0 && <span className="ml-2 text-amber-500">· {commentCount} comment{commentCount === 1 ? "" : "s"} won&apos;t be kept</span>}
    </span>
  );
}

function Banner({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  const colours = tone === "amber"
    ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
    : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400";
  return <div className={`flex flex-wrap items-center border-b px-3 py-1 text-2xs ${colours}`}>{children}</div>;
}

/** Wrapper that keys the editor by ontology, so switching ontologies starts a fresh buffer. */
export function SourceView() {
  const ontology = useStore(selectActiveOntology);
  if (!ontology) return null;
  return <SourceEditor key={ontology.id} ontology={ontology} />;
}
