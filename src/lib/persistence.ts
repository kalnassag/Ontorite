/**
 * IndexedDB persistence for ontologies using the `idb` library.
 *
 * Schema:
 *   Database: "ontology-editor" (legacy name, retained to preserve existing user data)
 *   Object store: "ontologies" (keyPath: "id")
 *
 * All operations are async. Debouncing and per-ontology scheduling live in
 * store/internals.ts; this module only talks to IndexedDB.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Ontology } from "../types";

const DB_NAME = "ontology-editor";
// v2 adds the "references" store (cached external ontologies, e.g. owl:imports)
const DB_VERSION = 2;
const STORE_NAME = "ontologies";
const REFERENCES_STORE = "references";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(REFERENCES_STORE)) {
          db.createObjectStore(REFERENCES_STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/** Load all saved ontologies */
export async function loadAllOntologies(): Promise<Ontology[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

/** Save or update a single ontology */
export async function saveOntology(ontology: Ontology): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, {
    ...ontology,
    updatedAt: new Date().toISOString(),
  });
}

/** Delete an ontology by ID */
export async function deleteOntology(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

// ── Reference ontologies (read-only external sources) ────────────────────

/** A cached copy of an external ontology, stored as its original text. */
export interface StoredReference {
  id: string;
  /** The IRI it stands for: an owl:imports IRI or a vocabulary namespace */
  iri: string;
  /** Where the text came from: a URL, or a file name */
  origin: string;
  text: string;
  /** Hint for the parser: a file name or URL with an extension, or a content type */
  formatHint: string;
  fetchedAt: string;
  /** The catalogue entry it was added from, if any (lib/references/catalog.ts) */
  catalogId?: string;
  /** Display name and prefix (from the catalogue); otherwise derived from the ontology */
  name?: string;
  prefix?: string;
  /** false = kept in the library but not used for definitions (default: used) */
  enabled?: boolean;
}

export async function loadAllReferences(): Promise<StoredReference[]> {
  const db = await getDb();
  return db.getAll(REFERENCES_STORE);
}

export async function saveReference(ref: StoredReference): Promise<void> {
  const db = await getDb();
  await db.put(REFERENCES_STORE, ref);
}

export async function deleteReference(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(REFERENCES_STORE, id);
}
