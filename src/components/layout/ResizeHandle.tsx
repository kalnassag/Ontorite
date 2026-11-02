/**
 * Drag handle on a side pane's right edge (width state: usePaneWidth).
 * Double-click resets; when focused, ←/→ resize by 16 px (Shift: 64 px).
 */

import type { usePaneWidth } from "./usePaneWidth";

interface Props {
  pane: ReturnType<typeof usePaneWidth>;
  label: string;
}

export default function ResizeHandle({ pane, label }: Props) {
  const { width, setWidth, reset, min, max } = pane;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = width;
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => setWidth(startWidth + ev.clientX - startX);
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
        if (e.key === "ArrowLeft") { e.preventDefault(); setWidth(width - step); }
        if (e.key === "ArrowRight") { e.preventDefault(); setWidth(width + step); }
      }}
      className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none outline-none transition-colors hover:bg-blue-500/40 focus-visible:bg-blue-500/60 active:bg-blue-500/60"
    />
  );
}
