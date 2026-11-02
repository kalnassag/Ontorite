/**
 * Export and save-to-disk. Linked files (File System Access API, Chrome/Edge)
 * are written back in place; elsewhere Save falls back to a download.
 */

import { serializeToTurtle } from "../turtle-serializer";
import { serializeFromOntology } from "../formats";
import { getHandle, setHandle, writeToHandle, saveAsTurtleFile, supportsFileSystemAccess } from "../file-access";
import type { Slice } from "./types";

type FileKeys = "lastFileSaveTime" | "fileSaveInProgress" | "exportTurtle" | "exportAs" | "saveToFile";

const fileNameFor = (label: string | undefined) => `${(label || "ontology").toLowerCase().replace(/\s+/g, "-")}.ttl`;

export const fileSlice: Slice<FileKeys> = (set, get, { persist }) => {
  /** Remember which file an ontology now lives in (not an undoable edit). */
  const recordFileName = (id: string, fileName: string) => {
    set((s) => ({ ontologies: s.ontologies.map((o) => (o.id === id ? { ...o, fileName } : o)) }));
    persist(id);
  };

  return {
  lastFileSaveTime: null,
  fileSaveInProgress: false,

  exportTurtle: () => {
    const onto = get().getActiveOntology();
    return onto ? serializeToTurtle(onto) : "";
  },

  exportAs: async (format) => {
    const onto = get().getActiveOntology();
    return onto ? serializeFromOntology(onto, format) : "";
  },

  saveToFile: async () => {
    const onto = get().getActiveOntology();
    if (!onto) return false;
    const turtle = serializeToTurtle(onto);

    const existing = getHandle(onto.id);
    if (existing) {
      set({ fileSaveInProgress: true });
      const ok = await writeToHandle(existing, turtle);
      set((s) => ({ fileSaveInProgress: false, lastFileSaveTime: ok ? Date.now() : s.lastFileSaveTime }));
      return ok;
    }

    if (supportsFileSystemAccess()) {
      const handle = await saveAsTurtleFile(turtle, fileNameFor(onto.metadata.ontologyLabel));
      if (!handle) return false;
      setHandle(onto.id, handle);
      recordFileName(onto.id, handle.name);
      set({ lastFileSaveTime: Date.now() });
      return true;
    }

    // Fallback: trigger a download
    const url = URL.createObjectURL(new Blob([turtle], { type: "text/turtle;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileNameFor(onto.metadata.ontologyLabel);
    a.click();
    URL.revokeObjectURL(url);
    recordFileName(onto.id, a.download);
    return true;
  },
  };
};
