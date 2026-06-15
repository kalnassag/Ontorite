/**
 * Sidebar: list of saved ontologies with create/import/delete controls.
 */

import { useRef, useState } from "react";
import { Plus, Upload, Trash2, ChevronRight, X, Globe, BookOpen, Check } from "lucide-react";
import { useStore } from "../../lib/store";
import { supportsFileSystemAccess, openTurtleFile } from "../../lib/file-access";
import { COMMON_ONTOLOGIES } from "../../lib/common-ontologies";

interface NewOntologyForm {
  label: string;
  baseUri: string;
}

export default function OntologyList() {
  const ontologies = useStore((s) => s.ontologies);
  const activeOntologyId = useStore((s) => s.activeOntologyId);
  const setActiveOntology = useStore((s) => s.setActiveOntology);
  const createOntology = useStore((s) => s.createOntology);
  const deleteOntology = useStore((s) => s.deleteOntology);
  const importOntology = useStore((s) => s.importOntology);
  const importOntologyAsync = useStore((s) => s.importOntologyAsync);
  const importOntologyWithHandle = useStore((s) => s.importOntologyWithHandle);

  // Import warnings have been moved to the main panel in App.tsx

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewOntologyForm>({ label: "", baseUri: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [importingUrl, setImportingUrl] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlError, setUrlError] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [loadedLibraryIds, setLoadedLibraryIds] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!form.label.trim()) return;
    createOntology({
      ontologyLabel: form.label.trim(),
      baseUri: form.baseUri.trim() || `http://example.org/${form.label.toLowerCase().replace(/\s+/g, "-")}/`,
    });
    setForm({ label: "", baseUri: "" });
    setCreating(false);
  };

  const handleImport = async () => {
    setImportError("");
    // Try the File System Access API first (Chrome/Edge) — gives us a writable handle
    if (supportsFileSystemAccess()) {
      try {
        const result = await openTurtleFile();
        if (!result) return; // user cancelled
        const id = importOntologyWithHandle(result.text, result.fileName, result.handle);
        if (import.meta.env.DEV) console.log("[import] success with file handle, ontology id:", id);
        return;
      } catch (err) {
        console.error("[import] File System Access API failed, falling back:", err);
      }
    }

    // Fallback: classic <input type="file">
    fileRef.current?.click();
  };

  const handleUrlImport = async () => {
    const url = urlValue.trim();
    if (!url) return;
    setUrlError("");
    setUrlLoading(true);
    try {
      const response = await fetch(url, { headers: { Accept: "text/turtle, application/ld+json, application/rdf+xml, application/n-triples, */*" } });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const text = await response.text();
      const fileName = url.split("/").pop() || "imported.ttl";
      await importOntologyAsync(text, fileName);
      setUrlValue("");
      setImportingUrl(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUrlError(msg.includes("Failed to fetch") ? `CORS error — the server at ${new URL(urlValue).hostname} does not allow cross-origin requests` : msg);
    } finally {
      setUrlLoading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result;
        if (typeof text === "string") {
          const id = await importOntologyAsync(text, file.name);
          if (import.meta.env.DEV) console.log("[import] success (no file handle), ontology id:", id);
        } else {
          console.error("[import] FileReader result was not a string");
        }
      } catch (err) {
        console.error("[import] error during import:", err);
        setImportError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.onerror = () => {
      console.error("[import] FileReader error");
      setImportError("Import failed: could not read the file.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex h-full flex-col">
      {/* Action bar */}
      <div className="flex items-center gap-0.5 border-b border-th-border-muted px-2 py-2">
        <button
          onClick={() => setCreating((c) => !c)}
          className="rounded p-1.5 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          title="New ontology"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={handleImport}
          className="rounded p-1.5 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          title="Import .ttl file"
        >
          <Upload size={13} />
        </button>
        <button
          onClick={() => { setShowLibrary((v) => !v); setImportingUrl(false); }}
          className="rounded p-1.5 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          title="Common ontology library"
        >
          <BookOpen size={13} />
        </button>
        <button
          onClick={() => { setImportingUrl((v) => !v); setUrlError(""); }}
          className="rounded p-1.5 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          title="Import from URL"
        >
          <Globe size={13} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ttl,.n3,.turtle,.jsonld,.json,.rdf,.xml,.owl,.nt"
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {/* Inline import error (E4) */}
      {importError && (
        <p className="text-2xs text-red-400 px-2 py-1">{importError}</p>
      )}

      {/* URL import form */}
      {importingUrl && (
        <div className="border-b border-th-border-muted p-2 space-y-1.5">
          <input
            type="url"
            placeholder="https://example.org/ontology.ttl"
            value={urlValue}
            onChange={(e) => { setUrlValue(e.target.value); setUrlError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleUrlImport(); if (e.key === "Escape") setImportingUrl(false); }}
            autoFocus
            className="w-full rounded bg-th-input px-2 py-1 font-mono text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {urlError && (
            <p className="text-2xs text-red-400">{urlError}</p>
          )}
          <div className="flex gap-1">
            <button
              onClick={handleUrlImport}
              disabled={urlLoading || !urlValue.trim()}
              className="rounded bg-blue-600 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {urlLoading ? "Fetching…" : "Fetch & Import"}
            </button>
            <button
              onClick={() => setImportingUrl(false)}
              className="rounded bg-th-hover px-2 py-0.5 text-2xs text-th-fg-2 hover:bg-th-border"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New ontology form */}
      {creating && (
        <div className="border-b border-th-border-muted p-2 space-y-1.5">
          <input
            type="text"
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            autoFocus
            className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Base URI (optional)"
            value={form.baseUri}
            onChange={(e) => setForm((f) => ({ ...f, baseUri: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            className="w-full rounded bg-th-input px-2 py-1 font-mono text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-1">
            <button
              onClick={handleCreate}
              className="rounded bg-blue-600 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-500"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded bg-th-hover px-2 py-0.5 text-2xs text-th-fg-2 hover:bg-th-border"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Common ontology library */}
      {showLibrary && (
        <div className="border-b border-th-border-muted bg-th-base">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-th-fg-3">Common Ontologies</span>
            <button onClick={() => setShowLibrary(false)} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"><X size={11} /></button>
          </div>
          {COMMON_ONTOLOGIES.map((onto) => (
            <div key={onto.id} className="border-t border-th-border-muted px-2 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-th-fg">{onto.name}</div>
                  <div className="text-2xs text-th-fg-4 leading-snug mt-0.5">{onto.description}</div>
                </div>
                {loadedLibraryIds.has(onto.id) ? (
                  <span className="flex flex-shrink-0 items-center gap-1 text-2xs text-green-400">
                    <Check size={11} /> Loaded
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      importOntology(onto.turtle, `${onto.id}.ttl`);
                      setLoadedLibraryIds((prev) => new Set([...prev, onto.id]));
                    }}
                    className="flex-shrink-0 rounded bg-blue-700 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-600"
                  >
                    Load
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import warnings have been moved to the main panel (App.tsx) */}

      {/* Ontology list */}
      <div className="flex-1 overflow-y-auto">
        {ontologies.length === 0 ? (
          <p className="p-3 text-2xs text-th-fg-4">No ontologies yet. Create or import one.</p>
        ) : (
          ontologies.map((onto) => (
            <div
              key={onto.id}
              onClick={() => { setActiveOntology(onto.id); setPendingDeleteId(null); }}
              className={`group cursor-pointer px-2 py-2 ${
                onto.id === activeOntologyId
                  ? "bg-th-hover text-th-fg"
                  : "text-th-fg-3 hover:bg-th-surface hover:text-th-fg"
              }`}
            >
              <div className="flex items-center gap-1">
                <ChevronRight
                  size={12}
                  className={`flex-shrink-0 ${onto.id === activeOntologyId ? "text-blue-400" : "text-th-fg-4"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-xs">
                    <span className="truncate">{onto.metadata.ontologyLabel || "Untitled"}</span>
                    {onto.metadata.versionInfo && (
                      <span className="flex-shrink-0 rounded bg-th-input px-1 font-mono text-2xs text-th-fg-3">
                        v{onto.metadata.versionInfo}
                      </span>
                    )}
                  </div>
                  <div className="truncate font-mono text-2xs text-th-fg-4">
                    {onto.metadata.baseUri}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDeleteId(onto.id);
                  }}
                  className="flex-shrink-0 rounded p-1 opacity-0 text-th-fg-4 hover:text-red-400 group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Inline delete confirmation (U1) */}
              {pendingDeleteId === onto.id && (
                <div
                  className="mt-1.5 ml-4 space-y-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-2xs text-th-fg-3">
                    Delete &ldquo;{onto.metadata.ontologyLabel || "Untitled"}&rdquo;?
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteOntology(onto.id);
                        setPendingDeleteId(null);
                      }}
                      className="rounded bg-red-700 px-2 py-0.5 text-2xs font-medium text-white hover:bg-red-600"
                    >
                      Delete
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(null);
                      }}
                      className="rounded bg-th-hover px-2 py-0.5 text-2xs text-th-fg-2 hover:bg-th-border"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
