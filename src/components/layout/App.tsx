/**
 * Root application component.
 * Layout: sidebar (ontology list) + main panel (class/property editor)
 */

import { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef, useDeferredValue } from "react";
import { useStore, selectActiveOntology, selectCanUndo, selectCanRedo, flushPendingSaves } from "../../lib/store";
import OntologyList from "./OntologyList";
import ClassCard from "../core/ClassCard";
import ClassForm from "../forms/ClassForm";
import UnassignedProperties from "../core/UnassignedProperties";
import OtherStatements from "../core/OtherStatements";
import ImportExport from "../core/ImportExport";
import IndividualCard from "../core/IndividualCard";
import ValidationPanel from "../core/ValidationPanel";
import ClassBrowserPanel from "./ClassBrowserPanel";
import Toast from "./Toast";
import KeyboardHelp from "./KeyboardHelp";
import { validate } from "../../lib/validation";
import { propertiesByDomain as propertiesByDomainOf, unassignedProperties } from "../../lib/selectors";
import type { OntologyProperty } from "../../types";
import {
  Plus, Sun, Moon, Network, ChevronsDown, ChevronsUp, Layers, Users,
  ShieldCheck, Share2, PanelLeftClose, PanelLeftOpen, Clipboard, X,
  GitCompare, AlertCircle, AlertTriangle, RotateCcw, RotateCw, HelpCircle,
  Info, GitFork,
} from "lucide-react";
import OntologyMetadataDrawer from "../dialogs/OntologyMetadataDrawer";

// Heavy views are code-split: most sessions start (and stay) in the class list.
const OntologyGraph = lazy(() => import("../graph/OntologyGraph"));
const EntityGraph = lazy(() => import("../graph/EntityGraph"));
const TreeGraph = lazy(() => import("../graph/TreeGraph"));
const OntologyDiff = lazy(() => import("../core/OntologyDiff"));

const viewFallback = (
  <div className="flex h-full items-center justify-center text-xs text-th-fg-3">Loading view…</div>
);

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return true; // default dark
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

type ViewMode = "classes" | "individuals" | "graph" | "tree" | "entity-graph" | "diff";

