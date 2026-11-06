/**
 * Briefly highlights a range of lines in the Source editor — the block it
 * just jumped to from the card view (see lib/source-sync.ts).
 */

import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, type Range } from "@codemirror/state";

const setHighlight = StateEffect.define<{ from: number; to: number } | null>();

const lineMark = Decoration.line({ class: "cm-revealed-block" });

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setHighlight)) continue;
      if (!effect.value) { next = Decoration.none; continue; }
      const marks: Range<Decoration>[] = [];
      const doc = tr.state.doc;
      const first = doc.lineAt(effect.value.from).number;
      const last = doc.lineAt(Math.min(effect.value.to, doc.length)).number;
      for (let n = first; n <= last; n++) marks.push(lineMark.range(doc.line(n).from));
      next = Decoration.set(marks);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const blockHighlight = [
  highlightField,
  EditorView.baseTheme({
    ".cm-revealed-block": { backgroundColor: "rgb(59 130 246 / 0.12)" },
  }),
];

const timers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>();

/** Scroll a range to the top of the editor, put the cursor there, and highlight it for a moment. */
export function revealRange(view: EditorView, from: number, to: number) {
  view.dispatch({
    selection: { anchor: from },
    effects: [setHighlight.of({ from, to }), EditorView.scrollIntoView(from, { y: "start", yMargin: 24 })],
  });
  clearTimeout(timers.get(view));
  timers.set(view, setTimeout(() => {
    if (view.dom.isConnected) view.dispatch({ effects: setHighlight.of(null) });
  }, 1600));
}
