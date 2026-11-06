/**
 * The right-hand pane of the split view: any view, picked here, beside the
 * main one (toggle: top bar Split, or Ctrl+\). Picking the view the main pane
 * shows swaps the two. Resizable from its left edge; width remembered per device.
 */

import type { ReactNode } from "react";
import { X } from "lucide-react";
import ResizeHandle from "./ResizeHandle";
import { usePaneWidth } from "./usePaneWidth";
import { VIEWS, type ViewMode } from "./views";

/** The main pane keeps at least this much room, whatever width was stored */
const MIN_MAIN_PX = 320;

interface Props {
  mode: ViewMode;
  primary: ViewMode;
  onPick: (mode: ViewMode) => void;
  onClose: () => void;
  children: ReactNode;
}

export default function SplitPane({ mode, primary, onPick, onClose, children }: Props) {
  const pane = usePaneWidth("pane:split", 560, 320, 1600);
  const current = VIEWS.find((v) => v.mode === mode);

  return (
    <aside
      aria-label={`Side pane: ${current?.label ?? mode}`}
      style={{ width: pane.width, maxWidth: `calc(100% - ${MIN_MAIN_PX}px)` }}
      className="relative flex min-w-0 flex-shrink-0 flex-col border-l border-th-border"
    >
      <ResizeHandle pane={pane} label="side pane" edge="left" />
      <div className="flex items-center gap-1 border-b border-th-border px-2 py-1">
        <div role="group" aria-label="Side pane view" className="flex min-w-0 flex-wrap overflow-hidden rounded border border-th-border-muted">
          {VIEWS.map(({ mode: option, label, icon: Icon, title }, i) => (
            <button
              key={option}
              onClick={() => onPick(option)}
              aria-pressed={option === mode}
              aria-label={label}
              title={option === primary ? `${label} — swap with the main pane` : `${label} — ${title}`}
              className={`flex items-center gap-1 px-1.5 py-1 text-2xs font-medium ${i > 0 ? "border-l border-th-border-muted" : ""} ${
                option === mode ? "bg-blue-600 text-white" : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
              }`}
            >
              <Icon size={12} />
              {option === mode && label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="ml-auto rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Close the side pane (Ctrl+\)" aria-label="Close the side pane">
          <X size={13} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
