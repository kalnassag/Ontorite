/**
 * The main panel's top bar: ontology title + file, view tabs, and actions.
 *
 * Never clips: items wrap onto a second line when the panel is narrow, the
 * title keeps a minimum width, and tab / button labels collapse to icons
 * below a width threshold (they keep their tooltips).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, ChevronsDown, ChevronsUp, Clipboard, FileCode, FileText, GitCompare, GitFork,
  Info, Layers, Network, PanelLeftClose, PanelLeftOpen, RotateCcw, RotateCw, Share2, ShieldCheck, Users, X,
  type LucideIcon,
} from "lucide-react";
import { useStore, selectActiveOntology, selectCanUndo, selectCanRedo } from "../../lib/store";
import type { ValidationIssue } from "../../types";
import ImportExport from "../core/ImportExport";

export type ViewMode = "classes" | "individuals" | "graph" | "tree" | "entity-graph" | "diff" | "source";

const VIEWS: Array<{ mode: ViewMode; label: string; icon: LucideIcon; title: string }> = [
  { mode: "classes", label: "Classes", icon: Layers, title: "Classes view" },
  { mode: "individuals", label: "Individuals", icon: Users, title: "Individuals view" },
  { mode: "graph", label: "Graph", icon: Network, title: "Force-directed class graph" },
  { mode: "tree", label: "Tree", icon: GitFork, title: "Branching tree of the class hierarchy" },
  { mode: "entity-graph", label: "Entities", icon: Share2, title: "Entity graph view" },
  { mode: "diff", label: "Diff", icon: GitCompare, title: "Diff / merge view" },
  { mode: "source", label: "Source", icon: FileCode, title: "Edit the ontology as Turtle" },
];

/** A single-row bar is shorter than this; anything taller has wrapped. */
const ONE_ROW_MAX_PX = 60;
/** Width margin before labels come back, so the bar doesn't flicker at the edge. */
const HYSTERESIS_PX = 32;

interface Props {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  search: string;
  onSearch: (text: string) => void;
  classBrowserCollapsed: boolean;
  onToggleClassBrowser: () => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  showValidation: boolean;
  onToggleValidation: () => void;
  validationIssues: ValidationIssue[];
  unassignedCount: number;
  onShowUnassigned: () => void;
  onShowMetadata: () => void;
}

