/**
 * Which view each pane shows: the main pane (top bar tabs) and, when the
 * split is open, the side pane (its own picker). A view is never in both:
 * choosing the other pane's view swaps them. The side pane's view and
 * whether it's open are remembered per device.
 */

import { useCallback, useRef, useState } from "react";
import type { ViewMode } from "./views";

const OPEN_KEY = "split:view";
const LAST_KEY = "split:last";
const MODES: ViewMode[] = ["classes", "individuals", "graph", "tree", "entity-graph", "diff", "source"];

const read = (key: string): ViewMode | null => {
  try {
    const value = localStorage.getItem(key);
    if (value && (MODES as string[]).includes(value)) return value as ViewMode;
    // Before any view could go in the side pane, only Source could
    if (key === OPEN_KEY && localStorage.getItem("splitSource") === "true") return "source";
  } catch { /* storage unavailable */ }
  return null;
};
const write = (key: string, value: ViewMode | null) => {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* not remembered */ }
};

export function usePaneViews() {
  const [primary, setPrimary] = useState<ViewMode>("classes");
  const [secondary, setSecondaryState] = useState<ViewMode | null>(() => {
    const stored = read(OPEN_KEY);
    return stored === "classes" ? "source" : stored; // the main pane starts on Classes
  });
  const latest = useRef({ primary, secondary });
  latest.current = { primary, secondary };

  const setSecondary = useCallback((mode: ViewMode | null) => {
    setSecondaryState(mode);
    write(OPEN_KEY, mode);
    if (mode) write(LAST_KEY, mode);
  }, []);

  /** Main pane (top bar tab). Taking the side pane's view swaps the two. */
  const selectView = useCallback((mode: ViewMode) => {
    const { primary: current, secondary: side } = latest.current;
    if (mode === current) return;
    if (side === mode) setSecondary(current);
    setPrimary(mode);
  }, [setSecondary]);

  /** Side pane (its picker). Taking the main pane's view swaps the two. */
  const pickSecondary = useCallback((mode: ViewMode) => {
    const { primary: current, secondary: side } = latest.current;
    if (mode === side) return;
    if (mode === current && side) setPrimary(side);
    setSecondary(mode);
  }, [setSecondary]);

  const openSplit = useCallback(() => {
    const { primary: current } = latest.current;
    const last = read(LAST_KEY) ?? "source";
    setSecondary(last !== current ? last : current === "source" ? "classes" : "source");
  }, [setSecondary]);

  const closeSplit = useCallback(() => setSecondary(null), [setSecondary]);

  const toggleSplit = useCallback(() => {
    if (latest.current.secondary) closeSplit();
    else openSplit();
  }, [openSplit, closeSplit]);

  /** Make sure a view is visible (in either pane), e.g. Classes for Ctrl+N. */
  const showView = useCallback((mode: ViewMode) => {
    const { primary: current, secondary: side } = latest.current;
    if (current !== mode && side !== mode) selectView(mode);
  }, [selectView]);

  const isVisible = (mode: ViewMode) => primary === mode || secondary === mode;

  return { primary, secondary, selectView, pickSecondary, toggleSplit, closeSplit, showView, isVisible };
}
