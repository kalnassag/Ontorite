/**
 * Export and save controls for the active ontology.
 *
 * - "Save" writes back to the original file (File System Access API) or
 *   triggers a "Save As" picker / download as fallback.
 * - "Export .ttl" always triggers a download.
 * - Shows a save status indicator when a file handle is active.
 */

import { useEffect, useCallback } from "react";
import { Download, Save, Check, Loader2 } from "lucide-react";
import { useStore } from "../../lib/store";
import { validate } from "../../lib/validation";

export default function ImportExport() {
  const exportTurtle = useStore((s) => s.exportTurtle);
  const saveToFile = useStore((s) => s.saveToFile);
  const activeOntology = useStore((s) => s.getActiveOntology());
  const hasFileHandle = useStore((s) => s.hasFileHandle);
  const fileSaveInProgress = useStore((s) => s.fileSaveInProgress);
  const lastFileSaveTime = useStore((s) => s.lastFileSaveTime);

  const linked = hasFileHandle();

  const handleExport = () => {
    if (activeOntology) {
      const issues = validate(activeOntology);
      const errors = issues.filter((i) => i.severity === "error");
      if (errors.length > 0) {
        const proceed = window.confirm(
          `This ontology has ${errors.length} validation error${errors.length > 1 ? "s" : ""}:\n\n` +
          errors.map((e) => `• ${e.message}`).join("\n") +
          "\n\nExport anyway?"
        );
        if (!proceed) return;
      }
    }
    const text = exportTurtle();
    const blob = new Blob([text], { type: "text/turtle;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const label = activeOntology?.metadata.ontologyLabel ?? "ontology";
    a.href = url;
    a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.ttl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = useCallback(async () => {
    await saveToFile();
  }, [saveToFile]);

  // Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  if (!activeOntology) return null;

  // Format last save time
  const savedAgo = lastFileSaveTime
    ? formatTimeSince(lastFileSaveTime)
    : null;

  return (
    <div className="flex items-center gap-1.5">
      {/* Save status indicator */}
      {linked && (
        <span className="flex items-center gap-1 text-2xs text-th-fg-4">
          {fileSaveInProgress ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              Saving…
            </>
          ) : savedAgo ? (
            <>
              <Check size={11} className="text-green-500" />
              Saved {savedAgo}
            </>
          ) : null}
        </span>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
        title={linked ? "Save to file (Ctrl+S)" : "Save as… (Ctrl+S)"}
      >
        <Save size={14} />
      </button>

      {/* Export download */}
      <button
        onClick={handleExport}
        className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
        title="Export as .ttl download"
      >
        <Download size={14} />
      </button>
    </div>
  );
}

function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
