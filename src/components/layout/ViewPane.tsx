/**
 * Renders one view (classes, individuals, graphs, diff, source) in a pane —
 * the main one, or the right-hand side of the split. Heavy views are
 * code-split; a failing view shows its error without taking down the app.
 */

import { lazy, Suspense, useRef, type ReactNode } from "react";
import ErrorBoundary from "./ErrorBoundary";
import ViewLoadError from "./ViewLoadError";
import { useSourceCardSync } from "./useSourceCardSync";
import { isCardsMode, type CardsMode, type ViewMode } from "./views";

const OntologyGraph = lazy(() => import("../graph/OntologyGraph"));
const EntityGraph = lazy(() => import("../graph/EntityGraph"));
const TreeGraph = lazy(() => import("../graph/TreeGraph"));
const OntologyDiff = lazy(() => import("../core/OntologyDiff"));
const SourceView = lazy(() => import("../source/SourceEditor").then((m) => ({ default: m.SourceView })));

interface Props {
  mode: ViewMode;
  /** The view's own close button (graphs) */
  onClose: () => void;
  /** In the right-hand pane: the Source editor doesn't take focus when it opens */
  embedded?: boolean;
  /** The other pane shows the Source: cards and editor follow each other */
  syncWithSource?: boolean;
  renderCards: (mode: CardsMode) => ReactNode;
}

const fallback = <div className="flex h-full items-center justify-center text-xs text-th-fg-3">Loading view…</div>;

export default function ViewPane({ mode, onClose, embedded = false, syncWithSource = false, renderCards }: Props) {
  return (
    <ErrorBoundary resetKey={mode} fallback={(error) => <div className="flex-1 overflow-auto"><ViewLoadError error={error} /></div>}>
      {isCardsMode(mode) ? (
        <CardsPane syncWithSource={syncWithSource}>{renderCards(mode)}</CardsPane>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={fallback}>
            {mode === "graph" && <OntologyGraph onClose={onClose} />}
            {mode === "tree" && <TreeGraph onClose={onClose} />}
            {mode === "entity-graph" && <EntityGraph />}
            {mode === "diff" && <OntologyDiff />}
            {mode === "source" && <SourceView embedded={embedded} />}
          </Suspense>
        </div>
      )}
    </ErrorBoundary>
  );
}

/** Cards that follow the Source editor in the other pane (lib/source-sync.ts). */
function CardsPane({ syncWithSource, children }: { syncWithSource: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onClick = useSourceCardSync(ref, syncWithSource);
  return (
    <div ref={ref} onClick={onClick} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
    </div>
  );
}
