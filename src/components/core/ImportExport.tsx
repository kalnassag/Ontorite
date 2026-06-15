/**
 * Export and save controls for the active ontology.
 *
 * - "Save" writes back to the original file (File System Access API) or
 *   triggers a "Save As" picker / download as fallback.
 * - "Export" downloads in any of the supported formats.
 */

import { useEffect, useCallback, useState } from "react";
import { Download, Save, Check, Loader2 } from "lucide-react";
import { useStore } from "../../lib/store";
import { validate } from "../../lib/validation";
import {
  FORMAT_EXTENSION,
  FORMAT_LABEL,
  FORMAT_MIME,
  type SerializationFormat,
} from "../../lib/formats";

const ALL_FORMATS: SerializationFormat[] = ["turtle", "jsonld", "rdfxml", "ntriples"];

export default function ImportExport() {
  const exportAs = useStore((s) => s.exportAs);
  const saveToFile = useStore((s) => s.saveToFile);
  const activeOntology = useStore((s) => s.getActiveOntology());
  const hasFileHandle = useStore((s) => s.hasFileHandle);
  const fileSaveInProgress = useStore((s) => s.fileSaveInProgress);
  const lastFileSaveTime = useStore((s) => s.lastFileSaveTime);

  const [format, setFormat] = useState<SerializationFormat>("turtle");
  const [exporting, setExporting] = useState(false);

  const linked = hasFileHandle();

  const handleExport = async () => {
    if (!activeOntology) return;
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
    setExporting(true);
    try {
      const text = await exportAs(format);
      const blob = new Blob([text], { type: `${FORMAT_MIME[format]};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = activeOntology.metadata.ontologyLabel ?? "ontology";
      a.href = url;
      a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.${FORMAT_EXTENSION[format]}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
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
  const savedAgo = lastFileSaveTime ? formatTimeSince(lastFileSaveTime) : null;

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

      {/* Format dropdown */}
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as SerializationFormat)}
        className="rounded bg-th-input px-1 py-0.5 text-2xs text-th-fg-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        title="Export format"
      >
        {ALL_FORMATS.map((f) => (
          <option key={f} value={f}>{FORMAT_LABEL[f]}</option>
        ))}
      </select>

      {/* Export download */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg disabled:opacity-50"
        title={`Export as ${FORMAT_LABEL[format]}`}
      >
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
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
