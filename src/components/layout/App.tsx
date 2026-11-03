/**
 * Root application component.
 * Layout: sidebar (ontology list) + main panel (class/property editor)
 */

import { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef, useDeferredValue } from "react";
import { useStore, selectActiveOntology, flushPendingSaves } from "../../lib/store";
import OntologyList from "./OntologyList";
import ClassCard from "../core/ClassCard";
import ClassForm from "../forms/ClassForm";
import UnassignedProperties from "../core/UnassignedProperties";
import OtherStatements from "../core/OtherStatements";
import IndividualCard from "../core/IndividualCard";
import ValidationPanel from "../core/ValidationPanel";
import ClassBrowserPanel from "./ClassBrowserPanel";
import Toast from "./Toast";
import KeyboardHelp from "./KeyboardHelp";
import TopBar, { type ViewMode } from "./TopBar";
import ResizeHandle from "./ResizeHandle";
import { usePaneWidth } from "./usePaneWidth";
import ErrorBoundary from "./ErrorBoundary";
import ViewLoadError from "./ViewLoadError";
import HoverCardHost from "../hover/HoverCardHost";
import DefinitionDrawer from "../hover/DefinitionDrawer";
import { useReferences } from "../../lib/references/reference-store";
import { validate } from "../../lib/validation";
import { propertiesByDomain as propertiesByDomainOf, unassignedProperties } from "../../lib/selectors";
import type { OntologyProperty } from "../../types";
import { Plus, Sun, Moon, X, AlertTriangle, HelpCircle } from "lucide-react";
import OntologyMetadataDrawer from "../dialogs/OntologyMetadataDrawer";

// Heavy views are code-split: most sessions start (and stay) in the class list.
const OntologyGraph = lazy(() => import("../graph/OntologyGraph"));
const EntityGraph = lazy(() => import("../graph/EntityGraph"));
const TreeGraph = lazy(() => import("../graph/TreeGraph"));
const OntologyDiff = lazy(() => import("../core/OntologyDiff"));
const SourceView = lazy(() => import("../source/SourceEditor").then((m) => ({ default: m.SourceView })));

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


export default function App() {
  const init = useStore((s) => s.init);
  const initialized = useStore((s) => s.initialized);
  const activeOntology = useStore(selectActiveOntology);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const clipboard = useStore((s) => s.clipboard);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
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
  // Side panes are resizable; widths are remembered per device
  const ontologyPane = usePaneWidth("pane:ontologies", 192, 140, 420);
  const browserPane = usePaneWidth("pane:classBrowser", 240, 160, 560);
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
  // Cached external ontologies (imports, dcat, …) for term definitions
  useEffect(() => { void useReferences.getState().init(); }, []);

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
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.defaultPrevented) return;
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


  return (
    <div className="flex h-screen overflow-hidden bg-th-base font-sans text-th-fg">
      {/* Panel 1: Ontology list */}
      <aside style={{ width: ontologyPane.width }} className="relative flex flex-shrink-0 flex-col border-r border-th-border">
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
        <ResizeHandle pane={ontologyPane} label="ontology list" />
      </aside>

      {/* U9: Keyboard help overlay */}
      {showHelp && <KeyboardHelp onClose={() => setShowHelp(false)} />}

      {/* Panel 2: Class browser (only when an ontology is loaded) */}
      {activeOntology && !classBrowserCollapsed && (
        <aside style={{ width: browserPane.width }} className="relative flex flex-shrink-0 flex-col border-r border-th-border">
          <ClassBrowserPanel
            onSelectClass={setSelectedClassId}
            onDoubleClickClass={(id) => {
              setViewMode("classes");
              setHighlightedClassId(id);
            }}
            selectedClassId={selectedClassId}
          />
          <ResizeHandle pane={browserPane} label="class browser" />
        </aside>
      )}

      {/* Main panel */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeOntology ? (
          <>
            <TopBar
              viewMode={viewMode}
              onViewMode={setViewMode}
              search={search}
              onSearch={setSearch}
              classBrowserCollapsed={classBrowserCollapsed}
              onToggleClassBrowser={toggleClassBrowser}
              allExpanded={allExpanded}
              onToggleExpandAll={toggleExpandAll}
              showValidation={showValidation}
              onToggleValidation={() => setShowValidation((v) => !v)}
              validationIssues={validationIssues}
              unassignedCount={unassignedCount}
              onShowUnassigned={() => unassignedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              onShowMetadata={() => setShowMetadata(true)}
            />

            {/* Validation panel */}
            {showValidation && activeOntology && (
              <ValidationPanel
                issues={validationIssues}
                onClose={() => setShowValidation(false)}
              />
            )}

            {/* U7: Import warnings banner in main panel */}
            {importWarnings.length > 0 && (
              <div className="border-b border-amber-600/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Import warnings</p>
                      <ul className="mt-1 space-y-0.5">
                        {importWarnings.map((w, i) => (
                          <li key={i} className="text-xs text-amber-800 dark:text-amber-300/80">{w}</li>
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

            {/* Content: graph, entity-graph, diff, source, classes, or individuals — a failing view doesn't take down the app */}
            <ErrorBoundary resetKey={viewMode} fallback={(error) => <div className="flex-1 overflow-auto"><ViewLoadError error={error} /></div>}>
            {viewMode === "diff" ? (
              <div className="relative flex-1 overflow-hidden">
                <Suspense fallback={viewFallback}><OntologyDiff /></Suspense>
              </div>
            ) : viewMode === "graph" ? (
              <div className="relative flex-1 overflow-hidden">
                <Suspense fallback={viewFallback}><OntologyGraph onClose={() => setViewMode("classes")} /></Suspense>
              </div>
            ) : viewMode === "source" ? (
              <div className="relative flex-1 overflow-hidden">
                <Suspense fallback={viewFallback}><SourceView /></Suspense>
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
            </ErrorBoundary>
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
      {/* The one hover card for class / property names anywhere in the app */}
      <HoverCardHost />
      <DefinitionDrawer />
    </div>
  );
}