export default function App() {
  const init = useStore((s) => s.init);
  const initialized = useStore((s) => s.initialized);
  const activeOntology = useStore(selectActiveOntology);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore(selectCanUndo);
  const canRedo = useStore(selectCanRedo);
  const clipboard = useStore((s) => s.clipboard);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const clearClipboard = useStore((s) => s.clearClipboard);
  const saveToFile = useStore((s) => s.saveToFile);
  // U7: Import warnings in main panel
  const importWarnings = useStore((s) => s.importWarnings);
  const clearImportWarnings = useStore((s) => s.clearImportWarnings);

  const [addingClass, setAddingClass] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("classes");
  const [allExpanded, setAllExpanded] = useState(true);
  const [expandKey, setExpandKey] = useState(0); // forces re-render of cards with new default
  const [showValidation, setShowValidation] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [highlightedClassId, setHighlightedClassId] = useState<string | null>(null);
  const [classBrowserCollapsed, setClassBrowserCollapsed] = useState(() => {
    return localStorage.getItem("classBrowserCollapsed") === "true";
  });
  // U2: Toast for undo after delete
  const [toast, setToast] = useState<{ message: string; action?: () => void } | null>(null);
  // Ctrl+Shift+N: open the add-property form on a class card
  const [addPropertyRequest, setAddPropertyRequest] = useState<{ classId: string; n: number } | null>(null);
  // U9: Keyboard shortcut help overlay
  const [showHelp, setShowHelp] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const theme = useTheme();
  const selectedClassIdRef = useRef(selectedClassId);
  selectedClassIdRef.current = selectedClassId;

  // U8: Ref for scrolling to unassigned properties
  const unassignedRef = useRef<HTMLDivElement>(null);
  const otherStatementsRef = useRef<HTMLDivElement>(null);

  const toggleClassBrowser = useCallback(() => {
    setClassBrowserCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("classBrowserCollapsed", String(next));
      return next;
    });
  }, []);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (!highlightedClassId) return;
    const t = setTimeout(() => setHighlightedClassId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightedClassId]);

  // U7: Auto-dismiss import warnings after 30 seconds
  useEffect(() => {
    if (importWarnings.length === 0) return;
    const t = setTimeout(() => clearImportWarnings(), 30000);
    return () => clearTimeout(t);
  }, [importWarnings.length, clearImportWarnings]);

  // U2: Toast helper
  const showToast = useCallback((message: string, action?: () => void) => {
    setToast({ message, action });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // Global keyboard shortcuts. Undo/redo/new/paste are left to the browser
  // while typing in a field, so native text undo keeps working.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        saveToFile();
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (key === "n" && e.shiftKey) {
        e.preventDefault();
        const classId = selectedClassIdRef.current;
        if (!classId) {
          showToast("Select a class in the class browser first");
          return;
        }
        setViewMode("classes");
        setHighlightedClassId(classId);
        setAddPropertyRequest((prev) => ({ classId, n: (prev?.n ?? 0) + 1 }));
      } else if (key === "n") {
        e.preventDefault();
        setAddingClass(true);
        setViewMode("classes");
      } else if (key === "v" && clipboard) {
        e.preventDefault();
        pasteClipboard();
        setViewMode("classes");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, clipboard, pasteClipboard, saveToFile, showToast]);

  // Write any debounced saves before the tab is hidden or closed.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") void flushPendingSaves(); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  const toggleExpandAll = useCallback(() => {
    setAllExpanded((prev) => {
      const next = !prev;
      setExpandKey((k) => k + 1);
      return next;
    });
  }, []);

  const handleEntityDeleted = useCallback(
    (label: string) => showToast(`"${label}" deleted`, undo),
    [showToast, undo],
  );

  // Per-class property lists are kept referentially stable across edits, so the
  // memoised ClassCards only re-render when their own properties change.
  const prevPropertiesByDomain = useRef(new Map<string, OntologyProperty[]>());
  const propertiesByDomain = useMemo(() => {
    const next = activeOntology ? propertiesByDomainOf(activeOntology) : new Map<string, OntologyProperty[]>();
    for (const [classId, list] of next) {
      const prev = prevPropertiesByDomain.current.get(classId);
      if (prev && prev.length === list.length && prev.every((p, i) => p === list[i])) next.set(classId, prev);
    }
    prevPropertiesByDomain.current = next;
    return next;
  }, [activeOntology?.classes, activeOntology?.properties]); // eslint-disable-line react-hooks/exhaustive-deps -- only these two arrays feed the grouping

  // U4: Auto-running validation
  const validationIssues = useMemo(
    () => (activeOntology ? validate(activeOntology) : []),
    [activeOntology]
  );

  // One per subject block in the Other statements panel (blank nodes nested in
  // another statement don't get their own block)
  const otherStatementCount = useMemo(() => {
    const triples = activeOntology?.unmappedTriples ?? [];
    const referenced = new Set(triples.filter((t) => !t.isLiteral).map((t) => t.object));
    return new Set(triples.filter((t) => !t.subject.startsWith("_:") || !referenced.has(t.subject)).map((t) => t.subject)).size;
  }, [activeOntology?.unmappedTriples]);

  const unassignedCount = useMemo(
    () => (activeOntology ? unassignedProperties(activeOntology).length : 0),
    [activeOntology],
  );

  // Filtering/sorting runs against a deferred copy of the query so typing stays
  // responsive on large ontologies.
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const sortedClasses = useMemo(() => {
    const classes = activeOntology?.classes ?? [];
    // A class matches on its own labels/local name or on any property nested under it
    const hit = (localName: string, labels: { value: string }[]) =>
      localName.toLowerCase().includes(deferredSearch) ||
      labels.some((l) => l.value.toLowerCase().includes(deferredSearch));
    const matches = deferredSearch
      ? classes.filter((cls) =>
          hit(cls.localName, cls.labels) ||
          (propertiesByDomain.get(cls.id) ?? []).some((p) => hit(p.localName, p.labels)))
      : classes;
    return [...matches].sort((a, b) => a.localName.localeCompare(b.localName));
  }, [activeOntology?.classes, propertiesByDomain, deferredSearch]);
  const sortedIndividuals = useMemo(() => {
    const individuals = activeOntology?.individuals ?? [];
    const matches = deferredSearch
      ? individuals.filter((ind) =>
          ind.localName.toLowerCase().includes(deferredSearch) || ind.uri.toLowerCase().includes(deferredSearch))
      : individuals;
    return [...matches].sort((a, b) => a.localName.localeCompare(b.localName));
  }, [activeOntology?.individuals, deferredSearch]);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-th-base">
        <p className="text-sm text-th-fg-3">Loading…</p>
      </div>
    );
  }

  const classes = activeOntology?.classes ?? [];
  const individuals = activeOntology?.individuals ?? [];

  // Validation icon for U4
  const hasErrors = validationIssues.some(i => i.severity === "error");
  const hasWarnings = validationIssues.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-th-base font-sans text-th-fg">
      {/* Panel 1: Ontology list */}
      <aside className="flex w-48 flex-shrink-0 flex-col border-r border-th-border">
        <div className="flex items-center gap-2 border-b border-th-border px-3 py-2.5">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <h1 className="text-xs font-semibold tracking-tight text-th-fg-2">
            Ontorite
          </h1>
          {/* U9: Keyboard help button */}
          <button
            onClick={() => setShowHelp(v => !v)}
            className="ml-auto rounded p-1 text-th-fg-3 hover:text-th-fg"
            title="Keyboard shortcuts"
          >
            <HelpCircle size={13} />
          </button>
          <button
            onClick={theme.toggle}
            className="rounded p-1 text-th-fg-3 hover:text-th-fg"
            title={theme.dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme.dark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <OntologyList />
        </div>
      </aside>

      {/* U9: Keyboard help overlay */}
      {showHelp && <KeyboardHelp onClose={() => setShowHelp(false)} />}

      {/* Panel 2: Class browser (only when an ontology is loaded) */}
      {activeOntology && !classBrowserCollapsed && (
        <aside className="flex w-60 flex-shrink-0 flex-col border-r border-th-border">
          <ClassBrowserPanel
            onSelectClass={setSelectedClassId}
            onDoubleClickClass={(id) => {
              setViewMode("classes");
              setHighlightedClassId(id);
            }}
            selectedClassId={selectedClassId}
          />
        </aside>
      )}

      {/* Main panel */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeOntology ? (
          <>
            {/* Top bar */}
            <div className="flex items-center gap-2 border-b border-th-border px-4 py-2">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 truncate text-sm font-semibold text-th-fg">
                  <span className="truncate">{activeOntology.metadata.ontologyLabel}</span>
                  {activeOntology.metadata.versionInfo && (
                    <span className="rounded bg-th-input px-1.5 py-0.5 font-mono text-2xs font-normal text-th-fg-3">
                      v{activeOntology.metadata.versionInfo}
                    </span>
                  )}
                </h2>
                <p className="truncate font-mono text-2xs text-th-fg-3">
                  {activeOntology.metadata.baseUri}
                </p>
              </div>
              <button
                onClick={() => setShowMetadata(true)}
                className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                title="Ontology metadata"
              >
                <Info size={14} />
              </button>

              {/* Search */}
              <input
                type="search"
                placeholder="Filter…"
                title={viewMode === "individuals" ? "Filter individuals" : "Filter classes and properties by label or local name"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-40 rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* Class browser toggle */}
              <button
                onClick={toggleClassBrowser}
                className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                title={classBrowserCollapsed ? "Show class browser" : "Hide class browser"}
              >
                {classBrowserCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              </button>

              {/* View mode tabs */}
              <div className="flex rounded border border-th-border-muted">
                <button
                  onClick={() => setViewMode("classes")}
                  className={`flex items-center gap-1 rounded-l px-2 py-1 text-2xs font-medium ${
                    viewMode === "classes"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Classes view"
                >
                  <Layers size={12} />
                  Classes
                </button>
                <button
                  onClick={() => setViewMode("individuals")}
                  className={`flex items-center gap-1 border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "individuals"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Individuals view"
                >
                  <Users size={12} />
                  Individuals
                  {individuals.length > 0 && (
                    <span className={`ml-0.5 text-2xs ${
                      viewMode === "individuals" ? "text-blue-200" : "text-th-fg-4"
                    }`}>
                      ({individuals.length})
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setViewMode("graph")}
                  className={`flex items-center gap-1 border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "graph"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Force-directed class graph"
                >
                  <Network size={12} />
                  Graph
                </button>
                <button
                  onClick={() => setViewMode("tree")}
                  className={`flex items-center gap-1 border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "tree"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Branching tree of the class hierarchy"
                >
                  <GitFork size={12} />
                  Tree
                </button>
                <button
                  onClick={() => setViewMode("entity-graph")}
                  className={`flex items-center gap-1 border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "entity-graph"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Entity graph view"
                >
                  <Share2 size={12} />
                  Entities
                </button>
                <button
                  onClick={() => setViewMode("diff")}
                  className={`flex items-center gap-1 rounded-r border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "diff"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Diff / merge view"
                >
                  <GitCompare size={12} />
                  Diff
                </button>
              </div>

              {/* Expand/Collapse all (only in classes or individuals view) */}
              {viewMode !== "graph" && viewMode !== "entity-graph" && viewMode !== "diff" && (
                <button
                  onClick={toggleExpandAll}
                  className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  title={allExpanded ? "Collapse all" : "Expand all"}
                >
                  {allExpanded ? <ChevronsUp size={13} /> : <ChevronsDown size={13} />}
                </button>
              )}

              {/* U3: Undo / Redo with Lucide icons */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="rounded px-1.5 py-1 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg disabled:cursor-not-allowed disabled:opacity-30"
                  title="Undo (Ctrl+Z)"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="rounded px-1.5 py-1 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg disabled:cursor-not-allowed disabled:opacity-30"
                  title="Redo (Ctrl+Y)"
                >
                  <RotateCw size={13} />
                </button>
              </div>

              {/* Clipboard indicator + paste */}
              {clipboard && (
                <div className="flex items-center gap-0.5 rounded border border-purple-700/50 bg-purple-950/40 pl-1.5 pr-0.5 py-0.5">
                  <button
                    onClick={() => { pasteClipboard(); setViewMode("classes"); }}
                    className="flex items-center gap-1 text-2xs text-purple-300 hover:text-purple-200"
                    title="Paste (Ctrl+V)"
                  >
                    <Clipboard size={11} />
                    {clipboard.type === "class"
                      ? `${clipboard.cls.labels[0]?.value || clipboard.cls.localName}${clipboard.properties.length > 0 ? ` +${clipboard.properties.length}` : ""}`
                      : (clipboard.property.labels[0]?.value || clipboard.property.localName)}
                  </button>
                  <button
                    onClick={clearClipboard}
                    className="ml-0.5 rounded p-0.5 text-purple-500 hover:text-purple-300"
                    title="Clear clipboard"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}

              {/* U8: Unassigned badge */}
              {unassignedCount > 0 && (
                <button
                  onClick={() => unassignedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-2xs text-amber-500 hover:bg-th-hover"
                  title={`${unassignedCount} unassigned properties — click to scroll`}
                >
                  <AlertTriangle size={12} />
                  {unassignedCount}
                </button>
              )}

              {/* U4: Validate button with auto badge */}
              <button
                onClick={() => setShowValidation((v) => !v)}
                className={`relative flex items-center gap-1 rounded px-2 py-1 text-2xs font-medium ${
                  showValidation
                    ? "bg-th-hover text-th-fg"
                    : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                }`}
                title="Toggle validation panel"
              >
                {hasErrors ? (
                  <AlertCircle size={12} className="text-red-400" />
                ) : hasWarnings ? (
                  <AlertTriangle size={12} className="text-amber-400" />
                ) : (
                  <ShieldCheck size={12} />
                )}
                Validate
                {validationIssues.length > 0 && (
                  <span className={`ml-0.5 rounded px-1 text-2xs font-bold ${hasErrors ? "bg-red-700 text-white" : "bg-amber-700 text-white"}`}>
                    {validationIssues.length}
                  </span>
                )}
              </button>

              <ImportExport />
            </div>

            {/* Validation panel */}
            {showValidation && activeOntology && (
              <ValidationPanel
                issues={validationIssues}
                onClose={() => setShowValidation(false)}
              />
            )}

            {/* U7: Import warnings banner in main panel */}
            {importWarnings.length > 0 && (
              <div className="border-b border-amber-600/40 bg-amber-950/30 px-4 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
                    <div>
                      <p className="text-xs font-medium text-amber-400">Import warnings</p>
                      <ul className="mt-1 space-y-0.5">
                        {importWarnings.map((w, i) => (
                          <li key={i} className="text-xs text-amber-300/80">{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <button
                    onClick={clearImportWarnings}
                    className="flex-shrink-0 rounded p-0.5 text-th-fg-4 hover:text-th-fg"
                    title="Dismiss"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Content: graph, entity-graph, diff, classes, or individuals */}
            {viewMode === "diff" ? (
              <div className="relative flex-1 overflow-hidden">
                <Suspense fallback={viewFallback}><OntologyDiff /></Suspense>
              </div>
            ) : viewMode === "graph" ? (
              <div className="relative flex-1 overflow-hidden">
                <Suspense fallback={viewFallback}><OntologyGraph onClose={() => setViewMode("classes")} /></Suspense>
              </div>
            ) : viewMode === "tree" ? (
              <div className="relative flex-1 overflow-hidden">
                <Suspense fallback={viewFallback}><TreeGraph onClose={() => setViewMode("classes")} /></Suspense>
              </div>
            ) : viewMode === "entity-graph" ? (
              <div className="relative flex-1 overflow-hidden">
                <Suspense fallback={viewFallback}><EntityGraph /></Suspense>
              </div>
            ) : viewMode === "individuals" ? (
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="mx-auto w-full max-w-5xl">
                  {/* Stats */}
                  <div className="mb-3 flex items-center gap-3 text-2xs text-th-fg-3">
                    <span>{individuals.length} individuals</span>
                    <span>{classes.length} classes</span>
                  </div>

                  {/* Individual cards */}
                  <div className="space-y-2">
                    {sortedIndividuals.map((ind) => (
                      <IndividualCard
                        key={`${ind.id}-${expandKey}`}
                        individual={ind}
                        defaultExpanded={allExpanded}
                      />
                    ))}
                  </div>

                  {sortedIndividuals.length === 0 && (
                    <p className="mt-8 text-center text-sm text-th-fg-4">
                      {search
                        ? "No individuals match that filter."
                        : "No individuals found. Import a .ttl file with instance data to see them here."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="mx-auto w-full max-w-5xl">
                  {/* Stats */}
                  <div className="mb-3 flex items-center gap-3 text-2xs text-th-fg-3">
                    <span>{classes.length} classes</span>
                    <span>{activeOntology.properties.length} properties</span>
                    {individuals.length > 0 && (
                      <span className="text-purple-500">
                        {individuals.length} individuals
                      </span>
                    )}
                    {otherStatementCount > 0 && (
                      <button
                        onClick={() =>
                          otherStatementsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                        className="rounded hover:text-th-fg-2 hover:underline"
                        title="Statements about subjects that aren't entities of this ontology"
                      >
                        {otherStatementCount} other statement{otherStatementCount === 1 ? "" : "s"} →
                      </button>
                    )}
                  </div>

                  {/* Add class form or button */}
                  {addingClass ? (
                    <div className="mb-3">
                      <ClassForm onDone={() => setAddingClass(false)} />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingClass(true)}
                      className="mb-3 flex items-center gap-1 text-xs text-th-fg-3 hover:text-blue-400"
                    >
                      <Plus size={13} />
                      Add class
                    </button>
                  )}

                  {/* Class cards */}
                  <div className="space-y-2">
                    {sortedClasses.map((cls) => (
                      <ClassCard
                        key={`${cls.id}-${expandKey}`}
                        cls={cls}
                        properties={propertiesByDomain.get(cls.id) ?? []}
                        defaultExpanded={allExpanded}
                        highlighted={highlightedClassId === cls.id}
                        onDelete={handleEntityDeleted}
                        search={deferredSearch}
                        addPropertyRequest={addPropertyRequest?.classId === cls.id ? addPropertyRequest.n : 0}
                      />
                    ))}
                  </div>

                  {sortedClasses.length === 0 && !addingClass && (
                    <p className="mt-8 text-center text-sm text-th-fg-4">
                      {search ? "No classes match that filter." : "No classes yet. Add one above."}
                    </p>
                  )}

                  {/* U8: Unassigned properties with forwardRef */}
                  <div ref={unassignedRef}>
                    <UnassignedProperties />
                  </div>
                  <OtherStatements ref={otherStatementsRef} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-th-fg-3">Create or import an ontology to get started.</p>
              <p className="mt-1 text-2xs text-th-fg-4">Use the sidebar controls on the left.</p>
            </div>
          </div>
        )}
      </main>

      {/* U2: Undo toast */}
      {toast && (
        <Toast
          message={toast.message}
          actionLabel={toast.action ? "Undo" : undefined}
          onAction={toast.action}
          onDismiss={dismissToast}
        />
      )}

      <OntologyMetadataDrawer open={showMetadata} onClose={() => setShowMetadata(false)} />
    </div>
  );
}
