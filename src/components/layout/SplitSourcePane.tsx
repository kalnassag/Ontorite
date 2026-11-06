/**
 * The Source editor beside the class / individual view (toggle: top bar
 * button or Ctrl+\). Resizable from its left edge; width remembered per device.
 * The two panes follow each other via lib/source-sync.ts.
 */

import { lazy, Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary";
import ViewLoadError from "./ViewLoadError";
import ResizeHandle from "./ResizeHandle";
import { usePaneWidth } from "./usePaneWidth";

const SourceView = lazy(() => import("../source/SourceEditor").then((m) => ({ default: m.SourceView })));

/** The card view keeps at least this much room, whatever width was stored */
const MIN_CARDS_PX = 320;

export default function SplitSourcePane({ onClose }: { onClose: () => void }) {
  const pane = usePaneWidth("pane:splitSource", 560, 320, 1600);
  return (
    <aside
      aria-label="Turtle source"
      style={{ width: pane.width, maxWidth: `calc(100% - ${MIN_CARDS_PX}px)` }}
      className="relative flex min-w-0 flex-shrink-0 flex-col border-l border-th-border"
    >
      <ResizeHandle pane={pane} label="source pane" edge="left" />
      <ErrorBoundary fallback={(error) => <div className="flex-1 overflow-auto"><ViewLoadError error={error} /></div>}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-th-fg-3">Loading editor…</div>}>
          <SourceView split={{ onClose }} />
        </Suspense>
      </ErrorBoundary>
    </aside>
  );
}
