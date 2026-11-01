/**
 * The edit pipeline every mutation goes through: per-ontology undo snapshots
 * and debounced, per-ontology persistence (IndexedDB + linked file).
 *
 * Saves are keyed by ontology ID, so switching ontologies before the debounce
 * fires can never drop (or misdirect) an edit.
 */

import type { Ontology } from "../../types";
import { saveOntology } from "../persistence";
import { serializeToTurtle } from "../turtle-serializer";
import { getHandle, hasHandle, writeToHandle } from "../file-access";
import type { GetState, SetState, StoreInternals } from "./types";

export const HISTORY_LIMIT = 50;
const DB_DEBOUNCE_MS = 500;
const FILE_DEBOUNCE_MS = 1000;

const pendingDb = new Set<string>();
const pendingFile = new Set<string>();
let dbTimer: ReturnType<typeof setTimeout> | undefined;
let fileTimer: ReturnType<typeof setTimeout> | undefined;
let flushers: { db: () => Promise<void>; file: () => Promise<void> } | null = null;

/** Write every pending save immediately (call on page hide / unload). */
export async function flushPendingSaves(): Promise<void> {
  if (!flushers) return;
  clearTimeout(dbTimer);
  clearTimeout(fileTimer);
  await Promise.all([flushers.db(), flushers.file()]);
}

export function createInternals(set: SetState, get: GetState): StoreInternals {
  const find = (id: string): Ontology | undefined => get().ontologies.find((o) => o.id === id);

  const flushDb = async () => {
    const ids = [...pendingDb];
    pendingDb.clear();
    await Promise.all(ids.map((id) => {
      const onto = find(id);
      return onto ? saveOntology(onto) : undefined;
    }));
  };

  const flushFile = async () => {
    const ids = [...pendingFile];
    pendingFile.clear();
    for (const id of ids) {
      const onto = find(id);
      const handle = getHandle(id);
      if (!onto || !handle) continue;
      set({ fileSaveInProgress: true });
      const ok = await writeToHandle(handle, serializeToTurtle(onto));
      set((s) => ({ fileSaveInProgress: false, lastFileSaveTime: ok ? Date.now() : s.lastFileSaveTime }));
    }
  };
  flushers = { db: flushDb, file: flushFile };

  const persist = (id: string) => {
    pendingDb.add(id);
    clearTimeout(dbTimer);
    dbTimer = setTimeout(flushDb, DB_DEBOUNCE_MS);
    if (hasHandle(id)) {
      pendingFile.add(id);
      clearTimeout(fileTimer);
      fileTimer = setTimeout(flushFile, FILE_DEBOUNCE_MS);
    }
  };

  const cancelPersist = (id: string) => {
    pendingDb.delete(id);
    pendingFile.delete(id);
  };

  const commit: StoreInternals["commit"] = (updater) => {
    const id = get().activeOntologyId;
    if (!id) return;
    let changed = false;
    set((s) => {
      const current = s.ontologies.find((o) => o.id === id);
      if (!current) return {};
      const next = updater(current);
      if (next === current) return {};
      changed = true;
      const past = s.history[id]?.past ?? [];
      return {
        ontologies: s.ontologies.map((o) => (o.id === id ? next : o)),
        history: { ...s.history, [id]: { past: [...past.slice(-(HISTORY_LIMIT - 1)), current], future: [] } },
      };
    });
    if (changed) persist(id);
  };

  return { commit, persist, cancelPersist };
}
