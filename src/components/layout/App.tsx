/**
 * Root application component.
 * Layout: sidebar (ontology list) + main panel (class/property editor)
 */

import { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useStore, selectActiveOntology, flushPendingSaves } from "../../lib/store";
import OntologyList from "./OntologyList";
import ClassesView from "../core/ClassesView";
import IndividualsView from "../core/IndividualsView";
import ValidationPanel from "../core/ValidationPanel";
import ClassBrowserPanel from "./ClassBrowserPanel";
import Toast from "./Toast";
import KeyboardHelp from "./KeyboardHelp";
import TopBar from "./TopBar";
import ResizeHandle from "./ResizeHandle";
import { usePaneWidth } from "./usePaneWidth";
import SplitPane from "./SplitPane";
import ViewPane from "./ViewPane";
import { isCardsMode, type CardsMode } from "./views";
import { usePaneViews } from "./usePaneViews";
import { useSourceSync } from "../../lib/source-sync";
import HoverCardHost from "../hover/HoverCardHost";
import DefinitionDrawer from "../hover/DefinitionDrawer";
import { useReferences } from "../../lib/references/reference-store";
import { validate } from "../../lib/validation";
import { unassignedProperties } from "../../lib/selectors";
import { Sun, Moon, X, AlertTriangle, HelpCircle, Settings } from "lucide-react";
import { applyDisplaySettings, openSettings, useSettings } from "../../lib/settings";
import OntologyMetadataDrawer from "../dialogs/OntologyMetadataDrawer";

const SettingsDrawer = lazy(() => import("../settings/SettingsDrawer"));

/** Apply display settings (theme, text size, contrast, motion) and follow the OS theme when asked. */
function useDisplaySettings() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => applyDisplaySettings(settings, systemDark), [settings, systemDark]);

  const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);
  return { dark, toggle: () => update({ theme: dark ? "light" : "dark" }) };
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
  const views = usePaneViews();
  const { primary: viewMode, secondary: sideView, selectView: setViewMode, showView, toggleSplit } = views;
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
  const theme = useDisplaySettings();
  const settingsOpen = useSettings((s) => s.openTab !== null);
  // Side panes are resizable; widths are remembered per device
  const ontologyPane = usePaneWidth("pane:ontologies", 192, 140, 420);
  const browserPane = usePaneWidth("pane:classBrowser", 240, 160, 560);
  const selectedClassIdRef = useRef(selectedClassId);
  selectedClassIdRef.current = selectedClassId;

  // U8: Ref for scrolling to unassigned properties
  const unassignedRef = useRef<HTMLDivElement>(null);
  const otherStatementsRef = useRef<HTMLDivElement>(null);

  // Selecting a class in the class browser shows it in the Source pane too
  const sourceVisible = views.isVisible("source");
  useEffect(() => {
    if (!sourceVisible || !selectedClassId) return;
    const uri = activeOntology?.classes.find((c) => c.id === selectedClassId)?.uri;
    if (uri) useSourceSync.getState().revealInSource(uri);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on selection only, not on every edit
  }, [selectedClassId, sourceVisible]);

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
      if (key === "\\") {
        // Ctrl+\: open / close the side pane
        e.preventDefault();
        toggleSplit();
        return;
      }
      if (key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }
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
        showView("classes");
        setHighlightedClassId(classId);
        setAddPropertyRequest((prev) => ({ classId, n: (prev?.n ?? 0) + 1 }));
      } else if (key === "n") {
        e.preventDefault();
        setAddingClass(true);
        showView("classes");
      } else if (key === "v" && clipboard) {
        e.preventDefault();
        pasteClipboard();
        showView("classes");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, clipboard, pasteClipboard, saveToFile, showToast, showView, toggleSplit]);

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

  // U4: Auto-running validation
  const validationIssues = useMemo(
    () => (activeOntology ? validate(activeOntology) : []),
    [activeOntology]
  );

  const unassignedCount = useMemo(
    () => (activeOntology ? unassignedProperties(activeOntology).length : 0),
    [activeOntology],
  );

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-th-base">
        <p className="text-sm text-th-fg-3">Loading…</p>
      </div>
    );
  }

  const renderCards = (mode: CardsMode) => mode === "classes" ? (
    <ClassesView
      search={search}
      allExpanded={allExpanded}
      expandKey={expandKey}
      highlightedClassId={highlightedClassId}
      addingClass={addingClass}
      setAddingClass={setAddingClass}
      addPropertyRequest={addPropertyRequest}
      onDelete={handleEntityDeleted}
      unassignedRef={unassignedRef}
      otherStatementsRef={otherStatementsRef}
    />
  ) : (
    <IndividualsView search={search} allExpanded={allExpanded} expandKey={expandKey} />
  );

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
            aria-label="Keyboard shortcuts"
          >
            <HelpCircle size={13} />
          </button>
          <button
            onClick={theme.toggle}
            className="rounded p-1 text-th-fg-3 hover:text-th-fg"
            title={theme.dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme.dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme.dark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            onClick={() => openSettings()}
            className="rounded p-1 text-th-fg-3 hover:text-th-fg"
            title="Settings (Ctrl+,)"
            aria-label="Settings"
          >
            <Settings size={13} />
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
              showView("classes");
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
              splitOpen={sideView !== null}
              onToggleSplit={toggleSplit}
              cardsVisible={isCardsMode(viewMode) || isCardsMode(sideView)}
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

            {/* The main view, and optionally any other view beside it (split) */}
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <ViewPane
                  mode={viewMode}
                  onClose={() => setViewMode("classes")}
                  syncWithSource={sideView === "source"}
                  renderCards={renderCards}
                />
              </div>
              {sideView && (
                <SplitPane mode={sideView} primary={viewMode} onPick={views.pickSecondary} onClose={views.closeSplit}>
                  <ViewPane
                    mode={sideView}
                    embedded
                    onClose={views.closeSplit}
                    syncWithSource={viewMode === "source"}
                    renderCards={renderCards}
                  />
                </SplitPane>
              )}
            </div>
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
      {settingsOpen && <Suspense fallback={null}><SettingsDrawer /></Suspense>}
    </div>
  );
}
