/**
 * Drag handle on a pane's edge (width state: usePaneWidth) — the right edge of
 * a left-hand pane, or the left edge of a right-hand one (`edge="left"`).
 * Double-click resets; when focused, ←/→ move the edge by 16 px (Shift: 64 px).
 */

import type { usePaneWidth } from "./usePaneWidth";

interface Props {
  pane: ReturnType<typeof usePaneWidth>;
  label: string;
  edge?: "right" | "left";
}

export default function ResizeHandle({ pane, label, edge = "right" }: Props) {
  const { width, setWidth, reset, min, max } = pane;
  // Dragging the left edge rightwards narrows the pane
  const sign = edge === "left" ? -1 : 1;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = width;
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => setWidth(startWidth + sign * (ev.clientX - startX));
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`Drag to resize ${label} · double-click to reset`}
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === "ArrowLeft") { e.preventDefault(); setWidth(width - sign * step); }
        if (e.key === "ArrowRight") { e.preventDefault(); setWidth(width + sign * step); }
      }}
      className={`absolute inset-y-0 ${edge === "left" ? "-left-1" : "-right-1"} z-20 w-2 cursor-col-resize touch-none outline-none transition-colors hover:bg-blue-500/40 focus-visible:bg-blue-500/60 active:bg-blue-500/60`}
    />
  );
}