export default function TopBar(props: Props) {
  const { viewMode, onViewMode, validationIssues } = props;
  const ontology = useStore(selectActiveOntology);
  const linked = useStore((s) => s.hasFileHandle());
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore(selectCanUndo);
  const canRedo = useStore(selectCanRedo);
  const clipboard = useStore((s) => s.clipboard);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const clearClipboard = useStore((s) => s.clearClipboard);

  // Layout modes, measured rather than guessed (the available width depends on
  // the side panes):
  //   full     — labels, one row
  //   compact  — icons only, because that's what it takes to fit on one row
  //   wrapped  — even icons don't fit, so wrap onto more rows and keep labels
  //   narrow   — wrapping, and the labelled tab group alone is wider than the bar:
  //              wrap *and* use icons, so nothing is ever cut off
  const barRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"full" | "compact" | "wrapped" | "narrow">("full");
  const compact = mode === "compact" || mode === "narrow";
  const [width, setWidth] = useState(0);
  const switchedAt = useRef(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || !width) return;
    const wraps = el.offsetHeight > ONE_ROW_MAX_PX;
    const overflows = el.scrollWidth > el.clientWidth + 1;
    if (mode === "full" && (wraps || overflows)) {
      switchedAt.current = width;
      setMode("compact");
    } else if (mode === "compact" && wraps) {
      setMode("wrapped");
    } else if (mode === "wrapped" && overflows) {
      setMode("narrow");
    } else if (mode !== "full" && width > switchedAt.current + HYSTERESIS_PX) {
      setMode("full"); // grown enough: try labels on one row again (re-measured next render)
    }
    // Re-check when the width or anything that changes the bar's content changes
  }, [width, mode, clipboard, viewMode, validationIssues.length, props.unassignedCount, ontology?.metadata.ontologyLabel]);

  if (!ontology) return null;
  const errors = validationIssues.filter((i) => i.severity === "error").length;
  const individualsCount = ontology.individuals.length;
  const iconButton = "rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg";

  return (
    <div ref={barRef} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-th-border px-3 py-1.5">
      {/* Title, version and file — keeps a minimum width so it can never be squeezed away */}
      <div className="min-w-[12rem] flex-1 basis-48">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-th-fg">
          <span className="truncate" title={ontology.metadata.ontologyLabel}>{ontology.metadata.ontologyLabel}</span>
          {ontology.metadata.versionInfo && (
            <span className="flex-shrink-0 rounded bg-th-hover px-1.5 py-0.5 font-mono text-2xs font-normal text-th-fg-3">
              v{ontology.metadata.versionInfo}
            </span>
          )}
        </h2>
        <div className="flex min-w-0 items-center gap-2 text-2xs text-th-fg-3">
          <FileBadge fileName={ontology.fileName} linked={linked} />
          <span className="truncate font-mono text-th-fg-4" title={ontology.metadata.baseUri}>{ontology.metadata.baseUri}</span>
        </div>
      </div>

      <button onClick={props.onShowMetadata} className={iconButton} title="Ontology metadata">
        <Info size={14} />
      </button>

      <input
        type="search"
        placeholder="Filter…"
        title={viewMode === "individuals" ? "Filter individuals" : "Filter classes and properties by label or local name"}
        value={props.search}
        onChange={(e) => props.onSearch(e.target.value)}
        className="w-36 rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <button
        onClick={props.onToggleClassBrowser}
        className={iconButton}
        title={props.classBrowserCollapsed ? "Show class browser" : "Hide class browser"}
      >
        {props.classBrowserCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>

      {/* View tabs — never shrink: overflow-hidden would otherwise let the group squeeze
          and clip its own buttons, which the layout measurement couldn't see */}
      <div className="flex flex-shrink-0 overflow-hidden rounded border border-th-border-muted">
        {VIEWS.map(({ mode, label, icon: Icon, title }, i) => (
          <button
            key={mode}
            onClick={() => onViewMode(mode)}
            className={`flex items-center gap-1 px-2 py-1 text-2xs font-medium ${i > 0 ?"border-l border-th-border-muted" : ""} ${
              viewMode === mode ? "bg-blue-600 text-white" : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            }`}
            title={compact ? `${label} — ${title}` : title}
          >
            <Icon size={12} />
            {!compact && label}
            {mode === "individuals" && individualsCount > 0 && (
              <span className={viewMode === mode ? "text-blue-200" : "text-th-fg-4"}>({individualsCount})</span>
            )}
          </button>
        ))}
      </div>

      {(viewMode === "classes" || viewMode === "individuals") && (
        <button onClick={props.onToggleExpandAll} className={iconButton} title={props.allExpanded ? "Collapse all" : "Expand all"}>
          {props.allExpanded ? <ChevronsUp size={13} /> : <ChevronsDown size={13} />}
        </button>
      )}

      <div className="flex items-center">
        <button onClick={undo} disabled={!canUndo} className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-30`} title="Undo (Ctrl+Z)">
          <RotateCcw size={13} />
        </button>
        <button onClick={redo} disabled={!canRedo} className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-30`} title="Redo (Ctrl+Y)">
          <RotateCw size={13} />
        </button>
      </div>

      {clipboard && (
        <div className="flex items-center gap-0.5 rounded border border-purple-300 bg-purple-50 py-0.5 pl-1.5 pr-0.5 dark:border-purple-700/50 dark:bg-purple-950/40">
          <button
            onClick={() => { pasteClipboard(); onViewMode("classes"); }}
            className="flex max-w-[12rem] items-center gap-1 text-2xs text-purple-700 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-200"
            title="Paste (Ctrl+V)"
          >
            <Clipboard size={11} className="flex-shrink-0" />
            <span className="truncate">
              {clipboard.type === "class"
                ? `${clipboard.cls.labels[0]?.value || clipboard.cls.localName}${clipboard.properties.length > 0 ? ` +${clipboard.properties.length}` : ""}`
                : clipboard.property.labels[0]?.value || clipboard.property.localName}
            </span>
          </button>
          <button onClick={clearClipboard} className="ml-0.5 rounded p-0.5 text-purple-500 hover:text-purple-700 dark:hover:text-purple-300" title="Clear clipboard">
            <X size={10} />
          </button>
        </div>
      )}

      {props.unassignedCount > 0 && (
        <button
          onClick={props.onShowUnassigned}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-2xs text-amber-600 hover:bg-th-hover dark:text-amber-500"
          title={`${props.unassignedCount} unassigned properties — click to scroll`}
        >
          <AlertTriangle size={12} />
          {props.unassignedCount}
        </button>
      )}

      <button
        onClick={props.onToggleValidation}
        className={`flex items-center gap-1 rounded px-2 py-1 text-2xs font-medium ${ props.showValidation ?"bg-th-hover text-th-fg" : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
        }`}
        title="Toggle validation panel"
      >
        {errors > 0 ? (
          <AlertCircle size={12} className="text-red-500" />
        ) : validationIssues.length > 0 ? (
          <AlertTriangle size={12} className="text-amber-500" />
        ) : (
          <ShieldCheck size={12} />
        )}
        {!compact && "Validate"}
        {validationIssues.length > 0 && (
          <span className={`rounded px-1 text-2xs font-bold text-white ${errors > 0 ?"bg-red-600" : "bg-amber-600"}`}>
            {validationIssues.length}
          </span>
        )}
      </button>

      <ImportExport />
    </div>
  );
}

/** The file this ontology lives in, and whether saves write back to it. */
function FileBadge({ fileName, linked }: { fileName?: string; linked: boolean }) {
  if (!fileName) {
    return <span className="flex flex-shrink-0 items-center gap-1 italic text-th-fg-4"><FileText size={11} /> Not saved to a file</span>;
  }
  return (
    <span
      className="flex min-w-0 flex-shrink-0 items-center gap-1 text-th-fg-2"
      title={linked
        ? `Linked to ${fileName} — every change is saved back to this file`
        : `Last imported from / saved as ${fileName} — not linked, so changes aren't written to it (Save to write a copy)`}
    >
      <FileText size={11} className="flex-shrink-0" />
      <span className="max-w-[16rem] truncate font-medium">{fileName}</span>
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${linked ?"bg-emerald-500" : "bg-th-fg-4"}`} />
    </span>
  );
}
