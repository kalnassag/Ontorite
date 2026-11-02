/**
 * Width of a resizable side pane, clamped and remembered per device
 * (localStorage — a per-viewer convenience, so failures are ignored).
 */

import { useCallback, useState } from "react";

const readWidth = (key: string, fallback: number, min: number, max: number) => {
  try {
    const stored = Number(localStorage.getItem(key));
    return stored >= min && stored <= max ? stored : fallback;
  } catch {
    return fallback;
  }
};

export function usePaneWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidthState] = useState(() => readWidth(key, initial, min, max));
  const setWidth = useCallback((next: number) => {
    const clamped = Math.round(Math.min(max, Math.max(min, next)));
    setWidthState(clamped);
    try { localStorage.setItem(key, String(clamped)); } catch { /* private mode: width just isn't remembered */ }
  }, [key, min, max]);
  const reset = useCallback(() => setWidth(initial), [setWidth, initial]);
  return { width, setWidth, reset, min, max };
}
